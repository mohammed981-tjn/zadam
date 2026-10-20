/**
 * سوق المحاصيل: كلُّ رقمٍ في ملف الأسعار بتاريخه ومصدره، والقارئ لا يُسقط شيئاً بصمت.
 *
 * The data file is edited by hand. A typo there (a price as a string, a date
 * written 8/7/2026, a missing URL) would make the reader drop that point
 * silently — the page would still render, one figure short, and nobody would
 * notice. So this gate reads the file twice: as JSON, and through the reader,
 * and fails when the two disagree. It also pins the FEWS NET parser against
 * the field shapes the API has used.
 */
import { readFileSync } from "node:fs";
import { CROP_NAME, fewsMarket, fewsProduct, fewsUnit, latest, parseFews, parseMarketPrices, parseWfpMonthly } from "../src/lib/marketPrices";
import { isNotYetCreated } from "../src/lib/marketOffers";
import { orderTowns, parseWfpPrices, pctChange, wfpItem, wfpTown, wfpUnit } from "../src/lib/wfpPrices";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const raw = JSON.parse(readFileSync("content/market/prices.json", "utf8"));
const parsed = parseMarketPrices(raw);
ok(parsed !== null, "the prices file parses");

const rawPoints = raw.series.reduce((n: number, s: { history: unknown[] }) => n + s.history.length, 0);
const kept = parsed!.series.reduce((n, s) => n + s.history.length, 0);
ok(kept === rawPoints, `every point survives the reader (${kept} of ${rawPoints})`);
ok(parsed!.series.length === raw.series.length, "every series survives the reader");
ok(parsed!.series.every((s) => CROP_NAME[s.crop]), "every crop has a name in both languages");
ok(
  parsed!.series.every((s) => s.history.every((p, i) => i === 0 || s.history[i - 1].date <= p.date)),
  "history is in date order",
);

const sesame = parsed!.series.find((s) => s.market === "gedaref" && s.crop === "sesame")!;
const l = latest(sesame);
ok(l.last.date >= l.prev!.date && l.change === l.last.price - l.prev!.price, "latest() compares with the figure before");

const broken = parseMarketPrices({
  markets: { m: {} },
  series: [
    { market: "m", crop: "x", unit: "qintar", history: [{ date: "8/7/2026", price: 1, source: "https://a" }] },
    { market: "m", crop: "y", unit: "qintar", history: [{ date: "2026-07-08", price: "1", source: "https://a" }] },
    { market: "m", crop: "z", unit: "qintar", history: [{ date: "2026-07-08", price: 1, source: "" }] },
    { market: "nowhere", crop: "w", unit: "qintar", history: [{ date: "2026-07-08", price: 1, source: "https://a" }] },
    { market: "m", crop: "v", unit: "qintar", history: [{ date: "2026-07-08", price: 1, source: "https://a" }] },
  ],
});
ok(broken!.series.length === 1 && broken!.series[0].crop === "v", "a bad date, a string price, no source or an unknown market is dropped");

const fews = parseFews({
  results: [
    { market: "El Obeid", product: "Sorghum (Feterita)", unit: "kg", currency: "SDG", period_date: "2026-08-15", value: 3000 },
    { market: "El Obeid", product: "Sorghum (Feterita)", unit: "kg", currency: "SDG", period_date: "2026-09-15", value: 3200 },
    { market_name: "Kadugli", product_name: "Millet", unit_name: "kg", currency: "SDG", start_date: "2026-09-01", value: "4100" },
    { market: "Nyala", product: "Wheat flour", unit: "kg", currency: "SDG", period_date: "2026-09-15", value: 5000 },
    { market: "Nyala", product: "Sorghum", unit: "kg", currency: "USD", period_date: "2026-09-15", value: 1 },
    { market: "Nyala", product: "Sorghum", unit: "kg", currency: "SDG", period_date: "bad", value: 1 },
  ],
});
ok(fews.length === 2, `FEWS: keeps sorghum and millet in pounds only (${fews.length})`);
ok(fews.find((f) => f.market === "El Obeid")?.value === 3200 && fews.find((f) => f.market === "El Obeid")?.prev === 3000, "FEWS: the newest month, with the month before");
ok(parseFews(null).length === 0 && parseFews({ detail: "error" }).length === 0, "FEWS: an error body is an empty list, not a throw");

