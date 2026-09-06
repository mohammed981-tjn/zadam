import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * عميلٌ بلا جلسة — للصفحات المرجعيّة التي لا تعرف قارئَها ولا تحتاج أن تعرفه.
 *
 * WHY A SECOND CLIENT EXISTS AT ALL
 *
 * `lib/supabase/server.ts` reads cookies, and reading cookies in a Server
 * Component opts the whole route out of caching: Next.js has to render it per
 * request because the output could differ per visitor. That is correct for
 * `/lands` and `/seasons`, and wasteful for `/knowledge`, whose 152 entries are
 * the same rows for every reader and change a few times a month.
 *
 * The measured cost is egress, not compute. Supabase's free tier allows 5 GB a
 * month, every render of a reference page pulls its whole table across, and the
 * keep-alive job requests one of these pages daily on its own. Caching turns a
 * thousand identical queries into one.
 *
 * WHY THE ANON KEY AND NOT THE SERVICE KEY
 *
 * This client is for public data and must stay that way. The anon key means
 * row-level security still applies exactly as it does to a logged-out visitor —
 * so a page built with it can never render a row a stranger could not see,
 * cached or not. Using the service key here would make a caching decision into
 * a disclosure decision.
 *
 * THE RULE FOR USING IT
 *
 * Only on a route that renders the same HTML for everyone. The moment a page
 * needs `auth.getUser()`, it needs the session client and it cannot be cached —
 * and a cached page built from someone's session would be served to the next
 * visitor, which is the worst bug in this file's neighbourhood.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
