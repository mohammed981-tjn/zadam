import type { SupabaseClient } from "@supabase/supabase-js";
import { readFxReference } from "@/lib/fxRates";
import { readMarketPrices } from "@/lib/marketPrices";
import { AWAITING_REASON, CROP_WINDOW_DAYS, FX_WINDOW_DAYS, loadFeedStates, staleLines } from "@/lib/priceFreshness";
import { SITE_URL } from "@/lib/site";
import {
  holdReason,
  readBank,
  readGedarefProse,
  readObeidList,
  readParallelMarket,
  type CropQuote,
  type FxQuote,
  type WpPost,
} from "@/lib/priceFeeds";

/**
 * The daily price run (backlog 131): fetch, read, compare, write.
 *
 * Called by /api/health once a day (Vercel Cron) and by the «حدّث الآن»
 * button on /admin/prices. It writes with the service-role client, because a
 * scheduled job has no visitor to act as; what it writes is only ever a row in
 * market_quotes and one in price_runs.
 *
 * Nothing is published by this job (the owner, 25 October 2026: read by the
 * platform, approved by a click). Every figure it reads is written held: with
 * the reason AWAITING_REASON when its reader read it with certainty and it sits
 * within a day's movement of the last published figure — the administrator's
 * one click approves those — and with its own reason when it strays or comes
 * from free prose (Gedaref), which are decided one by one. A figure no newer
 * than the last one already shown is skipped — the run adds days, it does not
 * repeat them. What is read is kept: nothing in market_quotes is ever deleted
 * except by an administrator's erasure.
 */

interface Source {
  base: string;
  search: string;
  /** How far back to look, in days. */
  days: number;
}

const BANK: Source[] = [
  { base: "https://iqraa24.com", search: "بنك الخرطوم", days: FX_WINDOW_DAYS },
  { base: "https://bajnews.net", search: "بنك الخرطوم", days: FX_WINDOW_DAYS },
  { base: "https://bajnews.net", search: "الدولار", days: FX_WINDOW_DAYS },
];
const PARALLEL: Source[] = [
  { base: "https://bajnews.net", search: "الموازية", days: FX_WINDOW_DAYS },
  { base: "https://bajnews.net", search: "الدولار", days: FX_WINDOW_DAYS },
  // 25 أكتوبر 2026 (البند ١٩٦): خبرٌ شبه يوميّ بأسعار السوق الموازي، وواجهته المنظَّمة تردّ للأجهزة.
  { base: "https://alghadalsudani.com", search: "الدولار", days: FX_WINDOW_DAYS },
];
const OBEID: Source[] = [{ base: "https://sudafax.com", search: "سوق الأبيض", days: CROP_WINDOW_DAYS }];
const GEDAREF: Source[] = [{ base: "https://sudafax.com", search: "القضارف", days: CROP_WINDOW_DAYS }];

const isPost = (p: unknown): p is WpPost => {
  const r = p as WpPost;
  return Boolean(r && typeof r.id === "number" && typeof r.date === "string" && typeof r.link === "string"
    && r.link.startsWith("https://") && typeof r.title?.rendered === "string" && typeof r.content?.rendered === "string");
};

/** The site's newest matching articles, newest first; an empty list and the reason when it fails. */
async function fetchPosts(src: Source): Promise<{ posts: WpPost[]; error?: string }> {
  const after = new Date(Date.now() - src.days * 86_400_000).toISOString().slice(0, 19);
  const url =
    `${src.base}/wp-json/wp/v2/posts?search=${encodeURIComponent(src.search)}&after=${after}` +
    `&per_page=10&orderby=date&order=desc&_fields=id,date,link,title,content`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": `SudagriPrices/1.0 (+${SITE_URL})` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return { posts: [], error: `${new URL(src.base).host} «${src.search}»: ${res.status}` };
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return { posts: [], error: `${new URL(src.base).host}: not a list` };
    return { posts: body.filter(isPost) };
  } catch (e) {
    return { posts: [], error: `${new URL(src.base).host}: ${e instanceof Error ? e.message : "failed"}` };
  }
}

export interface RefreshSummary {
  found: number;
  published: number;
  held: number;
  errors: string[];
}

export type Row = Record<string, unknown> & { status: "held" };

async function lastFx(admin: SupabaseClient, kind: "fx_bank" | "fx_parallel") {
  const { data } = await admin
    .from("market_quotes")
    .select("market_date, buy, sell")
    .eq("kind", kind)
    .eq("status", "published")
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const file = readFxReference();
  const fromFile = file ? (kind === "fx_bank" ? file.bank : file.parallel) : null;
  const db = data as { market_date: string; buy: number | null; sell: number } | null;
  if (db && (!fromFile || db.market_date >= fromFile.date)) {
    return { date: db.market_date, buy: db.buy === null ? null : Number(db.buy), sell: Number(db.sell) };
  }
  return fromFile ? { date: fromFile.date, buy: fromFile.buy ?? null, sell: fromFile.sell } : null;
}

