/**
 * The chain of language models behind the assistant.
 *
 * The platform answers what it can from its own engines and knowledge base
 * first — see localAnswer.ts — and only what survives that reaches a model. But
 * what did reach one used to reach exactly one, and a free tier is not a
 * dependable thing to hang a feature on: quotas exhaust mid-afternoon, free
 * models get retired without notice, and a provider having a bad hour looked
 * identical to the assistant being broken.
 *
 * So the model call is a chain rather than a call. Each engine is tried in
 * order and the first that answers wins; an engine that is unconfigured is
 * skipped, and one that fails, times out, or is rate-limited hands on to the
 * next instead of ending the request. Running out of engines entirely is still
 * survivable — the caller degrades to the nearest knowledge entries.
 *
 * Order is deliberate: Gemini first because the knowledge base and the prompt
 * were tuned against it, then the OpenRouter free pool as the standby.
 */

export interface EngineAttempt {
  engine: string;
  reason: string;
}

export interface EngineResult {
  text: string;
  /** Which engine produced it, for the response body and the logs. */
  engine: string;
  /** Engines tried and rejected before this one answered. */
  attempts: EngineAttempt[];
}

export interface Engine {
  name: string;
  generate(system: string, user: string): Promise<string>;
}

class EngineFailure extends Error {}

/**
 * Per-engine ceiling. A visitor is waiting, and the whole point of a chain is
 * that a slow provider costs a few seconds rather than the answer — so an engine
 * that has not replied by now is treated as one that will not.
 */
const ENGINE_TIMEOUT_MS = 25000;

/* ------------------------------------------------------------------ *
 * Gemini
 * ------------------------------------------------------------------ */

function geminiEngine(apiKey: string, model = "gemini-flash-latest"): Engine {
  return {
    name: `gemini/${model}`,
    async generate(system, user) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Header rather than ?key=. A secret in a URL is copied into proxy
            // logs, APM traces, and any error that echoes the request URL —
            // including, once, a diagnostics report meant to be safe to paste.
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: 3072, temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
        },
      );

      if (!res.ok) {
        throw new EngineFailure(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }

      const data = await res.json();

      /*
       * Join every part rather than reading the first. The model may split an
       * answer across parts, and it can emit a reasoning part before the reply —
       * taking parts[0] blindly returns a thought or nothing at all. Parts
       * flagged as thoughts are dropped; they are not for the reader.
       */
      type Part = { text?: string; thought?: boolean };
      const parts: Part[] = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();

      if (!text) throw new EngineFailure("empty response");
      return text;
    },
  };
}

/* ------------------------------------------------------------------ *
 * OpenRouter
 * ------------------------------------------------------------------ */

/**
 * One entry, and it is a router rather than a model: OpenRouter picks from
 * whatever is actually free at request time.
 *
 * Naming free models was tried twice and failed twice in production. First the
 * named models were retired — 404, "this model is unavailable for free" — which
 * took the whole standby chain out while the key and the wiring were fine. Then
 * the router was added with the named models kept behind it as a hedge, and
 * that failed too, for a reason worth writing down:
 *
 *   OpenRouter validates every id in the `models` array before it routes
 *   anywhere. One bad id answers 400 for the entire request. A fallback list is
 *   therefore only as reliable as its *worst* entry — the opposite of what a
 *   fallback is for.
 *
 * So the hedge was the bug. The router alone already does inside one request
 * what the list was trying to do across several, and it cannot go stale.
 * OPENROUTER_MODELS still overrides this without touching code; the live pool
 * is at https://openrouter.ai/models?max_price=0.
 */
const DEFAULT_OPENROUTER_MODELS = ["openrouter/free"]

/**
 * OpenRouter rejects a routing list longer than this — "'models' array must
 * have 3 items or fewer", HTTP 400, which fails the whole request rather than
 * routing to the first three. Sending five in one call silently disabled the
 * entire standby pool.
 *
 * The pool is not truncated to fit. It is split across several engines of three,
 * so the chain still reaches every model: server-side routing inside each
 * request, and this module's own fallback between them.
 */
