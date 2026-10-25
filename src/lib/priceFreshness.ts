import type { SupabaseClient } from "@supabase/supabase-js";
import { ageInDays, readFxReference } from "@/lib/fxRates";
import { readMarketPrices } from "@/lib/marketPrices";

/**
 * How fresh the prices shown to visitors are (GAP-3, backlog 163).
 *
 * The daily run (priceRefresh.ts) reads news sites that can change or vanish, and when one did
 * (iqraa24.com answered 404 on every run from 22 October) nothing said so: the run recorded the
 * error in a table nobody opens, and the site went on showing the last figure with its old date.
 * This names, per feed, the newest figure a visitor can see and how old it is, and says when the
 * run could no longer have found a newer one.
 *
 * The limit of each feed is not a guess: it is the look-back window the daily run itself uses
 * (FX_WINDOW_DAYS, CROP_WINDOW_DAYS below, read by priceRefresh.ts). A figure older than the
 * window is one the run would not find even if the site published it today, so the feed is
 * broken, not quiet.
 */

export const FX_WINDOW_DAYS = 4;

/**
 * Why a figure the readers read with certainty is still held: the platform publishes nothing by itself (the owner,
 * 25 October 2026 — «قراءةٌ آليّة واعتمادٌ بنقرة»). The administrator's one click (`market_quote_review_all`) approves
 * exactly the rows that carry this reason and no others, so the same words are in
 * supabase/migrations/20261025120000_market_quotes_keep.sql — scripts/verify-price-refresh.ts compares them.
 */
export const AWAITING_REASON = "قراءة موثوقة تنتظر اعتماد الإدارة";
export const CROP_WINDOW_DAYS = 10;

export type FeedKey = "fx_bank" | "fx_parallel" | "crop_obeid";

export interface FeedState {
  key: FeedKey;
  /** The newest market day shown to visitors, from the database or the files, or null. */
  newest: string | null;
  ageDays: number | null;
  limitDays: number;
  stale: boolean;
}

const LIMITS: Record<FeedKey, number> = {
  fx_bank: FX_WINDOW_DAYS,
  fx_parallel: FX_WINDOW_DAYS,
  crop_obeid: CROP_WINDOW_DAYS,
};

export const FEED_KEYS = Object.keys(LIMITS) as FeedKey[];

/** Pure: the state of each feed given the newest day known for it. */
export function feedStates(newest: Record<FeedKey, string | null>, now: Date = new Date()): FeedState[] {
  return FEED_KEYS.map((key) => {
    const day = newest[key];
    const age = day ? ageInDays(day, now) : null;
    return { key, newest: day, ageDays: age, limitDays: LIMITS[key], stale: age === null || age > LIMITS[key] };
  });
}

const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/** The newest day per feed: published rows in the database, or the files the site falls back on. */
export async function loadFeedStates(supabase: SupabaseClient, now: Date = new Date()): Promise<FeedState[]> {
  const newestOf = async (kind: string, market?: string) => {
    let q = supabase.from("market_quotes").select("market_date").eq("kind", kind).eq("status", "published");
    if (market) q = q.eq("market", market);
    const { data } = await q.order("market_date", { ascending: false }).limit(1).maybeSingle();
    return (data as { market_date: string } | null)?.market_date ?? null;
  };
  const [bank, parallel, obeid] = await Promise.all([newestOf("fx_bank"), newestOf("fx_parallel"), newestOf("crop", "obeid")]);

  const fx = readFxReference();
  const prices = readMarketPrices();
  const fileObeid = prices?.series
    .filter((s) => s.market === "obeid")
    .map((s) => s.history.at(-1)?.date ?? null)
    .reduce<string | null>(later, null) ?? null;

  return feedStates(
    {
      fx_bank: later(bank, fx?.bank.date ?? null),
      fx_parallel: later(parallel, fx?.parallel.date ?? null),
      crop_obeid: later(obeid, fileObeid),
    },
    now,
  );
}

/** One line per stale feed, for the run's error list and the server log. */
export function staleLines(states: FeedState[]): string[] {
  const name: Record<FeedKey, string> = {
    fx_bank: "سعر بنك الخرطوم",
    fx_parallel: "سعر السوق الموازي",
    crop_obeid: "نشرة سوق الأبيض",
  };
  return states
    .filter((s) => s.stale)
    .map((s) =>
      s.newest
        ? `قديم: ${name[s.key]} — آخر رقمٍ ${s.newest} (${s.ageDays} يوماً، والحدّ ${s.limitDays})`
        : `قديم: ${name[s.key]} — لا رقمَ منشور`,
    );
}