async function lastCrop(admin: SupabaseClient, market: string, crop: string, unit: string) {
  const { data } = await admin
    .from("market_quotes")
    .select("market_date, price")
    .eq("kind", "crop")
    .eq("market", market)
    .eq("crop", crop)
    .eq("unit", unit)
    .eq("status", "published")
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const series = readMarketPrices()?.series.find((s) => s.market === market && s.crop === crop && s.unit === unit);
  const filePoint = series?.history.at(-1);
  const db = data as { market_date: string; price: number } | null;
  if (db && (!filePoint || db.market_date >= filePoint.date)) return { date: db.market_date, price: Number(db.price) };
  return filePoint ? { date: filePoint.date, price: filePoint.price } : null;
}

/**
 * The newest figure any source gives, and the other sources' figures for the same day. Not the first source that
 * reads: a site that publishes late must not beat a newer article elsewhere (found by verify-price-refresh.ts on
 * 25 October 2026, when bajnews's 21 October sentence came ahead of Alghad's 23 October one). The sources' order
 * decides only between equal days.
 */
async function newestRead<T extends { date: string }>(sources: Source[], read: (p: WpPost) => T | null, errors: string[]) {
  const found: { q: T; post: WpPost }[] = [];
  for (const src of sources) {
    const { posts, error } = await fetchPosts(src);
    if (error) errors.push(error);
    for (const post of posts) {
      const q = read(post);
      if (q) {
        found.push({ q, post });
        break;
      }
    }
  }
  found.sort((a, b) => (a.q.date < b.q.date ? 1 : a.q.date > b.q.date ? -1 : 0));
  const [best, ...rest] = found;
  return best ? { ...best, sameDay: rest.filter((f) => f.q.date === best.q.date && f.post.link !== best.post.link) } : null;
}

/** Two sources reading the same day further apart than this are not in agreement: a person decides. */
const SOURCES_AGREE = 0.05;

/**
 * The selling prices already kept for this day from other sources (held or published, not rejected). A source that
 * disagrees may have been read on an earlier run, or the same source's row may already be stored: comparing within
 * one run only let the earlier row keep its place in the one click (backlog 198 C6).
 */
async function storedSameDay(admin: SupabaseClient, row: Row, errors: string[]): Promise<{ q: { sell: number } }[]> {
  const { data, error } = await admin
    .from("market_quotes")
    .select("sell, source_url")
    .eq("kind", row.kind as string)
    .eq("market_date", row.market_date as string)
    .neq("status", "rejected");
  if (error) errors.push(`same day: ${error.message}`);
  return ((data ?? []) as { sell: number | null; source_url: string }[])
    .filter((d) => d.sell !== null && d.source_url !== row.source_url)
    .map((d) => ({ q: { sell: Number(d.sell) } }));
}

/**
 * When the sources disagree on a day, every row of that day still waiting for the one click leaves it, the ones
 * stored on earlier runs too: the administrator decides that day figure by figure.
 */
async function holdDayOut(admin: SupabaseClient, row: Row, reason: string, errors: string[]) {
  const { error } = await admin
    .from("market_quotes")
    .update({ reason })
    .eq("kind", row.kind as string)
    .eq("market_date", row.market_date as string)
    .eq("status", "held")
    .eq("reason", AWAITING_REASON);
  if (error) errors.push(`hold day: ${error.message}`);
}

/** One currency figure: its row, compared with what this run and earlier runs read for the same day. */
async function fxFigure(
  admin: SupabaseClient,
  kind: "fx_bank" | "fx_parallel",
  read: { q: FxQuote; post: WpPost; sameDay: { q: FxQuote }[] },
  last: { buy: number | null; sell: number } | null,
  errors: string[],
): Promise<Row> {
  const row = fxRow(kind, read.q, read.post.link, last?.sell ?? null, last?.buy ?? null);
  const others = [...read.sameDay, ...(await storedSameDay(admin, row, errors))];
  const apart = apartFrom(read.q.sell, others);
  if (apart !== null) {
    const reason = disagreeReason(read.q.sell, apart);
    if (row.reason === AWAITING_REASON) row.reason = reason;
    await holdDayOut(admin, row, reason, errors);
  }
  return row;
}

