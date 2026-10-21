"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbMessage } from "@/lib/dbMessages";
import { tr, type Locale } from "@/lib/i18n";
import { khartoumToday, reportProblem } from "@/lib/inputBoard";
import { getLocale } from "@/lib/locale";
import { isNotYetCreated } from "@/lib/marketOffers";
import { SUDAN_STATES } from "@/lib/nafir";
import { toWesternDigits } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

/**
 * Three steps, each a database function (supabase/migrations/
 * 20261021190000_input_price_reports.sql) that checks who is taking it; the
 * fields are checked here first so a refusal reads as a sentence about the
 * field. Results come back as ?ok= / ?error=.
 */

const REPORT = "/market/inputs/report";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** A price from what was typed: Arabic digits and thousands separators allowed. */
const price = (fd: FormData) => {
  const s = toWesternDigits(str(fd, "price")).replace(/[,\s٬]/g, "").replace("٫", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/market/inputs", "layout");
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  return { supabase, locale, t: (ar: string, en: string) => tr(locale, ar, en) };
}

const refusal = (message: string, locale: Locale, fallback: string) =>
  /[؀-ۿ]/.test(message) ? dbMessage(message, locale) : fallback;

export async function reportPrice(fd: FormData) {
  const { supabase, locale, t } = await session();
  const r = {
    item: str(fd, "item"),
    unit: str(fd, "unit"),
    priceKind: str(fd, "price_kind"),
    availability: str(fd, "availability"),
    price: price(fd),
    observedOn: str(fd, "observed_on"),
  };
  const problem = reportProblem(r, khartoumToday(), locale);
  if (problem) back(REPORT, "error", problem);
  const state = str(fd, "state");
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back(REPORT, "error", t("اختر الولاية.", "Choose the state."));
  const locality = str(fd, "locality");
  if (locality.length < 2 || locality.length > 80) back(REPORT, "error", t("اكتب السوق أو المحلية.", "Enter the market or locality."));
  const note = str(fd, "note");
  if (note.length === 1 || note.length > 300) back(REPORT, "error", t("الملاحظة بين حرفين و٣٠٠ حرف، أو اتركها فارغة.", "The note is 2 to 300 characters, or leave it empty."));

  const fuel = r.item === "diesel" || r.item === "petrol";
  const { error } = await supabase.rpc("input_price_report_add", {
    p_item: r.item,
    p_unit: r.unit,
    p_price_kind: fuel ? r.priceKind : null,
    p_state: state,
    p_locality: locality,
    p_price_sdg: r.availability === "unavailable" ? null : r.price,
    p_availability: r.availability,
    p_observed_on: r.observedOn,
    p_note: note || null,
  });
  if (error) {
    if (isNotYetCreated(error)) back(REPORT, "error", t("البلاغات تُفعَّل قريباً.", "Reports open soon."));
    back(REPORT, "error", refusal(error.message, locale, t("تعذّر الإرسال. راجع الحقول وأعد المحاولة.", "Sending failed. Check the fields and try again.")));
  }
  back("/market/inputs", "ok", t("وصل بلاغك، وظهر في اللوحة. شكراً — يفيد كلّ من في ولايتك.", "Your report is in, and on the board. Thank you — it helps everyone in your state."));
}

export async function withdrawReport(fd: FormData) {
  const { supabase, locale, t } = await session();
  const { error } = await supabase.rpc("input_price_report_withdraw", { p_id: str(fd, "report_id") });
  if (error) back(REPORT, "error", refusal(error.message, locale, t("تعذّر السحب.", "Withdrawing failed.")));
  back(REPORT, "ok", t("سُحب البلاغ. لم يعد يظهر في اللوحة.", "The report is withdrawn. It no longer shows on the board."));
}

export async function hideReport(fd: FormData) {
  const { supabase, locale, t } = await session();
  const { error } = await supabase.rpc("input_price_report_hide", { p_id: str(fd, "report_id"), p_note: str(fd, "note") });
  if (error) back(REPORT, "error", refusal(error.message, locale, t("تعذّر الإخفاء.", "Hiding failed.")));
  back(REPORT, "ok", t("أُخفي البلاغ، وحُفظ سبب إخفائه.", "The report is hidden, and the reason kept."));
}
