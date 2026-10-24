"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str } from "@/lib/supplyActions";

/**
 * فتح فحصٍ على دفترٍ وإغلاقه (البند ١٩١). The database decides who may: an administrator, with a written
 * reason of ten characters or more, for at most 72 hours, never on his own book — and the owner of the book is
 * told when it opens and when it closes. These only carry the form there.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/oversight");
  redirect(`/admin/oversight?${key}=${encodeURIComponent(message)}`);
}

export async function openInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const userId = str(fd, "user_id");
  const kind = str(fd, "kind");
  if (!UUID.test(userId) || (kind !== "farm" && kind !== "investor")) done("error", "اختر شخصاً ونوع الدفتر.");

  const hoursRaw = str(fd, "hours");
  const hours = hoursRaw === "" ? null : Number.parseInt(hoursRaw, 10);
  if (hours !== null && !Number.isInteger(hours)) done("error", "مدّة الفحص بالساعات: رقمٌ صحيح.");

  const { data: book, error: findError } = await supabase.rpc("oversight_find_book", { p_user: userId, p_kind: kind });
  if (findError) done("error", explain("ar", findError));
  if (!book) done("error", "لا دفتر من هذا النوع لهذا الشخص.");

  const { error } = await supabase.rpc("ledger_inspect_open", { p_book: book, p_reason: str(fd, "reason"), p_hours: hours });
  if (error) {
    console.error("openInspection failed", { error });
    done("error", explain("ar", error));
  }
  done("ok", "فُتح الفحص وأُخطر صاحب الدفتر. اقرأ الدفتر من «دفتر الحسابات» ثمّ أغلق الفحص حين تنتهي.");
}

export async function closeInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const id = str(fd, "inspection_id");
  if (!UUID.test(id)) done("error", "فحصٌ غير معروف.");
  const { error } = await supabase.rpc("ledger_inspect_close", { p_id: id });
  if (error) done("error", explain("ar", error));
  done("ok", "أُغلق الفحص وأُخطر صاحب الدفتر.");
}
