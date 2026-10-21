import { NextRequest, NextResponse } from "next/server";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import { activeProvider } from "@/lib/embedding";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";
import { bearerMatches } from "@/lib/cronAuth";

/**
 * What the deployment actually sees.
 *
 * Diagnosing "the assistant says no engine is configured" from outside the
 * deployment is guesswork: the key looks right in the dashboard, it works when
 * pasted into a browser, and the app still behaves as though it has none. Every
 * candidate explanation — variable scoped to the wrong environment, a redeploy
 * that never happened, a space pasted along with the value — looks identical
 * from the outside, and each round of guessing costs a deploy.
 *
 * So the deployment reports what it sees. Nothing here is a secret: booleans,
 * a length, and the first four characters, which distinguish a permanent key
 * from an ephemeral token without revealing anything usable. The one that has
 * actually bitten us — trailing whitespace on a pasted value — is invisible in
 * every dashboard and is reported explicitly.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Patterns that are credentials wherever they appear.
 *
 * This endpoint exists to be pasted into a chat or an issue, which makes it the
 * last place a secret should ever surface. It already withholds the values it
 * reads deliberately — but a misconfiguration can route a key somewhere this
 * code never meant it to go, and that is exactly what happened: an OpenRouter
 * key pasted into OPENROUTER_MODELS became a "model id", travelled into the
 * engine name and the provider's error text, and was published in full by the
 * very report meant to be safe to share.
 *
 * So nothing is trusted to be non-secret because of where it came from. Every
 * string on the way out is scanned for credential shapes and masked.
 */
const CREDENTIAL_PATTERNS = [
  /sk-or-v1-[A-Za-z0-9]{16,}/g, // OpenRouter
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API key
  /AQ\.[A-Za-z0-9._-]{20,}/g, // Google short-lived token
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g, // Supabase
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, // JWT
];

function looksLikeCredential(text: string | undefined): boolean {
  if (!text) return false;
  return CREDENTIAL_PATTERNS.some((p) => {
    p.lastIndex = 0; // the patterns are /g, so their cursor has to be reset
    return p.test(text);
  });
}

function redact(text: string): string {
  let safe = text;
  for (const pattern of CREDENTIAL_PATTERNS) {
    safe = safe.replace(pattern, (match) => `[محجوب:${match.length} حرفاً]`);
  }
  return safe;
}

function describe(name: string, raw: string | undefined) {
  if (!raw) return { name, configured: false };

  const trimmed = raw.trim();
  return {
    name,
    configured: true,
    length: raw.length,
    // The bug that cost an afternoon: a value pasted with a space survives every
    // dashboard unchanged and fails every request.
    hasSurroundingWhitespace: raw !== trimmed,
    // Four characters cannot be used to authenticate; they can tell an AIza…
    // API key apart from an AQ.… short-lived token, which behave very
    // differently and fail the same way.
    startsWith: trimmed.slice(0, 4),
  };
}

