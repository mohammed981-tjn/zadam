import type { SupabaseClient } from "@supabase/supabase-js";
import { currentFx, currentMarketPrices } from "@/lib/livePrices";
import { ageInDays, fetchCrossRates, poundsPer, type FxCurrency } from "@/lib/fxRates";
import { BOURSE_QUIET_DAYS, fetchFewsPrices, latest, readWfpMonthly, type MarketPrices, type PriceSeries } from "@/lib/marketPrices";
import { readWfpPrices, townMedians } from "@/lib/wfpPrices";
import { isNotYetCreated } from "@/lib/marketOffers";
import { readPublishedInputs, type Availability, type SummaryRow } from "@/lib/inputBoard";

/**
 * What the three price boards read — /market, /rates and /market/inputs — in one place, so the website's pages and
 * the phone app's routes (src/app/api/app/prices/**, backlog 203) show the same numbers from the same loader. Each
 * page and each route only lays the result out; nothing here decides how it looks.
 */

// ═══════════════════════════════════════════════════════════════════════════
// /market — the bourse cards, the monthly references, and whether the bourses have gone quiet
// ═══════════════════════════════════════════════════════════════════════════

/** Cards in the order a farmer looks for them: the cash crop first, then the staples, then the west's crops. */
export const CROP_ORDER = ["sesame", "feterita", "millet", "tabat", "sesame_red", "gum_hashab", "groundnut", "hibiscus"];

/** The bourse series grouped per crop, in CROP_ORDER, and when each bourse town last published. Pure. */
export function marketBoard(data: MarketPrices | null, now: Date = new Date()) {
  const byCrop = new Map<string, PriceSeries[]>();
  for (const s of data?.series ?? []) byCrop.set(s.crop, [...(byCrop.get(s.crop) ?? []), s]);
  const crops = [...byCrop.keys()].sort((a, b) => {
    const ia = CROP_ORDER.indexOf(a), ib = CROP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // The newest bulletin per bourse town. When even the newest is a month old the
  // bourses are between seasons: the page says so first, and leads with the monthly figures.
  const lastBulletin = new Map<string, string>();
  for (const s of data?.series ?? []) {
    const d = latest(s).last.date;
    if (d > (lastBulletin.get(s.market) ?? "")) lastBulletin.set(s.market, d);
  }
  const newest = [...lastBulletin.values()].sort().pop();
  const quiet = newest !== undefined && ageInDays(newest, now) > BOURSE_QUIET_DAYS;
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(data?.checked ?? "") ? data!.checked : null;
  return { byCrop, crops, lastBulletin, quiet, checked };
}

/** Everything /market shows: the bourses (files and published rows), the dollar, FEWS NET and WFP. */
export async function loadMarketBoard(now: Date = new Date()) {
  const [data, fx, fews] = await Promise.all([currentMarketPrices(), currentFx(), fetchFewsPrices(now)]);
  const wfp = readWfpMonthly();
  const wfpPrices = readWfpPrices();
  const wfpMedians = wfpPrices ? townMedians(wfpPrices.towns) : new Map<string, number>();
  return { data, fx, fews, wfp, wfpPrices, wfpMedians, usdRate: fx?.bank.sell ?? null, ...marketBoard(data, now) };
}

// ═══════════════════════════════════════════════════════════════════════════
// /rates — the bank and the parallel market, and every currency at each
// ═══════════════════════════════════════════════════════════════════════════

export async function loadRates() {
  const [ref, cross] = await Promise.all([currentFx(), fetchCrossRates()]);
  const bankTable = ref ? poundsPer(ref.bank.sell, cross) : {};
  const parallelTable = ref ? poundsPer(ref.parallel.sell, cross) : {};
  const rows = Object.keys(bankTable) as FxCurrency[];
  return { ref, cross, bankTable, parallelTable, rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// /market/inputs — «أين السماد والجازولين هذا الأسبوع وبكم» (البند ١٢٠)
// ═══════════════════════════════════════════════════════════════════════════

/** Reports counted on the board: the last two weeks, as the database allows them to be dated. */
export const INPUT_WINDOW_DAYS = 14;

/** A published figure older than this is marked as old; a report window is two weeks, a source two months. */
export const PUBLISHED_OLD_DAYS = 60;

export interface InputReport {
  id: string;
  item: SummaryRow["item"];
  unit: SummaryRow["unit"];
  price_kind: "official" | "parallel" | null;
  state: string;
  locality: string;
  price_sdg: number | null;
  availability: Availability;
  observed_on: string;
  note: string | null;
}

export const SUPPLIER_INPUTS = ["urea", "DAP", "NPK"] as const;

/**
 * The board as anyone may read it: the two report functions are granted to `anon` and return no reporter, and the
 * supplier listings are the verified ones the policy shows a visitor. The website passes its session client, the app
 * route the public one; the rows are the same.
 */
export async function loadInputBoard(supabase: SupabaseClient) {
  const [summary, recent, suppliers] = await Promise.all([
    supabase.rpc("input_price_summary", { p_days: INPUT_WINDOW_DAYS }),
    supabase.rpc("input_price_reports_recent", { p_days: INPUT_WINDOW_DAYS }),
    supabase
      .from("supplier_products")
      .select("input_key, supplier_id")
      .eq("active", true)
      .eq("category", "fertilizer")
      .in("input_key", [...SUPPLIER_INPUTS]),
  ]);
  const pending = isNotYetCreated(summary.error);
  const rows: SummaryRow[] = ((summary.data ?? []) as SummaryRow[]).map((r) => ({
    ...r,
    low: r.low === null ? null : Number(r.low),
    high: r.high === null ? null : Number(r.high),
    median: r.median === null ? null : Number(r.median),
  }));
  const reports = (recent.data ?? []) as InputReport[];
  const supplierCount = (key: string) =>
    new Set(((suppliers.data ?? []) as { input_key: string; supplier_id: string }[]).filter((p) => p.input_key === key).map((p) => p.supplier_id)).size;
  const published = readPublishedInputs();
  return { pending, rows, reports, supplierCount, published };
}
