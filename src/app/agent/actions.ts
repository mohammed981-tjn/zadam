"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { formFields } from "@/lib/supplyCore";
import { answerMandateStep, endMandateStep, objectAgentWriteStep, requestMandateStep } from "@/lib/agentCore";

/**
 * وضع الوكيل (البند ١٦٩): الطلب والجواب والإنهاء. كلّ قرارٍ في القاعدة: الدوالّ تتحقّق أنّ الطالب شركةٌ موثّقة، وأنّ
 * المجيب هو المزارع نفسه، وأنّ المُنهي أحد الطرفين، وتُخبر الطرف الآخر. والخطوات نفسها في src/lib/agentCore.ts،
 * يستدعيها التطبيق أيضاً (البند ٢٠٣)؛ وتسجيل مزارعٍ بلا جوّال يبقى هنا وحده، لأنه يصنع حساباً بمفتاح الخادم.
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
  const { locale } = await translator();
  const r = await requestMandateStep(supabase, formFields(fd), locale);
  done("/agent", r.ok ? "ok" : "error", r.message);
}

export async function answerMandate(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const r = await answerMandateStep(supabase, formFields(fd), locale);
  done("/account/agents", r.ok ? "ok" : "error", r.message);
}

export async function endMandate(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const page: Page = str(fd, "from") === "/agent" ? "/agent" : "/account/agents";
  const r = await endMandateStep(supabase, formFields(fd), locale);
  done(page, r.ok ? "ok" : "error", r.message);
}

/**
 * مزارعٌ بلا جوّال (البند ١٦٩، الشريحة الثانية): الجمعيّة الموثّقة تفتح له حساباً. يصنعه الخادم بمفتاحه (المستدعي
 * السابع في lib/supabase/admin.ts) بعنوانٍ داخليّ لا يصله بريد وكلمة مرورٍ عشوائيّة لا تُحفظ ولا تُعرض، فلا يدخله
 * أحد؛ ثمّ تسجّل الجمعيّة المزارع عليه بجلستها هي، والقاعدة تتحقّق من كلّ شيء وتُبقي الإذن معلَّقاً حتى تعتمده الإدارة.
 * وإن رفضت القاعدة التسجيل حُذف الحساب الذي صُنع له، فلا يبقى حسابٌ يتيم.
 */
export async function registerManagedFarmer(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const scopes = SCOPES.filter((s) => fd.get(`scope_${s}`) === "on");
  if (scopes.length === 0) done("/agent", "error", t("اختر ما تعمل فيه عنه.", "Choose what you will act for them in."));
  if (fd.get("consent_read") !== "on") {
    done("/agent", "error", t("اقرأ ورقة الموافقة على المزارع أوّلاً، وتأكّد أنّه وقّعها أو بصم عليها.", "Read the consent paper to the farmer first, and make sure they signed or thumb-printed it."));
  }
  const { error: allowed } = await supabase.rpc("managed_farmer_can_register");
  if (allowed) done("/agent", "error", explain(locale, allowed));

  const admin = createAdminClient();
  if (!admin) done("/agent", "error", t("مفتاح الخادم غير مضبوط على هذا النشر.", "The server key is not set on this deployment."));
  const fullName = str(fd, "full_name");
  const { data: made, error: makeError } = await admin.auth.admin.createUser({
    email: `m${randomUUID().replace(/-/g, "")}@managed.invalid`,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { managed: true, full_name: fullName },
  });
  if (makeError || !made.user) {
    console.error("agent: managed account failed", makeError?.message);
    done("/agent", "error", t("تعذّر فتح الحساب. حاول بعد قليل.", "Could not open the account. Try again shortly."));
  }

  const { error } = await supabase.rpc("managed_farmer_register", {
    p_user: made.user.id,
    p_full_name: fullName,
    p_state: str(fd, "state"),
    p_locality: str(fd, "locality"),
    p_village: str(fd, "village"),
    p_national_id: str(fd, "national_id"),
    p_contact_phone: str(fd, "contact_phone"),
    p_consent_path: str(fd, "consent_path"),
    p_photo_path: str(fd, "photo_path"),
    p_scopes: scopes,
    p_note: str(fd, "note"),
  });
  if (error) {
    await admin.auth.admin.deleteUser(made.user.id);
    done("/agent", "error", explain(locale, error));
  }
  done(
    "/agent",
    "ok",
    t(
      "سُجّل المزارع، وينتظر أن تراجع الإدارة الورقة والصورة. تعمل عنه حين تعتمده، ويصلك إشعار.",
      "The farmer is registered and awaits the administrators' review of the paper and photo. You act for them once approved; you will be notified.",
    ),
  );
}

/**
 * المزارع يعترض على ما كتبه وكيلٌ باسمه (قرار المالك 6 نوفمبر). القاعدة تتحقّق أنّه صاحب السطر، وتسجّل الاعتراض،
 * وتفتح المرحلة إن كان ذلك لا يكسر ترتيباً، وتُخبر الوكيل. يرجع إلى صفحة الموسم التي جاء منها، أو إلى «وكلائي».
 */
export async function objectAgentWrite(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const from = str(fd, "from");
  const page = /^\/seasons\/[0-9a-f-]{36}$/i.test(from) ? from : "/account/agents";
  const r = await objectAgentWriteStep(supabase, formFields(fd), locale);
  revalidatePath(page);
  revalidatePath("/account/agents");
  redirect(`${page}?${r.ok ? "ok" : "error"}=${encodeURIComponent(r.message)}`);
}
