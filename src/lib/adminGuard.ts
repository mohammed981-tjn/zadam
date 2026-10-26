import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AdminState = "ok" | "needs_second_factor" | "not_admin";

/**
 * What the database says this session is (AUTH-04, backlog 141): an administrator only with the second factor in the
 * session, unless the administration switched that off. Before the migration that added it reaches a database, the
 * role alone answers, as it did.
 */
export async function adminState(supabase: SupabaseClient, userId: string): Promise<AdminState> {
  const { data, error } = await supabase.rpc("admin_session_state");
  if (!error && typeof data === "string") return data as AdminState;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (profile as { role?: string } | null)?.role === "admin" ? "ok" : "not_admin";
}

/**
 * The administrator check, in one place.
 *
 * Server Functions are reachable by a direct POST, not only through the screen
 * that renders their form — so rendering an admin page is not what makes an
 * admin action safe. Each action has to establish the caller itself.
 *
 * Two admin modules were doing that with their own copy of this, and two
 * others — feedback and providers — were doing it nowhere at all. Those two
 * were not exploitable: RLS refuses the writes (`feedback_admin_write`,
 * `providers_verify`), and that is the boundary that actually holds. But a
 * refusal by RLS returns no error and no rows, so a non-admin POSTing to
 * replyToFeedback was answered with "حُفظ الردّ" while nothing was written —
 * and the same false confirmation would greet a real admin if a policy ever
 * stopped matching.
 *
 * This is the app-side half: it makes the refusal visible and immediate. It is
 * defence in depth, never the boundary — that stays in the database, where
 * PostgREST callers meet it too.
 *
 * No "server-only" import: this module is only reachable through "use server"
 * files, and the Supabase server client it builds calls cookies(), which
 * already fails outside a request. Not worth a dependency.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const state = await adminState(supabase, user.id);
  if (state === "not_admin") redirect("/dashboard");
  // The admin pages ask for the second factor themselves (app/admin/layout.tsx).
  if (state === "needs_second_factor") redirect("/admin");

  return { supabase, user };
}
