"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * وضع الوكيل (البند ١٦٩): الطلب والجواب والإنهاء. كلّ قرارٍ في القاعدة: الدوالّ تتحقّق أنّ الطالب شركةٌ موثّقة، وأنّ
 * المجيب هو المزارع نفسه، وأنّ المُنهي أحد الطرفين، وتُخبر الطرف الآخر.
 */
type Page = "/agent" | "/account/agents";

function done(page: Page, key: "ok" | "error", message: string): never {
  revalidatePath("/agent", "layout");
  revalidatePath("/account/agents");
  redirect(`${page}?${key}=${encodeURIComponent(message)}`);
}

const SCOPES = ["lands", "seasons", "herds"] as const;

export async function requestMandate(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const scopes = SCOPES.filter((s) => fd.get(`scope_${s}`) === "on");
  if (scopes.length === 0) done("/agent", "error", t("اختر ما تطلب الإذن فيه.", "Choose what you are asking permission for."));
  const { error } = await supabase.rpc("agent_mandate_request", {
    p_phone: str(fd, "phone"),
    p_scopes: scopes,
    p_note: str(fd, "note"),
  });
  if (error) done("/agent", "error", explain(locale, error));
  done(
    "/agent",
    "ok",
    t(
      "وصل طلبك إلى المزارع. يعمل الإذن حين يقبله من حسابه، ويظهر اسمه هنا حينها.",
      "Your request reached the farmer. The permission starts when they accept it from their account, and their name shows here then.",
    ),
  );
}

export async function answerMandate(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const accept = str(fd, "decision") === "accept";
  const { error } = await supabase.rpc("agent_mandate_answer", { p_id: str(fd, "id"), p_accept: accept });
  if (error) done("/account/agents", "error", explain(locale, error));
  done(
    "/account/agents",
    "ok",
    accept
      ? t("قبلت. صار الوكيل يعمل عنك في ما أذنت فيه، وتُنهيه من هنا متى شئت.", "Accepted. The agent now acts for you in what you allowed, and you can end it here whenever you like.")
      : t("اعتذرت، وأُخبر الوكيل.", "Declined; the agent has been told."),
  );
}

export async function endMandate(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const page: Page = str(fd, "from") === "/agent" ? "/agent" : "/account/agents";
  const { error } = await supabase.rpc("agent_mandate_end", { p_id: str(fd, "id") });
  if (error) done(page, "error", explain(locale, error));
  done(page, "ok", t("انتهى. وما سُجّل باسم المزارع يبقى له.", "Ended. What was registered in the farmer's name stays theirs."));
}
