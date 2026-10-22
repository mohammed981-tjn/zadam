import { createPublicClient } from "@/lib/supabase/public";
import { readFxReference, type FxReference } from "@/lib/fxRates";
import { readMarketPrices, type MarketPrices } from "@/lib/marketPrices";

/**
 * The prices every page shows: the newest of the hand-kept files and what the
 * daily run published (backlog 131).
 *
 * The files (content/fx/reference.json, content/market/prices.json) stay the
 * floor — they hold the history the run starts from, and a page still shows
 * them on a database the migration has not reached or a day the run failed.
 * A published row replaces a file figure only when its market day is newer.
 *
 * Read with the public client: only published rows come back, the same for
 * every visitor.
 */

interface QuoteRow {
  kind: "fx_bank" | "fx_parallel" | "crop";
  market: string;
  crop: string;
  unit: string | null;
  market_date: string;
  buy: number | null;
  sell: number | null;
  price: number | null;
  source_url: string;
}

async function publishedSince(kinds: QuoteRow["kind"][], since: string): Promise<QuoteRow[]> {
  try {
    const { data, error } = await createPublicClient()
      .from("market_quotes")
      .select("kind, market, crop, unit, market_date, buy, sell, price, source_url")
      .in("kind", kinds)
      .gte("market_date", since)
      .order("market_date", { ascending: true })
      .limit(500);
    if (error) return [];
    return (data ?? []) as QuoteRow[];
  } catch {
    return [];
  }
}

/** Bank of Khartoum and the parallel market: the file's figure, or a newer published one. */
export async function currentFx(): Promise<FxReference | null> {
  const file = readFxReference();
  const since = file ? [file.bank.date, file.parallel.date].sort()[0] : "2026-01-01";
  const rows = await publishedSince(["fx_bank", "fx_parallel"], since);
  const newest = (kind: "fx_bank" | "fx_parallel") => rows.filter((r) => r.kind === kind).at(-1);
  const bank = newest("fx_bank");
  const parallel = newest("fx_parallel");
  if (!file) {
    if (!bank || !parallel) return null;
    return {
      bank: { name_ar: "بنك الخرطوم", name_en: "Bank of Khartoum", date: bank.market_date, buy: Number(bank.buy), sell: Number(bank.sell), source: bank.source_url },
      parallel: { date: parallel.market_date, buy: Number(parallel.buy), sell: Number(parallel.sell), source: parallel.source_url },
    };
  }
  return {
    bank:
      bank && bank.market_date > file.bank.date
        ? { ...file.bank, date: bank.market_date, buy: Number(bank.buy), sell: Number(bank.sell), source: bank.source_url }
        : file.bank,
    parallel:
      parallel && parallel.market_date > file.parallel.date
        ? { date: parallel.market_date, buy: Number(parallel.buy), sell: Number(parallel.sell), source: parallel.source_url }
        : file.parallel,
  };
}

/**
 * The bourse series: the file's history with every newer published day added
 * to its crop's series, and «checked» moved to the day the run last looked.
 */
export async function currentMarketPrices(): Promise<MarketPrices | null> {
  const file = readMarketPrices();
  if (!file) return null;
  const since = file.series.map((s) => s.history.at(-1)?.date ?? "2026-01-01").sort()[0] ?? "2026-01-01";
  const [rows, lastRun] = await Promise.all([publishedSince(["crop"], since), lastRunDay()]);
  const series = file.series.map((s) => {
    const newer = rows.filter(
      (r) => r.market === s.market && r.crop === s.crop && r.unit === s.unit && r.market_date > (s.history.at(-1)?.date ?? ""),
    );
    if (newer.length === 0) return s;
    const byDay = new Map(newer.map((r) => [r.market_date, r]));
    return {
      ...s,
      history: [
        ...s.history,
        ...[...byDay.values()].map((r) => ({ date: r.market_date, price: Number(r.price), source: r.source_url })),
      ],
    };
  });
  const checked = lastRun && lastRun > file.checked ? lastRun : file.checked;
  return { ...file, checked, series };
}

async function lastRunDay(): Promise<string | null> {
  try {
    const { data, error } = await createPublicClient().rpc("price_last_run");
    if (error || !data) return null;
    return new Date(String(data)).toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
  } catch {
    return null;
  }
}
