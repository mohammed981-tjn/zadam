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
 * module refuses to run outside the server, and the only caller is the signup
 * action, which uses it to create one user and nothing else. Every other query
 * in the platform goes through the anon client and stays subject to RLS.
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
