import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEngines, generateWithFallback } from "@/lib/engines";

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
      describe("GEMINI_API_KEY", geminiKey),
      describe("OPENROUTER_API_KEY", openRouterKey),
    ],
    engineChain: engines.map((e) => e.name),
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
      answeredBy: result?.engine ?? null,
      // Reasons are provider error text; they carry status codes and messages,
      // never the key itself.
      failures: attempts,
    };
  }

  return NextResponse.json(report);
}
