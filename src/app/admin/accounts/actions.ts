"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/** Closing an account and erasing its kept identity (backlog 195): both are one database function, for administrators. */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/inbox");
  redirect(`/admin/accounts?${key}=${encodeURIComponent(message)}`);
}

const reasonOf = (fd: FormData) => str(fd, "reason").trim();

export async function closeAccount(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const reason = reasonOf(fd);
  if (reason.length < 3 || reason.length > 300) back("error", t("اكتب سبب الإغلاق (٣ أحرفٍ فأكثر).", "Write the reason for closing (3 characters or more)."));
  const { error } = await supabase.rpc("account_close", { p_user: str(fd, "user_id"), p_reason: reason });
  if (error) back("error", explain(locale, error));
  back("ok", t("أُغلق الحساب: توقّف دخوله واختفت هويّته عن الناس، وبقيت دفاتره وعقوده، وهويّته محفوظة هنا.", "Account closed: sign-in stopped, the identity is hidden from everyone, books and agreements stay, and the identity is kept here."));
}

export async function eraseIdentity(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const reason = reasonOf(fd);
  if (reason.length < 3 || reason.length > 300) back("error", t("اكتب سبب المحو (٣ أحرفٍ فأكثر).", "Write the reason for erasing (3 characters or more)."));
  const { error } = await supabase.rpc("account_identity_erase", { p_user: str(fd, "user_id"), p_reason: reason });
  if (error) back("error", explain(locale, error));
  back("ok", t("مُحيت الهويّة المحفوظة، وبقي في السجلّ من محاها ومتى ولماذا.", "The kept identity was erased; the record keeps who erased it, when and why."));
}
