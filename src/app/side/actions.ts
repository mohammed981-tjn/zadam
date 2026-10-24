"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * «أرضي | استثماري» — one account on both sides (backlog 151).
 *
 * The owner, 24 October: an investor who owns land could not offer it, and a
 * farmer who wants to invest could not invest, «because he is in a farmer's
 * account». The database never asked (scripts/verify-either-side.sh); the
 * screens did, by naming the account one kind and sending each kind to a
 * different home. Airbnb («Switch to hosting / traveling») and Upwork (one
 * login, switch from the account menu) keep one account and switch the view.
 *
 * So switching only says which side the person is on now: `profiles.role`
 * moves between 'farmer' and 'investor' — the one change
 * `prevent_self_role_escalation` lets a person make for themselves — and that
 * decides where the next sign-in opens. An administrator stays one; nothing
 * either side can do depends on it.
 */
export async function switchSide(fd: FormData) {
  const side = String(fd.get("side") ?? "") === "investor" ? "investor" : "farmer";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("profiles").update({ role: side }).eq("id", user.id).in("role", ["farmer", "investor"]);
  revalidatePath("/", "layout");
  redirect(side === "investor" ? "/invest" : "/lands");
}
