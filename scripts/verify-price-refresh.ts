/**
 * The daily price run publishes nothing (backlog 196; the owner, 25 October 2026:
 * «لا تنشر شي للعامة واسالني وانا اختار الإجابة»).
 *
 *   npx tsx scripts/verify-price-refresh.ts
 *
 * Runs the real `refreshPrices` against the real articles (scripts/fixtures/price-feeds)
 * served in place of the sites, and a database that only records what it is asked to write.
 * Whatever the readers find, every row the run writes must be held — the administrator's click
 * is the only way a figure reaches visitors — and a figure read with certainty must carry the
 * exact words the database's one-click approval looks for.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AWAITING_REASON } from "../src/lib/priceFreshness";
import { cropRow, disagreement, fxRow, refreshPrices, type Row } from "../src/lib/priceRefresh";
import type { CropQuote, FxQuote } from "../src/lib/priceFeeds";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const fixtures = join(__dirname, "fixtures/price-feeds");
const post = (name: string) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));

console.log("The words the database's one-click approval looks for");
const migration = readFileSync(join(__dirname, "../supabase/migrations/20261025120000_market_quotes_keep.sql"), "utf8");
ok(migration.includes(`reason = '${AWAITING_REASON}'`), "AWAITING_REASON is, letter for letter, the reason market_quote_review_all approves");

console.log("\nA single row");
const fx: FxQuote = { date: "2026-10-23", buy: 9670, sell: 10250, quote: "…" };
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105).status === "held", "a figure within a day's movement is held, not published");
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105).reason === AWAITING_REASON, "and waits under the approvable reason");
ok(fxRow("fx_parallel", fx, "https://x.example/1", null).reason === AWAITING_REASON, "the first ever figure also waits, it is not published");
ok(fxRow("fx_parallel", { ...fx, sell: 20000 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "a figure that strays 95% waits under its own reason, outside the one click");
ok(fxRow("fx_parallel", { ...fx, buy: 11000 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "buying above selling waits under its own reason");
const agree = (other: number) => disagreement(fxRow("fx_parallel", fx, "https://x.example/1", 10105), fx, [{ q: { ...fx, sell: other } }]);
ok(agree(10300).reason === AWAITING_REASON, "two sources within 5% of each other keep the one click");
ok(agree(12000).reason !== AWAITING_REASON && String(agree(12000).reason).includes("12000"), "two sources 17% apart leave it to a person, with both figures in the reason");
ok(disagreement(fxRow("fx_parallel", { ...fx, sell: 20000 }, "https://x.example/1", 10105), fx, [{ q: { ...fx, sell: 12000 } }]).reason?.toString().startsWith("تغيّر") === true,
  "a row already held for another reason keeps that reason");
const crop: CropQuote = { market: "obeid", crop: "millet", unit: "ardeb", date: "2026-10-14", price: 1575000, quote: "…" };
ok(cropRow(crop, "https://x.example/2", 1500000, false).status === "held", "a crop figure is held too");
ok(cropRow(crop, "https://x.example/2", 1500000, false).reason === AWAITING_REASON, "within half its last price it waits for the one click");
ok(cropRow(crop, "https://x.example/2", 500000, false).reason !== AWAITING_REASON, "tripled, it waits under its own reason");
ok(cropRow({ ...crop, market: "gedaref" }, "https://x.example/2", 1500000, true).reason !== AWAITING_REASON, "free prose from Gedaref is never in the one click");

async function main() {
  console.log("\nThe whole run");

  // The files the run compares against: older than the fixtures, so every article is news.
  const work = mkdtempSync(join(tmpdir(), "price-refresh-"));
  mkdirSync(join(work, "content/fx"), { recursive: true });
  writeFileSync(
    join(work, "content/fx/reference.json"),
    JSON.stringify({
      bank: { date: "2026-10-15", buy: 4800, sell: 4830, source: "x" },
      parallel: { date: "2026-10-15", buy: 9400, sell: 9900, source: "x" },
    }),
  );
  process.chdir(work);

  const gedaref = {
    id: 7,
    date: "2026-10-22T10:00:00",
    link: "https://sudafax.com/gedaref-7",
    title: { rendered: "أسعار المحاصيل في بورصة القضارف" },
    content: { rendered: "<p>سجّل سعر قنطار السمسم في بورصة القضارف 520 ألف جنيه.</p>" },
  };
  const served: Record<string, unknown[]> = {
    "iqraa24.com": [post("iqraa24-45070.json")],
    "bajnews.net": [post("bajnews-201602.json")],
    "alghadalsudani.com": [post("alghadalsudani-34920.json")],
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const body = url.host === "sudafax.com"
      ? (url.searchParams.get("search") === "القضارف" ? [gedaref] : [post("sudafax-585058.json")])
      : (served[url.host] ?? []);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const written: Row[] = [];
  // A database that answers "nothing yet" to every question and remembers every row it is given.
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      order: () => c,
      limit: () => c,
      insert: () => c,
      update: () => c,
      maybeSingle: async () => ({ data: null }),
      single: async () => ({ data: { id: "run-1" } }),
      upsert: (rows: Row[]) => {
        written.push(...rows);
        return { select: async () => ({ data: rows.map((r) => ({ status: r.status })), error: null }) };
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    };
    return c;
  };
  const admin = { from: () => chain() } as unknown as Parameters<typeof refreshPrices>[0];

  const quiet = console.error;
  console.error = () => {};
  const summary = await refreshPrices(admin, "cron");
  console.error = quiet;

  ok(written.length > 0, `the run found figures (${written.length})`);
  ok(written.every((r) => r.status === "held"), "every row it wrote is held — none published");
  ok(summary.published === 0, "and the summary counts none published");
  ok(written.some((r) => r.kind === "fx_bank"), "the bank's dollar was read");
  const parallelRows = written.filter((r) => r.kind === "fx_parallel");
  ok(parallelRows.length === 1 && parallelRows[0].market_date === "2026-10-23", "one parallel figure, the newest day any source gave (23 October, not bajnews's 21st)");
  ok(written.filter((r) => r.kind === "fx_bank").every((r) => r.reason === AWAITING_REASON), "the bank's two sources agree on the day, so the one click stays");
  ok(written.some((r) => r.kind === "fx_parallel" && r.sell === 10250 && r.buy === 9670), "the parallel market's dollar was read from the Alghad article, buying 9,670 and selling 10,250");
  ok(written.some((r) => r.kind === "crop" && r.market === "obeid"), "the El Obeid list was read");
  ok(
    written.filter((r) => r.kind !== "crop" || r.market === "obeid").every((r) => r.reason === AWAITING_REASON),
    "what the readers read with certainty waits under the approvable reason",
  );
  ok(written.filter((r) => r.market === "gedaref").every((r) => r.reason !== AWAITING_REASON), "free prose from Gedaref is held under its own reason");
  ok(written.every((r) => typeof r.source_url === "string" && String(r.source_url).startsWith("https://") && String(r.quote).length > 0), "every row carries its source link and the words it was read from");

  console.log("");
  if (failed) {
    console.log(`${failed} FAILED`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED — the run reads and holds; only the administrator publishes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
