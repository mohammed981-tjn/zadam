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
  return networkOf(
    headers.get("x-real-ip") ??
      forwarded?.split(",").pop()?.trim() ??
      "unknown",
  );
}

/**
 * What a limiter should count as «one caller». An IPv4 address is one; an IPv6 subscriber is given
 * a whole /64 (2^64 addresses) by the provider, so counting the full address lets one phone line
 * rotate through as many callers as it likes (SEC-9). An IPv6 address is cut to its first four
 * groups; anything else is kept as it came.
 */
export function networkOf(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]; // an IPv4 address in IPv6 dress is still that address
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  if (ip.includes("::")) {
    const right = tail ? tail.split(":") : [];
    const zeros = Array(Math.max(0, 8 - left.length - right.length)).fill("0");
    left.push(...zeros, ...right);
  }
  if (left.length !== 8 || left.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return ip;
  return left.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
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


/**
 * The daily ceiling on the paid model (SEC-9): per address and for the platform, counted in the
 * database (check_model_budget), where the two numbers also live. Asked right before a call that
 * would cost money — never for an answer the platform gives from its own tables.
 *
 * «unavailable» is a refusal: if the count cannot be read, the model is not called. Without a
 * service-role key there is no shared counter to read; that deployment keeps the per-instance
 * minute counter only, as everywhere else in this file.
 */
export type ModelBudget = "ok" | "address_day" | "total_day" | "unavailable";

export async function checkModelBudget(ip: string): Promise<ModelBudget> {
  const admin = createAdminClient();
  if (!admin) return "ok";

  const { data, error } = await admin.rpc("check_model_budget", { p_ip: `model:${ip}` });
  if (error) {
    console.error("rate-limit: model budget check failed", error);
    return "unavailable";
  }
  return data === "ok" || data === "address_day" || data === "total_day" ? data : "unavailable";
}
