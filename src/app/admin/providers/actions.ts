"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { dbMessage } from "@/lib/dbMessages";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * The guard triggers on this table raise with SQLSTATE P0001 and Arabic text
 * written for the person reading it — "توثيق مقدّم الخدمة من صلاحية الإدارة
 * وحدها" — so those are worth showing as-is.
 *
 * Everything else arriving here is a constraint name, a type error or an RLS
 * refusal, which describes the schema to whoever asked. Those get a fixed
 * string and the detail goes to the log.
 */
function providerError(error: { code?: string; message: string }, locale: Locale) {
  if (error.code === "P0001") return locale === "en" ? dbMessage(error.message, locale) : error.message;
  console.error("provider action failed", error);
  return tr(locale, "تعذّر تنفيذ العملية. حاول مرة أخرى.", "The action failed. Please try again.");
}

/**
 * Verifying a provider — the one act that puts it into the catalogue.
 *
 * This screen exists because the guard existed without it. The database has
 * refused self-verification since service_providers shipped: a trigger raises
 * on any non-admin touching verified_at, on INSERT as well as UPDATE. What it
 * never had was the admin path that trigger was guarding — so nobody could
 * verify anyone, unverified providers stayed out of the catalogue by RLS, the
 * catalogue stayed empty, and forty-one services and the whole contracting
 * module sat behind a button that did not exist.
 *
 * verified_at is stamped with the current time rather than taken from the
 * request, and verified_by is written by the same trigger that does the
 * refusing — so an approval cannot be backdated or attributed elsewhere by
 * whoever sends the form.
 */
export async function verifyProvider(formData: FormData) {
  const { supabase } = await requireAdmin();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const id = str(formData, "provider_id");
  if (!id) redirect("/admin/providers");

  const { data, error } = await supabase
    .from("service_providers")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  revalidatePath("/admin/providers");
  revalidatePath("/services");

  if (error) {
    redirect(`/admin/providers?error=${encodeURIComponent(providerError(error, locale))}`);
  }

  if (!data || data.length === 0) {
    console.error("verifyProvider: no row updated", { id });
    redirect(
      `/admin/providers?error=${encodeURIComponent(
        t(
          "لم يتغيّر شيء — الجهة غير موجودة أو لا تملك صلاحية توثيقها.",
          "Nothing changed — the provider does not exist, or you may not verify it.",
        ),
      )}`,
    );
  }

  redirect(
    `/admin/providers?message=${encodeURIComponent(
      t(
        "تم توثيق الجهة. ظهرت الآن في الكتالوج ويمكن التعاقد معها.",
        "Provider verified. It now appears in the catalogue and can be contracted.",
      ),
    )}`,
  );
}

/**
 * Withdrawing verification.
 *
 * Not a delete. A provider that turns out to be unreliable has contracts behind
 * it, and removing the row would take those with it — so the verification is
 * lifted, the provider leaves the catalogue, and every contract already signed
 * stays readable by both of its parties.
 */
export async function unverifyProvider(formData: FormData) {
  const { supabase } = await requireAdmin();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const id = str(formData, "provider_id");
  if (!id) redirect("/admin/providers");

  const { data, error } = await supabase
    .from("service_providers")
    .update({ verified_at: null, verified_by: null })
    .eq("id", id)
    .select("id");

  revalidatePath("/admin/providers");
  revalidatePath("/services");

  if (error) {
    redirect(`/admin/providers?error=${encodeURIComponent(providerError(error, locale))}`);
  }

  if (!data || data.length === 0) {
    console.error("unverifyProvider: no row updated", { id });
    redirect(
      `/admin/providers?error=${encodeURIComponent(
        t(
          "لم يتغيّر شيء — الجهة غير موجودة أو لا تملك صلاحية تعديلها.",
          "Nothing changed — the provider does not exist, or you may not edit it.",
        ),
      )}`,
    );
  }

  redirect(
    `/admin/providers?message=${encodeURIComponent(
      t(
        "سُحب التوثيق. لم تعد الجهة في الكتالوج، والعقود القائمة كما هي.",
        "Verification withdrawn. The provider is no longer in the catalogue; existing contracts are unchanged.",
      ),
    )}`,
  );
}

/**
 * Suspending a provider, or bringing it back.
 *
 * Separate from verification because the two answer different questions.
 * `active` is whether the outfit is trading at all — closed, on hold, gone
 * quiet. `verified_at` is whether we have checked it. A verified provider that
 * stops answering the phone should leave the catalogue without the record of
 * its verification being erased.
 */
export async function setProviderActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const id = str(formData, "provider_id");
  const active = str(formData, "active") === "true";
  if (!id) redirect("/admin/providers");

  const { data, error } = await supabase
    .from("service_providers")
    .update({ active })
    .eq("id", id)
    .select("id");

  revalidatePath("/admin/providers");
  revalidatePath("/services");

  if (error) {
    redirect(`/admin/providers?error=${encodeURIComponent(providerError(error, locale))}`);
  }

  if (!data || data.length === 0) {
    console.error("setProviderActive: no row updated", { id, active });
    redirect(
      `/admin/providers?error=${encodeURIComponent(
        t(
          "لم يتغيّر شيء — الجهة غير موجودة أو لا تملك صلاحية تعديلها.",
          "Nothing changed — the provider does not exist, or you may not edit it.",
        ),
      )}`,
    );
  }

  redirect(
    `/admin/providers?message=${encodeURIComponent(
      active ? t("أُعيد تفعيل الجهة.", "Provider reactivated.") : t("أُوقفت الجهة مؤقتاً.", "Provider suspended."),
    )}`,
  );
}
