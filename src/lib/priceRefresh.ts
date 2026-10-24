import type { SupabaseClient } from "@supabase/supabase-js";
import { readFxReference } from "@/lib/fxRates";
import { readMarketPrices } from "@/lib/marketPrices";
import { CROP_WINDOW_DAYS, FX_WINDOW_DAYS, loadFeedStates, staleLines } from "@/lib/priceFreshness";
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
 * A figure is published when its reader read it with certainty and it sits
 * within a day's movement of the last published figure; otherwise it is held
 * for an administrator. Gedaref's prose is always held. A figure no newer than
 * the last one already shown is skipped — the run adds days, it does not
 * repeat them.
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

type Row = Record<string, unknown> & { status: "published" | "held" };

async function lastFx(admin: SupabaseClient, kind: "fx_bank" | "fx_parallel") {
  const { data } = await admin
    .from("market_quotes")
    .select("market_date, sell")
    .eq("kind", kind)
    .eq("status", "published")
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const file = readFxReference();
  const fromFile = file ? (kind === "fx_bank" ? file.bank : file.parallel) : null;
  const db = data as { market_date: string; sell: number } | null;
  if (db && (!fromFile || db.market_date >= fromFile.date)) return { date: db.market_date, sell: Number(db.sell) };
  return fromFile ? { date: fromFile.date, sell: fromFile.sell } : null;
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

/** The first article of the first source that a reader can read. */
async function firstRead<T>(sources: Source[], read: (p: WpPost) => T | null, errors: string[]) {
  for (const src of sources) {
    const { posts, error } = await fetchPosts(src);
    if (error) errors.push(error);
    for (const post of posts) {
      const q = read(post);
      if (q) return { q, post };
    }
  }
  return null;
}

export async function refreshPrices(admin: SupabaseClient, trigger: "cron" | "admin"): Promise<RefreshSummary> {
  const errors: string[] = [];
  const rows: Row[] = [];
  const { data: run } = await admin.from("price_runs").insert({ trigger }).select("id").single();

  // ── العملات ──
  const bankLast = await lastFx(admin, "fx_bank");
  const bank = await firstRead(BANK, readBank, errors);
  if (bank && (!bankLast || bank.q.date > bankLast.date)) rows.push(fxRow("fx_bank", bank.q, bank.post.link, bankLast?.sell ?? null));

  const parallelLast = await lastFx(admin, "fx_parallel");
  const parallel = await firstRead(PARALLEL, readParallelMarket, errors);
  if (parallel && (!parallelLast || parallel.q.date > parallelLast.date)) {
    const row = fxRow("fx_parallel", parallel.q, parallel.post.link, parallelLast?.sell ?? null);
    const bankSell = bank?.q.sell ?? bankLast?.sell ?? null;
    if (row.status === "published" && bankSell && parallel.q.sell < bankSell) {
      row.status = "held";
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

function fxRow(kind: "fx_bank" | "fx_parallel", q: FxQuote, link: string, lastSell: number | null): Row {
  const reason = q.buy > q.sell ? "سعر الشراء أعلى من البيع" : holdReason(q.sell, lastSell, 0.25, [500, 200_000]);
  return {
    kind,
    market_date: q.date,
    buy: q.buy,
    sell: q.sell,
    source_url: link,
    quote: q.quote.slice(0, 600),
    status: reason ? "held" : "published",
    reason,
  };
}

function cropRow(q: CropQuote, link: string, lastPrice: number | null, alwaysHold: boolean): Row {
  const reason = alwaysHold
    ? "نصٌّ حرّ من نشرة القضارف — يُنشر بعد المراجعة"
    : holdReason(q.price, lastPrice, 0.5, [1_000, 1_000_000_000]);
  return {
    kind: "crop",
    market: q.market,
    crop: q.crop,
    unit: q.unit,
    market_date: q.date,
    price: q.price,
    source_url: link,
    quote: q.quote.slice(0, 600),
    status: reason ? "held" : "published",
    reason,
  };
}
