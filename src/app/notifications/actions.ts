"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";

/**
 * Marks notices as read.
 *
 * No ownership check is written here on purpose: row-level security restricts
 * both the update and the rows it can see to the caller's own, and a database
 * trigger refuses any edit that touches a column other than read_at. Repeating
 * the check in the action would give the impression that the action is what
 * protects the inbox, which would be the wrong thing to believe when someone
 * later adds a second way in.
 */
export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (ids && ids.length > 0) query = query.in("id", ids);

  const { error } = await query;
  if (error) return { ok: false, message: error.message };

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Form-action wrapper. A `<form action>` must resolve to void, so the result is
 * consumed here; a failure leaves the notices unread, which the page already
 * shows, so the reader sees the true state and can simply press again.
 */
export async function markAllRead(): Promise<void> {
  const result = await markNotificationsRead();
  if (!result.ok) {
    console.error("notifications: mark all read failed", result.message);
  }
}

/**
 * «إشعارات الجوّال» (البند ٢٠٧): the account's switch for the phone app's notifications, the same one «حسابي» shows
 * in the app. The database files it under the session's own user (push_app_set); nothing to check here.
 */
export async function setAppPush(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const { error } = await supabase.rpc("push_app_set", { p_enabled: formData.get("enabled") === "on" });
  if (error) console.error("notifications: phone switch failed", error.message);
  revalidatePath("/notifications");
}
