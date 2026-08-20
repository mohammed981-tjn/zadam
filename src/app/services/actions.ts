"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SERVICE_BY_KEY,
  type ServiceKey,
  type ServiceKind,
  SERVICE_KIND_LABEL,
} from "@/lib/services";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Registers an outfit that offers agricultural services.
 *
 * Deliberately never sets verified_at. The database refuses it from a
 * non-admin anyway — the guard trigger raises rather than trusting this file —
 * but leaving the field out entirely means nobody reading this action has to
 * wonder whether registration and verification are the same act. They are not:
 * anyone may register, and only an admin makes a provider contractable.
 */
export async function registerProvider(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  const kind = str(formData, "kind") as ServiceKind;

  if (!name) return { ok: false, message: "اسم الجهة مطلوب." };
  if (!(kind in SERVICE_KIND_LABEL)) {
    return { ok: false, message: "اختر نوع النشاط." };
  }

  // Regions arrive as one comma-separated field because asking a visitor to add
  // rows one at a time is a worse experience than letting them type the way
  // they already think: "الجزيرة، سنار، النيل الأبيض".
  const regions = str(formData, "regions")
    .split(/[،,]/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 20);

  const { error } = await supabase.from("service_providers").insert({
    owner_id: user.id,
    name: name.slice(0, 120),
    kind,
    bio: str(formData, "bio").slice(0, 800) || null,
    phone: str(formData, "phone").slice(0, 40) || null,
    regions,
  });

  if (error) {
    return { ok: false, message: `تعذّر التسجيل: ${error.message}` };
  }

  revalidatePath("/services");
  return {
    ok: true,
    message:
      "تم تسجيل جهتك. ستظهر في الكتالوج بعد توثيقها من الإدارة — سنُشعرك عند التوثيق.",
  };
}

/**
 * Adds one priced offer to a provider's catalogue.
 *
 * The unit is not asked for. It comes from the catalogue definition, because a
 * drone survey is sold by the feddan and an irrigation network by the m³ of
 * seasonal demand, and letting a provider pick a different unit would break the
 * one property that makes a contract checkable: that both sides can recompute
 * the quantity from the season.
 */
export async function addServiceOffer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const providerId = str(formData, "provider_id");
  const serviceKey = str(formData, "service_key") as ServiceKey;
  const definition = SERVICE_BY_KEY[serviceKey];

  if (!providerId) return { ok: false, message: "الجهة غير محددة." };
  if (!definition) return { ok: false, message: "خدمة غير معروفة." };

  const price = Number(formData.get("price_per_unit"));
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "أدخل سعراً صحيحاً." };
  }

  const leadTime = Number(formData.get("lead_time_days")) || 0;

  const { error } = await supabase.from("services").insert({
    provider_id: providerId,
    service_key: serviceKey,
    title: str(formData, "title").slice(0, 120) || definition.name,
    description: str(formData, "description").slice(0, 500) || null,
    unit: definition.unit,
    price_per_unit: price,
    production_kind: definition.production,
    lead_time_days: Math.max(0, Math.min(365, Math.round(leadTime))),
  });

  if (error) {
    return { ok: false, message: `تعذّر إضافة الخدمة: ${error.message}` };
  }

  revalidatePath("/services");
  revalidatePath("/services/mine");
  return { ok: true, message: `أُضيفت «${definition.name}» إلى عروضك.` };
}

/**
 * The provider's own "closed for now" switch.
 *
 * Deliberately not `active`: that column is administrative standing, and once
 * the verification guard locks it to admins a provider with an honest reason to
 * step out of the catalogue — fully booked, between seasons, short a driver —
 * would have to ask and wait. Two meanings, two switches.
 *
 * No ownership check here. providers_own is
 * `for all using (owner_id = auth.uid() or is_admin())`, so a request for
 * somebody else's row matches nothing. The outcome is checked instead of the
 * permission: an UPDATE that row-level security filters out returns no error
 * and zero rows, so without reading the returned rows a refusal and a success
 * are the same value — and the caller would be told its listing was paused when
 * nothing moved.
 */
export async function setProviderPaused(formData: FormData) {
  const supabase = await createClient();

  const id = String(formData.get("provider_id") ?? "").trim();
  if (!id) redirect("/services/mine");

  const paused = formData.get("paused") === "true";

  const { data, error } = await supabase
    .from("service_providers")
    .update({ paused_by_owner: paused })
    .eq("id", id)
    .select("id");

  revalidatePath("/services/mine");
  revalidatePath("/services");

  if (error) {
    console.error("services: pause toggle failed", error);
    redirect(
      `/services/mine?error=${encodeURIComponent("تعذّر تنفيذ العملية. حاول مرة أخرى.")}`,
    );
  }
  if (!data?.length) {
    redirect(
      `/services/mine?error=${encodeURIComponent(
        "لم يتغيّر شيء — تأكّد أنك ما زلت مسجّل الدخول بالحساب المالك للجهة.",
      )}`,
    );
  }

  redirect(
    `/services/mine?message=${encodeURIComponent(
      paused
        ? "أُخفيت جهتك من الدليل. تظهر لك وحدك حتى تعيد تفعيلها."
        : "عادت جهتك إلى الدليل.",
    )}`,
  );
}
