"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbText } from "@/lib/dbText";

export interface IssueResult {
  ok: boolean;
  message: string;
  /** Shown once to the administrator, to be read out on the call; never stored. */
  password?: string;
}

/** Twelve digits: easy to read out over a poor line, and good for one sign-in behind the login throttle. */
function temporaryPassword(): string {
  return Array.from({ length: 12 }, () => randomInt(10)).join("");
}

/**
 * يُصدر المدير كلمة مرورٍ مؤقّتة لحساب جوال (AUTH-05) بعد أن اتّصل بالرقم المسجَّل في الحساب وتأكّد. تُوضع في حساب
 * الدخول بمفتاح الخادم (المستدعي السادس في lib/supabase/admin.ts) ولا تُحفظ في القاعدة، ومعها علامةٌ تُلزم صاحبها
 * بتغييرها عند أوّل دخول؛ ثمّ يُغلق الطلب.
 */
export async function issueTemporaryPassword(_prev: IssueResult | null, fd: FormData): Promise<IssueResult> {
  const { supabase } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (fd.get("called") !== "on") {
    return { ok: false, message: "اتّصل بالرقم المسجَّل في الحساب أوّلاً، وتأكّد أنّ من يجيب صاحبه." };
  }
  const { data: rows } = await supabase.rpc("password_reset_pending");
  const request = ((rows ?? []) as { id: string; user_id: string }[]).find((r) => r.id === id);
  if (!request) return { ok: false, message: "هذا الطلب أُغلق من قبل." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "مفتاح الخادم غير مضبوط على هذا النشر." };
  const password = temporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(request.user_id, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) return { ok: false, message: `تعذّر وضع الكلمة: ${await dbText(error.message)}` };

  const { error: closeError } = await supabase.rpc("password_reset_close", { p_id: id, p_reset: true, p_note: null });
  revalidatePath("/admin/resets");
  return {
    ok: true,
    password,
    message: closeError
      ? "وُضعت الكلمة، لكن تعذّر إغلاق الطلب؛ أغلقه بعد قليل."
      : "وُضعت الكلمة. اقرأها له الآن؛ لن تظهر مرّةً ثانية، وسيُطلب منه أن يغيّرها حين يدخل.",
  };
}

export async function refuseReset(_prev: IssueResult | null, fd: FormData): Promise<IssueResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("password_reset_close", {
    p_id: String(fd.get("id") ?? ""),
    p_reset: false,
    p_note: String(fd.get("note") ?? ""),
  });
  revalidatePath("/admin/resets");
  if (error) return { ok: false, message: await dbText(error.message) };
  return { ok: true, message: "أُغلق الطلب بسببه." };
}
