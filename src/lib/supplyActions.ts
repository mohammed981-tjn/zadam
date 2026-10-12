import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { dbMessage } from "@/lib/dbMessages";
import { isNotDeployed } from "@/lib/supplyChain";

/**
 * Shared plumbing for the supply-chain server actions: every step is a
 * database function that checks who is calling, and these helpers carry a form
 * there and bring the result back as ?ok= / ?error=, in the reader's language.
 */

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export const numOrNull = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (!s) return null;
  const n = Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
  return Number.isFinite(n) ? n : null;
};

export async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function translator() {
  const locale = await getLocale();
  return { locale, t: (ar: string, en: string) => tr(locale, ar, en) };
}

export function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/suppliers", "layout");
  revalidatePath("/verify");
  revalidatePath("/admin/suppliers");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/** The refusal in words the reader can act on; "coming soon" while the migration is pending. */
export function explain(locale: Locale, error: { code?: string; message?: string } | null | undefined): string {
  if (isNotDeployed(error)) {
    return tr(
      locale,
      "تُفعَّل هذه الخدمة قريباً — قاعدة بياناتها لم تُفعَّل بعد، ولم يُحفظ شيء.",
      "Coming soon — this service's database is not switched on yet, and nothing was saved.",
    );
  }
  const m = error?.message ?? "";
  if (/[؀-ۿ]/.test(m)) return dbMessage(m, locale);
  if (error) console.error("supply action failed", error);
  return tr(locale, "تعذّرت الخطوة. راجع الحقول وأعد المحاولة.", "That step failed. Check the fields and try again.");
}