export async function GET(req: NextRequest) {
  /*
   * Closed, and closed by default — unlike /api/health next door.
   *
   * That route makes its secret optional and says why: it exposes counts and
   * nothing else, so serving it openly costs little. This one is different in
   * kind. It reports which providers are configured, the first characters and
   * length of each key, the embedding model in use, and the exact commit and
   * branch serving the request. None of that is a credential, and all of it
   * tells someone probing the platform precisely where to aim.
   *
   * So the asymmetry is deliberate rather than copied: a missing CRON_SECRET
   * closes this endpoint instead of opening it. A diagnostics route that fails
   * open is a diagnostics route for whoever finds it first, and the whole
   * reason this file exists — the OpenRouter key that leaked through a provider
   * error message into a report meant to be safe to share — is an argument
   * about exactly this: reports about configuration deserve more care than the
   * configuration they describe, not less.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "التشخيص مغلق — لم يُضبط CRON_SECRET" },
      { status: 503 },
    );
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const embedder = activeProvider();
  const engines = buildEngines({
    geminiKey,
    openRouterKey,
    openRouterModels: process.env.OPENROUTER_MODELS,
  });

  const report = {
    checkedAt: new Date().toISOString(),
    // Which commit is actually serving this request. When a redeploy has not
    // happened, this is the line that says so.
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    keys: [
      // Embeddings and generation are configured separately, so the report has
      // to name both. Leaving JINA_API_KEY out made a correctly configured
      // embedding provider look absent, which is the exact confusion this
      // endpoint exists to end.
      describe("JINA_API_KEY", process.env.JINA_API_KEY),
      describe("GEMINI_API_KEY", geminiKey),
      describe("OPENROUTER_API_KEY", openRouterKey),
      /*
       * Not an AI key, and reported here anyway.
       *
       * This is the one whose absence breaks a user-facing feature silently:
       * without it the admin API is unreachable, phone signup cannot create a
       * confirmed account, and every visitor registering by number is turned
       * away. It is also the variable most likely to be set for one Vercel
       * environment and not another, which is exactly the failure this endpoint
       * exists to make visible in a single request rather than by testing the
       * signup form on each deployment.
       */
      describe("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    ],
    // Stated as the capability rather than left to be inferred from the key.
    features: {
      phoneSignup: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    embeddings: embedder
      ? { provider: embedder.model, minSimilarity: embedder.minSimilarity }
      : null,
    engineChain: engines.map((e) => redact(e.name)),
    // Named rather than merely masked: a key sitting in OPENROUTER_MODELS
    // produces "not a valid model ID" from the provider, which reads like a
    // stale model name and sends you looking in the wrong place entirely.
    warnings: looksLikeCredential(process.env.OPENROUTER_MODELS)
      ? [
          "OPENROUTER_MODELS يحتوي ما يشبه مفتاحاً. المفتاح مكانه OPENROUTER_API_KEY، وهذا المتغيّر لمعرّفات النماذج فقط — احذفه أو ضع فيه معرّفات مثل deepseek/deepseek-chat-v3-0324:free. واعتبر المفتاح مكشوفاً وأبطِله.",
        ]
      : [],
    probe: null as unknown,
  };

  // A live call, only when asked for. It costs quota, so it is rate limited by
  // the same per-IP limiter the assistant uses rather than left open.
  if (req.nextUrl.searchParams.get("probe") === "1") {
    if (engines.length === 0) {
      report.probe = { ran: false, reason: "لا يوجد محرك مضبوط أصلاً" };
      return NextResponse.json(report);
    }
    /*
     * The shared helper rather than a fourth copy of the same three lines.
     *
     * The copy here was identical — including the `.pop()` that takes the edge's
     * appended entry instead of the client-written leftmost one — so nothing
     * changes today. But address resolution is exactly the kind of rule that is
     * corrected in one place and left wrong in the others: get it backwards and
     * any caller picks their own rate-limit bucket by sending a header.
     */
    const verdict = await checkRateLimit("diagnostics", clientAddress(req.headers));

    if (!verdict.allowed && verdict.tier !== "unavailable") {
      report.probe = { ran: false, reason: "تجاوزت حد الطلبات، انتظر دقيقة" };
      return NextResponse.json(report, { status: 429 });
    }

    /*
     * A realistic payload, not a token.
     *
     * The probe used to send "say: ok", which passed while the assistant itself
     * failed — and that gap is worse than no probe at all, because it points
     * confidently at the wrong half of the system. A one-word prompt exercises
     * authentication and nothing else: not the context length a free model will
     * accept, not the per-day token allowance, not whatever the router picks
     * when the request is large.
     *
     * So the probe now sends roughly what a real question sends: the assistant's
     * own system prompt plus a knowledge-sized block. If the real path fails,
     * this fails the same way and says why.
     */
    const filler = "مُدخَل معرفي عن الري والتربة والمحاصيل في السودان. ".repeat(
      120,
    );

    const { result, attempts } = await generateWithFallback(
      engines,
      "أنت مساعد زراعي يجيب بالعربية باختصار شديد.",
      `قاعدة المعرفة الزراعية (نموذج بحجم واقعي):\n${filler}\n\nسؤال الزائر: قل كلمة تمام فقط.`,
    );

    report.probe = {
      ran: true,
      // Roughly what a real question weighs, so a limit that only bites at size
      // is visible here rather than only in production.
      approxPromptChars: filler.length,
      answeredBy: result ? redact(result.engine) : null,
      // Provider error text quotes back whatever it was sent, so a
      // misconfigured value arrives here verbatim. Masked on the way out.
      failures: attempts.map((a) => ({
        engine: redact(a.engine),
        reason: redact(a.reason),
      })),
    };
  }

  return NextResponse.json(report);
}
