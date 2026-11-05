"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

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
  const { locale, t } = await translator();
  const userId = str(fd, "user_id");
  const kind = str(fd, "kind");
  if (!UUID.test(userId) || (kind !== "farm" && kind !== "investor")) done("error", t("اختر شخصاً ونوع الدفتر.", "Choose a person and a book type."));

  const hoursRaw = str(fd, "hours");
  const hours = hoursRaw === "" ? null : Number.parseInt(hoursRaw, 10);
  if (hours !== null && !Number.isInteger(hours)) done("error", t("مدّة الفحص بالساعات: رقمٌ صحيح.", "The inspection length in hours must be a whole number."));

  const { data: book, error: findError } = await supabase.rpc("oversight_find_book", { p_user: userId, p_kind: kind });
  if (findError) done("error", explain(locale, findError));
  if (!book) done("error", t("لا دفتر من هذا النوع لهذا الشخص.", "This person has no book of that type."));

  const { error } = await supabase.rpc("ledger_inspect_open", { p_book: book, p_reason: str(fd, "reason"), p_hours: hours });
  if (error) {
    console.error("openInspection failed", { error });
    done("error", explain(locale, error));
  }
  done(
    "ok",
    t(
      "فُتح الفحص وأُخطر صاحب الدفتر. اقرأ الدفتر من «دفتر الحسابات» ثمّ أغلق الفحص حين تنتهي.",
      "Inspection opened and the book's owner notified. Read the book from “Books”, then close the inspection when you are done.",
    ),
  );
}

export async function closeInspection(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "inspection_id");
  if (!UUID.test(id)) done("error", t("فحصٌ غير معروف.", "Unknown inspection."));
  const { error } = await supabase.rpc("ledger_inspect_close", { p_id: id });
  if (error) done("error", explain(locale, error));
  done("ok", t("أُغلق الفحص وأُخطر صاحب الدفتر.", "Inspection closed and the book's owner notified."));
}