export async function refreshPrices(admin: SupabaseClient, trigger: "cron" | "admin"): Promise<RefreshSummary> {
  const errors: string[] = [];
  const rows: Row[] = [];
  const { data: run } = await admin.from("price_runs").insert({ trigger }).select("id").single();

  // ── العملات ──
  const bankLast = await lastFx(admin, "fx_bank");
  const bank = await newestRead(BANK, readBank, errors);
  if (bank && (!bankLast || bank.q.date > bankLast.date)) {
    rows.push(await fxFigure(admin, "fx_bank", bank, bankLast, errors));
  }

  const parallelLast = await lastFx(admin, "fx_parallel");
  const parallel = await newestRead(PARALLEL, readParallelMarket, errors);
  if (parallel && (!parallelLast || parallel.q.date > parallelLast.date)) {
    const row = await fxFigure(admin, "fx_parallel", parallel, parallelLast, errors);
    const bankSell = bank?.q.sell ?? bankLast?.sell ?? null;
    if (row.reason === AWAITING_REASON && bankSell && parallel.q.sell < bankSell) {
      row.reason = `أدنى من سعر البنك (${bankSell}) — يُراجَع`;
    }
    rows.push(row);
  }

  // ── المحاصيل ──
  for (const [sources, read, alwaysHold] of [
    [OBEID, readObeidList, false],
    [GEDAREF, readGedarefProse, true],
  ] as const) {
    for (const src of sources) {
      const { posts, error } = await fetchPosts(src);
      if (error) errors.push(error);
      for (const post of [...posts].reverse()) {
        for (const q of read(post)) {
          const last = await lastCrop(admin, q.market, q.crop, q.unit);
          if (last && q.date <= last.date) continue;
          if (rows.some((r) => r.kind === "crop" && r.market === q.market && r.crop === q.crop && r.market_date === q.date)) continue;
          rows.push(cropRow(q, post.link, last?.price ?? null, alwaysHold));
        }
      }
    }
  }

  let published = 0;
  let held = 0;
  if (rows.length > 0) {
    const { data: written, error } = await admin
      .from("market_quotes")
      .upsert(rows, { onConflict: "kind,market,crop,market_date,source_url", ignoreDuplicates: true })
      .select("status");
    if (error) errors.push(`write: ${error.message}`);
    for (const w of (written ?? []) as { status: string }[]) {
      if (w.status === "published") published++;
      else held++;
    }
  }

  // A feed whose newest figure is older than the window this run looks back over is broken, not
  // quiet (GAP-3): say so in the run, where /admin/prices and the server log both show it.
  const stale = staleLines(await loadFeedStates(admin));
  if (stale.length > 0) console.error("prices: stale feeds", stale);
  errors.push(...stale);

  const summary = { found: rows.length, published, held, errors: errors.slice(0, 20) };
  if (run) {
    await admin
      .from("price_runs")
      .update({ finished_at: new Date().toISOString(), found: summary.found, published, held, errors: summary.errors })
      .eq("id", (run as { id: string }).id);
  }
  return summary;
}

/** The first other selling price for the same day further from this one than the sources may differ, or null. */
export function apartFrom(sell: number, others: { q: { sell: number } }[]): number | null {
  return others.find((o) => Math.abs(o.q.sell - sell) / sell > SOURCES_AGREE)?.q.sell ?? null;
}

const disagreeReason = (sell: number, other: number) => `المصادر تختلف في هذا اليوم: ${sell} هنا و${other} في مصدرٍ آخر — يُراجَع`;

/** A row whose day another source read differently is no longer the one click's: both figures are in the reason. */
export function disagreement(row: Row, q: FxQuote, sameDay: { q: { sell: number } }[]): Row {
  if (row.reason !== AWAITING_REASON) return row;
  const apart = apartFrom(q.sell, sameDay);
  if (apart !== null) row.reason = disagreeReason(q.sell, apart);
  return row;
}

/** Buying is judged as selling is — the same range and the same day's movement — and may not sit far below it. */
function buyReason(q: FxQuote, lastBuy: number | null): string | null {
  const own = holdReason(q.buy, lastBuy, 0.25, [500, 200_000]);
  if (own) return `سعر الشراء: ${own}`;
  if (q.buy < q.sell * 0.75) return `سعر الشراء (${q.buy}) أدنى من البيع (${q.sell}) بأكثر من ٢٥٪ — يُراجَع`;
  return null;
}

export function fxRow(kind: "fx_bank" | "fx_parallel", q: FxQuote, link: string, lastSell: number | null, lastBuy: number | null = null): Row {
  // Selling and buying are both judged (backlog 198 C4: a buying price of 9.6 once passed, checked only against selling).
  const reason = q.buy > q.sell ? "سعر الشراء أعلى من البيع" : (holdReason(q.sell, lastSell, 0.25, [500, 200_000]) ?? buyReason(q, lastBuy));
  // Every row carries the same columns: PostgREST writes one batch with the union of the rows' keys and sets a
  // missing one to NULL, not to the column's default — and `market`/`crop` are NOT NULL (found 25 October 2026:
  // a run with a dollar and a crop figure wrote nothing).
  return {
    kind,
    market: "",
    crop: "",
    unit: null,
    market_date: q.date,
    buy: q.buy,
    sell: q.sell,
    price: null,
    source_url: link,
    quote: q.quote.slice(0, 600),
    status: "held",
    reason: reason ?? AWAITING_REASON,
  };
}

export function cropRow(q: CropQuote, link: string, lastPrice: number | null, alwaysHold: boolean): Row {
  const reason = alwaysHold
    ? "نصٌّ حرّ من نشرة القضارف — يُنشر بعد المراجعة"
    : holdReason(q.price, lastPrice, 0.5, [1_000, 1_000_000_000]);
  return {
    kind: "crop",
    market: q.market,
    crop: q.crop,
    unit: q.unit,
    market_date: q.date,
    buy: null,
    sell: null,
    price: q.price,
    source_url: link,
    quote: q.quote.slice(0, 600),
    status: "held",
    reason: reason ?? AWAITING_REASON,
  };
}
