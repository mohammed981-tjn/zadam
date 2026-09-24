import { createClient } from "@/lib/supabase/server";

/**
 * Who is looking, as the /nafir pages need to know it: signed in or not, the
 * name to pre-fill under their acts, and whether they may verify leaders.
 *
 * The name is only a default in a form field — every act asks for the name to
 * show and stores what was typed, so consent to be seen is given per act.
 */
export async function nafirViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, name: "", isAdmin: false };
  const { data } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = data as { full_name: string | null; role: string } | null;
  return { supabase, user, name: p?.full_name ?? "", isAdmin: p?.role === "admin" };
}
