import { NextResponse } from "next/server";
import { loadRates } from "@/lib/priceBoards";
import { CBOS_NOTE, FX_NAME, FX_SOURCE_URL, FX_STALE_DAYS, ageInDays, type QuotedRate } from "@/lib/fxRates";

/**
 * «أسعار العملات» في التطبيق (البند ٢٠٣): what /rates shows, from the same loader (`loadRates`) — the Bank of
 * Khartoum's and the parallel market's dollar, each with its date, age, source and the three-day warning, and every
 * currency at each. Public, as the page is.
 */
export async function GET() {
  const now = new Date();
  const { ref, bankTable, parallelTable, rows } = await loadRates();
  const quote = (q: QuotedRate) => {
    const age = ageInDays(q.date, now);
    return { buy: q.buy, sell: q.sell, date: q.date, source: q.source, age_days: age, stale: age > FX_STALE_DAYS };
  };
  return NextResponse.json(
    {
      stale_days: FX_STALE_DAYS,
      bank: ref ? { name: ref.bank.name_ar, ...quote(ref.bank) } : null,
      parallel: ref ? quote(ref.parallel) : null,
      table: rows.map((c) => ({ code: c, name: FX_NAME[c].ar, bank: bankTable[c] ?? null, parallel: parallelTable[c] ?? null })),
      cbos: { last_bulletin: CBOS_NOTE.lastBulletin, liberalised: CBOS_NOTE.liberalised, circular: CBOS_NOTE.circular, source: CBOS_NOTE.liberalisedSource },
      cross_source: FX_SOURCE_URL,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