const OPENROUTER_MODELS_PER_REQUEST = 3;

function openRouterEngine(apiKey: string, models: string[]): Engine {
  return {
    name: `openrouter/${models[0]}`,
    async generate(system, user) {
      const res = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            // Optional attribution headers OpenRouter uses for its rankings.
            "HTTP-Referer": "https://sudagri.vercel.app",
            "X-Title": "SudAgri",
          },
          body: JSON.stringify({
            // OpenRouter routes down this list itself, so one request covers
            // several models: one that is unavailable, retired or rate limited
            // is passed over server-side without another round trip. The list
            // is capped at three by the API — see OPENROUTER_MODELS_PER_REQUEST.
            model: models[0],
            models: models.slice(1, OPENROUTER_MODELS_PER_REQUEST),
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 3072,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
        },
      );

      if (!res.ok) {
        throw new EngineFailure(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }

      const data = await res.json();
      const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();

      if (!text) throw new EngineFailure("empty response");
      return text;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Assembling and running the chain
 * ------------------------------------------------------------------ */

export interface EngineEnv {
  geminiKey?: string;
  openRouterKey?: string;
  /** Comma-separated override for the free pool. */
  openRouterModels?: string;
}

/**
 * Builds the chain from whatever is configured. An absent key is not an error:
 * it means that engine is simply not part of the chain, so the platform runs on
 * one provider, or five, or none, without a code change.
 */
export function buildEngines(env: EngineEnv): Engine[] {
  const engines: Engine[] = [];

  /*
   * Two Gemini entries: the alias first, a pinned id behind it.
   *
   * "gemini-flash-latest" is an alias, chosen so that a model retirement does
   * not take the assistant down — the failure that cost the OpenRouter chain
   * twice, argued at length above. But an alias is Google's pointer, not ours.
   * It has been repointed before, and when one goes it answers 404, which from
   * outside the deployment is indistinguishable from a bad key.
   *
   * The pinned id costs nothing to carry, and note why it is safe here when the
   * equivalent was the bug for OpenRouter: these are two separate requests, so
   * a stale id fails only its own call. OpenRouter validates its whole `models`
   * array before routing, which is what made a list there only as reliable as
   * its worst entry.
   */
  if (env.geminiKey) {
    engines.push(geminiEngine(env.geminiKey));
    engines.push(geminiEngine(env.geminiKey, "gemini-2.5-flash"));
  }

  if (env.openRouterKey) {
    const configured = (env.openRouterModels ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const pool =
      configured.length > 0 ? configured : DEFAULT_OPENROUTER_MODELS;

    // Split rather than truncate: OpenRouter caps one request's routing list at
    // three, so a pool of five becomes two engines the chain falls through
    // instead of two models nobody can reach.
    for (let i = 0; i < pool.length; i += OPENROUTER_MODELS_PER_REQUEST) {
      engines.push(
        openRouterEngine(
          env.openRouterKey,
          pool.slice(i, i + OPENROUTER_MODELS_PER_REQUEST),
        ),
      );
    }
  }

  return engines;
}

/**
 * Tries each engine in turn and returns the first answer.
 *
 * Returns null only when every engine has been tried and failed, which is the
 * caller's signal to fall back to the knowledge base rather than to error. The
 * attempts are carried on the result so a chain that limped to an answer is
 * visible in the logs rather than looking identical to a clean first hit.
 */
export async function generateWithFallback(
  engines: Engine[],
  system: string,
  user: string,
): Promise<{ result: EngineResult | null; attempts: EngineAttempt[] }> {
  const attempts: EngineAttempt[] = [];

  for (const engine of engines) {
    try {
      const text = await engine.generate(system, user);
      return { result: { text, engine: engine.name, attempts }, attempts };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`assistant: engine ${engine.name} failed — ${reason}`);
      attempts.push({ engine: engine.name, reason });
    }
  }

  return { result: null, attempts };
}
