/**
 * الأصول الثابتة (البند ١٩٠، ٢٠٣): تسجيل أصلٍ وقيد شرائه معاً، وقيد ما استحقّ من إهلاكه، وبيعه أو استبعاده.
 *
 * The database checks the book is the member's farm book and every figure
 * (supabase/migrations/20261106010000_fixed_assets.sql, 20261106020000). The website's actions
 * (src/app/books/assets/actions.ts) and the phone app's routes (src/app/api/app/books/assets/**) both call these with
 * the caller's own client, so the same figures are read the same way and refused in the same words.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "./i18n";
import { explain } from "./supplyActions";

export type AssetWriteResult = { ok: boolean; message: string };

/** A figure as typed, Arabic digits read, thousands separators and spaces dropped. */
const cleanFigure = (raw: string): string =>
  raw.trim().replace(/[,٬\s]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
export const assetNumber = (raw: string): number => Number(cleanFigure(raw));

/** Opens the farm book if the member has none yet; returns the one he has otherwise. */
async function farmBook(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ledger_open_book", { p_kind: "farm" });
  return { book: typeof data === "string" ? data : null, error };
}

export async function addFixedAsset(
  supabase: SupabaseClient,
  f: { name: string; account: string; acquired_on: string; cost: string; salvage: string; life_years: string; paid_from: string },
  locale: Locale,
): Promise<AssetWriteResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { book, error: bookError } = await farmBook(supabase);
  if (!book) return { ok: false, message: bookError ? explain(locale, bookError) : t("تعذّر فتح دفتر المزرعة.", "Could not open the farm book.") };
  const years = assetNumber(f.life_years);
  const { error } = await supabase.rpc("ledger_asset_add", {
    p_book: book,
    p_name: f.name.trim(),
    p_account: f.account.trim(),
    p_date: f.acquired_on.trim(),
    p_cost: assetNumber(f.cost),
    p_salvage: f.salvage.trim() ? assetNumber(f.salvage) : 0,
    p_life: Number.isFinite(years) ? Math.round(years * 12) : null,
    p_paid_from: f.paid_from.trim(),
  });
  if (error) {
    console.error("addAsset failed", { error });
    return { ok: false, message: explain(locale, error) };
  }
  return {
    ok: true,
    message: t(
      "سُجّل الأصل وقُيِّد شراؤه في دفترك. يُقيَّد إهلاكه كلّ شهرٍ وحده.",
      "The asset was registered and its purchase booked. Its depreciation is booked each month on its own.",
    ),
  };
}

export async function depreciateFarmAssets(supabase: SupabaseClient, locale: Locale): Promise<AssetWriteResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { book, error: bookError } = await farmBook(supabase);
  if (!book) return { ok: false, message: bookError ? explain(locale, bookError) : t("تعذّر فتح دفتر المزرعة.", "Could not open the farm book.") };
  const { data, error } = await supabase.rpc("ledger_asset_depreciate", { p_book: book });
  if (error) return { ok: false, message: explain(locale, error) };
  const n = typeof data === "number" ? data : 0;
  return {
    ok: true,
    message: n > 0 ? t(`قُيِّد إهلاك ${n} شهراً.`, `${n} month(s) of depreciation booked.`) : t("لا إهلاك مستحقّاً لم يُقيَّد.", "No depreciation due that is not booked."),
  };
}

export async function disposeFixedAsset(
  supabase: SupabaseClient,
  f: { asset_id: string; disposed_on: string; proceeds: string; received_into: string },
  locale: Locale,
): Promise<AssetWriteResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const proceeds = Number(cleanFigure(f.proceeds) || 0);
  const { error } = await supabase.rpc("ledger_asset_dispose", {
    p_asset: f.asset_id.trim(),
    p_date: f.disposed_on.trim(),
    p_proceeds: proceeds,
    p_received_into: proceeds > 0 ? f.received_into.trim() : null,
  });
  if (error) {
    console.error("disposeAsset failed", { error });
    return { ok: false, message: explain(locale, error) };
  }
  return {
    ok: true,
    message:
      proceeds > 0
        ? t(
            "قُيِّد البيع: خرج الأصل من الدفتر، والفرق عن قيمته الدفتريّة ربحٌ أو خسارة.",
            "The sale was booked: the asset left the book, and the difference from its book value is a gain or a loss.",
          )
        : t("قُيِّد الاستبعاد: خرج الأصل من الدفتر، وقيمته الدفتريّة خسارة.", "The write-off was booked: the asset left the book, and its book value is a loss."),
  };
}
