"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in farmer's active seasons, for choosing where a kept entry goes (backlog 184). Asked only once the
 * phone is online, and never part of the page itself: the page is a blank form the service worker may keep, so it
 * must not carry anyone's seasons.
 */
export async function myActiveSeasons(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return (data ?? []) as { id: string; name: string }[];
}