const order = parseFews([
  { market: "Kosti", product: "Sorghum", unit: "3_kg", currency: "SDG", period_date: "2026-08-31", value: 7625 },
  { market: "El Obeid", product: "Sorghum", unit: "3_kg", currency: "SDG", period_date: "2026-08-31", value: 7781 },
  { market: "Al Qadarif", product: "Sorghum", unit: "3_kg", currency: "SDG", period_date: "2026-06-30", value: 5313 },
]);
ok(order.map((f) => f.market).join(",") === "Al Qadarif,El Obeid,Kosti", "FEWS: the two bourse towns come first, even with an older month");
ok(fewsMarket("Al Qadarif", "ar") === "القضارف" && fewsMarket("Somewhere", "ar") === "Somewhere" && fewsMarket("El Obeid", "en") === "El Obeid", "FEWS: market names in Arabic, unknown towns kept as spelt");
ok(fewsProduct("Sorghum", "ar") === "ذرة" && fewsProduct("Millet", "ar") === "دخن" && fewsUnit("3.5_kg", "ar") === "3.5 كجم" && fewsUnit("3_kg", "en") === "3 kg", "FEWS: products and units read plainly");

// The WFP figures shown while the bourses are quiet: the file as committed, and a broken one.
const wfp = parseWfpMonthly(JSON.parse(readFileSync("content/market/wfp.json", "utf8")));
ok(wfp !== null && /^\d{4}-\d{2}$/.test(wfp.month) && wfp.sorghumRetailPerKg.northKordofan.price > 0, "WFP: the monthly file parses");
ok(parseWfpMonthly({ ...wfp, month: "August" }) === null, "WFP: a month not written YYYY-MM is refused");
ok(parseWfpMonthly({ ...wfp, sorghumRetailPerKg: { national: { price: "2465", lastMonth: 2071 }, northKordofan: wfp!.sorghumRetailPerKg.northKordofan } }) === null, "WFP: a figure written as a string is refused, not shown");

// WFP's town prices (HDX): the trim the monthly job writes, read through the same reader the page uses.
const wfpRaw = JSON.parse(readFileSync("content/market/wfp-prices.json", "utf8"));
const wfpPrices = parseWfpPrices(wfpRaw);
ok(wfpPrices !== null && /^\d{4}-\d{2}$/.test(wfpPrices.latest), "WFP towns: the trimmed file parses");
const wfpRawItems = wfpRaw.markets.reduce((n: number, m: { items: unknown[] }) => n + m.items.length, 0);
const wfpKept = wfpPrices!.towns.reduce((n, m) => n + m.items.length, 0);
ok(wfpKept === wfpRawItems, `WFP towns: every item survives the reader (${wfpKept} of ${wfpRawItems})`);
ok(wfpPrices!.towns.every((m) => wfpTown(m.market, "ar") !== m.market), "WFP towns: every town has an Arabic name");
ok(wfpPrices!.towns.every((m) => m.items.every((i) => wfpItem(i.commodity, "ar") !== i.commodity)), "WFP towns: every item has an Arabic name");
ok(orderTowns(wfpPrices!.towns, "ar")[0].market === "El Obeid" && orderTowns(wfpPrices!.towns, "ar")[1].market === "El Gedarif", "WFP towns: the two bourse towns come first");
ok(
  parseWfpPrices({ latest: "2026-09", markets: [{ market: "X", items: [{ commodity: "Sorghum", unit: "3 KG", month: "2026-09", price: "100" }, { commodity: "Millet", unit: "3.5 KG", month: "Sept", price: 5 }] }] }) === null,
  "WFP towns: a price written as a string or a bad month is dropped, and a town left empty is not shown",
);
ok(pctChange(110, 100) === 10 && pctChange(90, 100) === -10 && pctChange(100, null) === null && pctChange(100, 0) === null, "WFP towns: the change is whole per cent, and nothing to compare is no change");
ok(wfpUnit("3.5 KG", "ar") === "3.5 كجم" && wfpUnit("KG", "ar") === "كجم" && wfpUnit("L", "en") === "l", "WFP towns: units read plainly");

// Before the migration is applied the offers pages say «تُفعَّل قريباً»; any other failure is an error.
ok(isNotYetCreated({ code: "42P01", message: 'relation "public.market_offers" does not exist' }), "offers: a missing table reads as not-yet-created");
ok(isNotYetCreated({ code: "PGRST205", message: "Could not find the table 'public.market_offers' in the schema cache" }), "offers: PostgREST's missing table too");
ok(isNotYetCreated({ code: "PGRST202", message: "Could not find the function public.market_offer_create" }), "offers: and a missing function");
ok(!isNotYetCreated({ code: "", message: "TypeError: fetch failed" }) && !isNotYetCreated(null), "offers: a network failure is not «coming soon»");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
