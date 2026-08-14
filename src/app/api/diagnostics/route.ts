import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import { activeProvider } from "@/lib/embedding";

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
    ],
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

    const supabase = await createClient();
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip =
      req.headers.get("x-real-ip") ??
      forwardedFor?.split(",").pop()?.trim() ??
      "unknown";

    const { data: allowed } = await supabase.rpc(
      "check_assistant_rate_limit",
      { p_ip: ip },
    );

    if (allowed === false) {
      report.probe = { ran: false, reason: "تجاوزت حد الطلبات، انتظر دقيقة" };
      return NextResponse.json(report, { status: 429 });
    }

    const { result, attempts } = await generateWithFallback(
      engines,
      "أجب بكلمة واحدة فقط.",
      "قل: تمام",
    );

    report.probe = {
      ran: true,
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
