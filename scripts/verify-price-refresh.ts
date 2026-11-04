/**
 * The daily price run writes every figure held, then publishes only what was read with certainty (backlog 196; the
 * owner, 4 November 2026, question 16 of the audit: «الأسعار تُنشر بلا اعتمادي» — until then the trusted figures waited
 * for a click that decided nothing).
 *
 *   npx tsx scripts/verify-price-refresh.ts
 *
 * Runs the real `refreshPrices` against the real articles (scripts/fixtures/price-feeds)
 * served in place of the sites, and a database that only records what it is asked to write.
 * Whatever the readers find, every row the run writes must be held (the service key cannot publish), a figure read with
 * certainty must carry the exact words market_quotes_publish_trusted looks for, and only those rows' ids go to it —
 * never a stray, a disputed day or Gedaref's free prose, which wait for the administrator.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AWAITING_REASON } from "../src/lib/priceFreshness";
import { apartFrom, cropRow, disagreement, fxRow, NO_BASELINE_REASON, refreshPrices, type Row } from "../src/lib/priceRefresh";
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
const crop0 = (): CropQuote => ({ market: "obeid", crop: "millet", unit: "ardeb", date: "2026-10-14", price: 1575000, quote: "…" });
const fx: FxQuote = { date: "2026-10-23", buy: 9670, sell: 10250, quote: "…" };
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105).status === "held", "a figure within a day's movement is held, not published");
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105).reason === AWAITING_REASON, "and waits under the approvable reason");
ok(fxRow("fx_parallel", fx, "https://x.example/1", null).reason === NO_BASELINE_REASON,
  "the first ever figure waits for a person: with no earlier figure there is nothing to judge a day's movement by");
ok(cropRow(crop0(), "https://x.example/2", null, false).reason === NO_BASELINE_REASON, "and so does a crop's first");
ok(fxRow("fx_parallel", { ...fx, sell: 20000 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "a figure that strays 95% waits under its own reason, outside the one click");
ok(fxRow("fx_parallel", { ...fx, buy: 11000 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "buying above selling waits under its own reason");
const agree = (other: number) => disagreement(fxRow("fx_parallel", fx, "https://x.example/1", 10105), fx, [{ q: { ...fx, sell: other } }]);
ok(agree(10300).reason === AWAITING_REASON, "two sources within 5% of each other keep the one click");
ok(agree(12000).reason !== AWAITING_REASON && String(agree(12000).reason).includes("12000"), "two sources 17% apart leave it to a person, with both figures in the reason");
ok(disagreement(fxRow("fx_parallel", { ...fx, sell: 20000 }, "https://x.example/1", 10105), fx, [{ q: { ...fx, sell: 12000 } }]).reason?.toString().startsWith("تغيّر") === true,
  "a row already held for another reason keeps that reason");
// Buying is judged too (backlog 198 C4): «شراء الدولار 9.6 ألف» once read as 9.6 passed under the approvable reason.
ok(fxRow("fx_parallel", { ...fx, buy: 9.6 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "a buying price of 9.6 beside selling 10,250 waits under its own reason");
ok(fxRow("fx_parallel", { ...fx, buy: 5000 }, "https://x.example/1", 10105).reason !== AWAITING_REASON, "buying half of selling waits under its own reason");
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105, 6000).reason !== AWAITING_REASON, "buying 61% above the last buying price waits under its own reason");
ok(fxRow("fx_parallel", fx, "https://x.example/1", 10105, 9500).reason === AWAITING_REASON, "buying within a day's movement keeps the one click");
ok(apartFrom(10250, [{ q: { sell: 12000 } }]) === 12000 && apartFrom(10250, [{ q: { sell: 10300 } }]) === null, "apartFrom finds the source more than 5% away");
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

  type Stored = { kind: string; market_date: string; sell: number; source_url: string; status: string; reason: string };
  // A database that answers "nothing yet" to every question but the rows it is given as already stored, and remembers
  // every row it is asked to write and every update.
  const fakeDb = (stored: Stored[]) => {
    const written: Row[] = [];
    const updates: { table: string; set: Record<string, unknown>; where: Record<string, unknown> }[] = [];
    const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
    const chain = (table: string): Record<string, unknown> => {
      const where: Record<string, unknown> = {};
      const not: Record<string, unknown> = {};
      let set: Record<string, unknown> | null = null;
      const c: Record<string, unknown> = {
        select: () => c,
        eq: (k: string, v: unknown) => ((where[k] = v), c),
        neq: (k: string, v: unknown) => ((not[k] = v), c),
        order: () => c,
        limit: () => c,
        insert: () => c,
        update: (v: Record<string, unknown>) => ((set = v), c),
        maybeSingle: async () => ({ data: null }),
        single: async () => ({ data: { id: "run-1" } }),
        upsert: (rows: Row[]) => {
          written.push(...rows);
          return {
            select: async () => ({
              data: rows.map((r, i) => ({ id: `row-${written.length - rows.length + i}`, status: r.status, reason: r.reason })),
              error: null,
            }),
          };
        },
        then: (resolve: (v: unknown) => void) => {
          if (set) {
            updates.push({ table, set, where: { ...where } });
            for (const r of stored) {
              if (Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) Object.assign(r, set);
            }
            return resolve({ data: null, error: null });
          }
          // Only the same-day question names a market_date without a status: it gets the stored rows.
          if (table === "market_quotes" && "market_date" in where && !("status" in where)) {
            const data = stored.filter((r) =>
              Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v) &&
              Object.entries(not).every(([k, v]) => (r as Record<string, unknown>)[k] !== v));
            return resolve({ data, error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return c;
    };
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: fn === "market_quotes_publish_trusted" ? (args.p_ids as string[]).length : 0, error: null };
    };
    return { written, updates, rpcs, admin: { from: (t: string) => chain(t), rpc } as unknown as Parameters<typeof refreshPrices>[0] };
  };
  const run = async (stored: Stored[]) => {
    const db = fakeDb(stored);
    const quiet = console.error;
    console.error = () => {};
    try {
      return { ...db, summary: await refreshPrices(db.admin, "cron") };
    } finally {
      console.error = quiet;
    }
  };

  const { written, summary, rpcs } = await run([]);

  ok(written.length > 0, `the run found figures (${written.length})`);
  const keys = (r: Row) => Object.keys(r).sort().join(",");
  ok(new Set(written.map(keys)).size === 1,
    "every row carries the same columns — PostgREST would set a key missing from one row to NULL in the whole batch");
  ok(written.every((r) => r.market !== null && r.market !== undefined && r.crop !== null && r.crop !== undefined),
    "and market/crop are never NULL (they are NOT NULL in the table)");
  ok(written.every((r) => r.status === "held"), "every row it wrote is held — the service key cannot publish");
  const publishCall = rpcs.find((c) => c.fn === "market_quotes_publish_trusted");
  const trustedIds = written.map((r, i) => (r.reason === AWAITING_REASON ? `row-${i}` : null)).filter(Boolean);
  ok(!!publishCall && JSON.stringify(publishCall.args.p_ids) === JSON.stringify(trustedIds) && trustedIds.length > 0,
    `only the rows read with certainty go to market_quotes_publish_trusted (${trustedIds.length} of ${written.length})`);
  ok(summary.published === trustedIds.length && summary.held === written.length - trustedIds.length,
    "and the summary counts them published, the rest held");
  ok(rpcs.some((c) => c.fn === "price_feeds_alert" && Array.isArray(c.args.p_lines)),
    "and the run asks price_feeds_alert whether to tell the administrators (ops-6)");
  ok(written.some((r) => r.kind === "fx_bank"), "the bank's dollar was read");
  const parallelRows = written.filter((r) => r.kind === "fx_parallel");
  ok(parallelRows.length === 1 && parallelRows[0].market_date === "2026-10-23", "one parallel figure, the newest day any source gave (23 October, not bajnews's 21st)");
  ok(written.filter((r) => r.kind === "fx_bank").every((r) => r.reason === AWAITING_REASON), "the bank's two sources agree on the day, so the one click stays");
  ok(written.some((r) => r.kind === "fx_parallel" && r.sell === 10250 && r.buy === 9670), "the parallel market's dollar was read from the Alghad article, buying 9,670 and selling 10,250");
  ok(written.some((r) => r.kind === "crop" && r.market === "obeid"), "the El Obeid list was read");
  ok(
    written.filter((r) => r.kind !== "crop" || r.market === "obeid").every((r) => r.reason === AWAITING_REASON || r.reason === NO_BASELINE_REASON)
      && written.some((r) => r.reason === AWAITING_REASON),
    "what the readers read with certainty is trusted, or waits only because there is no earlier figure to judge it by",
  );
  ok(written.filter((r) => r.market === "gedaref").every((r) => r.reason !== AWAITING_REASON), "free prose from Gedaref is held under its own reason");
  ok(written.every((r) => typeof r.source_url === "string" && String(r.source_url).startsWith("https://") && String(r.quote).length > 0), "every row carries its source link and the words it was read from");


  console.log("\nA disagreement found on a later run (backlog 198 C6)");
  // Another source read 23 October as 12,000 on an earlier run; that row still waits for the one click.
  const earlier: Stored = {
    kind: "fx_parallel", market_date: "2026-10-23", sell: 12000, source_url: "https://other.example/23",
    status: "held", reason: AWAITING_REASON,
  };
  const later = await run([earlier]);
  const today = later.written.find((r) => r.kind === "fx_parallel");
  ok(today !== undefined && today.reason !== AWAITING_REASON && String(today.reason).includes("12000"),
    "today's 10,250 for the same day leaves the one click, with both figures in the reason");
  ok(earlier.reason !== AWAITING_REASON && earlier.status === "held",
    "and the row stored on the earlier run leaves it too — still held, under the disagreement");
  ok(later.updates.some((u) => u.where.status === "held" && u.where.reason === AWAITING_REASON && u.where.market_date === "2026-10-23"),
    "the update touches only that day's held rows still waiting for the one click");
  // The same source's own row already stored (scenario A: the insert is ignored as a duplicate).
  const same: Stored = { ...earlier, sell: 10250, source_url: "https://alghadalsudani.com/34920/", reason: AWAITING_REASON };
  const other: Stored = { ...earlier, source_url: "https://other.example/23b", reason: AWAITING_REASON };
  await run([same, other]);
  ok(same.reason !== AWAITING_REASON, "a row of the same source already stored, whose insert is ignored, leaves the one click too");
  const agreeing: Stored = { ...earlier, sell: 10300, reason: AWAITING_REASON };
  const calm = await run([agreeing]);
  ok(agreeing.reason === AWAITING_REASON && calm.updates.every((u) => u.table !== "market_quotes"), "a stored row within 5% changes nothing");

  console.log("");
  if (failed) {
    console.log(`${failed} FAILED`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED — the run reads and holds, publishes only the certain, and leaves the rest to the administrator");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
