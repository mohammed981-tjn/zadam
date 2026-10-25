"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/** The account owner's two acts (backlog 195): ask for the account to be closed, or take the request back. */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/account/close");
  redirect(`/account/close?${key}=${encodeURIComponent(message)}`);
}

export async function requestClosure(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const reason = str(fd, "reason").trim().slice(0, 500);
  const { error } = await supabase.rpc("account_close_request", { p_reason: reason || null });
  if (error) back("error", explain(locale, error));
  back("ok", t("وصل طلبك. تُغلقه الإدارة وتُبلغك، ويمكنك سحبه قبل ذلك.", "Your request arrived. The administrators close the account and tell you; you can take it back before then."));
}

export async function withdrawClosure() {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("account_close_withdraw");
  if (error) back("error", explain(locale, error));
  back("ok", t("سحبتَ طلبك، وحسابك كما هو.", "You took your request back; your account is as it was."));
}
