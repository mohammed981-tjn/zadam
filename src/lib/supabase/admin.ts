import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A client that acts as the project itself, for the one job that needs it.
 *
 * Creating an account for a phone number means creating it already confirmed:
 * the address the number is folded into cannot receive a confirmation link, so
 * an unconfirmed account would be one nobody could ever sign into. The ordinary
 * signup call cannot do that — only the admin API can, and only with the service
 * role key.
 *
 * That key bypasses row-level security completely. Three rules keep it
 * contained: it is read from the environment and never shipped to the browser
 * (no NEXT_PUBLIC_ prefix, so Next.js will not inline it into client code), this
 * module refuses to run outside the server, and its callers are counted. Every
 * other query in the platform goes through the anon client and stays subject to
 * RLS.
 *
 * THE CALLERS, AND WHY EACH NEEDS THIS RATHER THAN A SESSION
 *
 *   1. Phone signup — creates one already-confirmed user, per the above. Only
 *      the admin API can do that.
 *   2. The embedding backfill behind the /admin button — writes vectors onto
 *      existing knowledge entries. It runs as the project rather than as the
 *      signed-in administrator so the write does not depend on which policy
 *      happens to match a session, and because an RLS refusal returns no error
 *      and no rows: the button would report success over a write that never
 *      landed. It is still admin-gated by `requireAdmin` before it is reached,
 *      and it can only set three embedding columns on rows that already exist.
 *
 *   3. The daily price run (backlog 131), from /api/health and from the
 *      «حدّث الأسعار الآن» button on /admin/prices, which checks the caller is
 *      an administrator first. A scheduled job has no visitor to act as; it
 *      writes only rows in market_quotes and price_runs.
 *
 *   4. The contact and feedback forms (/api/leads, /api/feedback; backlog 198,
 *      D9). The public key holds no INSERT on those tables any more, so one
 *      script cannot fill their hourly ceiling and shut the forms for everyone;
 *      the routes limit each address first and build the row from a few fields.
 *
 *   5. The studies and research library (/api/research, /library/[id],
 *      /admin/library; backlog 202). Anyone may send a work, so the public key
 *      holds no INSERT on the table: the route limits each address and writes
 *      the row pending; it also makes the one-path upload link into the
 *      private bucket, and the pages make hour-long download links — for a
 *      published work, or for the administrator reviewing one.
 *
 * A further caller is a decision, not a detail. Add it to this list.
 */

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient must never run in the browser.");
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    // Nothing here is a user session: no cookie to write, no token to refresh.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
