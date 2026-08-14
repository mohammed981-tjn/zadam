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
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
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
 * The free models the standby pool draws on, best-first.
 *
 * Which models carry a `:free` tag changes on OpenRouter's schedule, not ours,
 * so this list is a default rather than a fixture: set OPENROUTER_MODELS to
 * override it without touching code. Check the current pool at
 * https://openrouter.ai/models?max_price=0 — an id that no longer exists is
 * skipped by the routing below rather than breaking the chain, but a list where
 * *every* id is stale leaves no standby at all.
 *
 * Chosen for Arabic competence rather than benchmark averages, since every
 * question this serves is in Arabic.
 */
const DEFAULT_OPENROUTER_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
];

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
            // OpenRouter routes down this list itself, so one request covers the
            // whole free pool: a model that is unavailable, retired or rate
            // limited is passed over server-side without another round trip.
            model: models[0],
            models: models.slice(1),
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

  if (env.geminiKey) engines.push(geminiEngine(env.geminiKey));

  if (env.openRouterKey) {
    const models = (env.openRouterModels ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    engines.push(
      openRouterEngine(
        env.openRouterKey,
        models.length > 0 ? models : DEFAULT_OPENROUTER_MODELS,
      ),
    );
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
