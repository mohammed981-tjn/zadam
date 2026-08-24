import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Throttling for the public API routes.
 *
 * Four routes share one database function — assistant, feedback, leads and the
 * diagnostics probe — each with its own bucket prefix. They are all here
 * because they all have to move together: the function is now callable only by
 * the service role, so a route still calling it with the session client gets an
 * error instead of a verdict, and every one of these routes treated an error as
 * "carry on".
 *
 * The database function is the real limiter — one shared counter across every
 * serverless instance. It is callable only by the service role, because it
 * takes the client IP as an argument: published to `anon`, it let anyone lock a
 * chosen visitor out by naming their address, and grow assistant_requests
 * without bound by naming random ones.
 *
 * Two things follow from that, and both matter:
 *
 *  1. When the limiter is reachable, a failure must CLOSE. The thing it guards
 *     is a paid model; an unavailable limiter is the moment you least want the
 *     door left open. The previous behaviour logged the error and continued.
 *
 *  2. When no service-role key is configured the limiter is not reachable at
 *     all, and refusing every question would take the assistant down on that
 *     deployment. The route already degrades rather than breaks when a model
 *     key is missing, so it degrades here too: a per-instance counter, which is
 *     weaker — each instance counts separately and a cold start forgets — but
 *     is not nothing, and is reported honestly as `tier`.
 */

export type RateVerdict = {
  allowed: boolean;
  tier: "database" | "in-process" | "unavailable";
};

/**
 * Whether a failure to consult the limiter should block the request is the
 * caller's decision, not this module's — it differs per route and the reasons
 * are real. The assistant guards a paid model and closes; a sales lead is worth
 * more than the spam it might admit and passes. So this returns the verdict and
 * the tier, and each route decides what "unavailable" means for it.
 */

/** Requests per minute per address, matching the database function. */
const LIMIT_PER_MINUTE = 5;
const WINDOW_MS = 60_000;
const MAX_TRACKED = 5_000;

const hits = new Map<string, number[]>();

function takeInProcess(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT_PER_MINUTE) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  // Re-inserting moves the key to the end of Map iteration order, so the
  // eviction below drops the least recently seen address rather than a random
  // one.
  hits.delete(key);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }

  return true;
}

/**
 * Resolves the connecting address.
 *
 * The leftmost x-forwarded-for entry is written by the client and is spoofable;
 * the last entry is the one the edge appends for the real connection. This is
 * the ordering the route already used, and it is the correct one — much of the
 * advice in circulation says to take the first.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return (
    headers.get("x-real-ip") ??
    forwarded?.split(",").pop()?.trim() ??
    "unknown"
  );
}

export async function checkRateLimit(
  scope: string,
  ip: string,
): Promise<RateVerdict> {
  const key = `${scope}:${ip}`;
  const admin = createAdminClient();

  if (!admin) {
    console.warn(
      "rate-limit: SUPABASE_SERVICE_ROLE_KEY is not set for this deployment, so " +
        "the shared rate limiter is unreachable and a weaker per-instance " +
        "counter is being used. Set it in the Vercel project's environment " +
        "variables (Production, Preview and Development) and redeploy. Value: " +
        "Supabase dashboard → Project Settings → API → service_role key.",
    );
    return { allowed: takeInProcess(key), tier: "in-process" };
  }

  const { data, error } = await admin.rpc("check_assistant_rate_limit", {
    p_ip: key,
  });

  if (error) {
    console.error("rate-limit: check failed", { scope, error });
    return { allowed: false, tier: "unavailable" };
  }

  return { allowed: data !== false, tier: "database" };
}
