/**
 * تنبيهُ سعرٍ تحدّده بنفسك (البند ١٦٦): ما يُطلِق التنبيه وما لا يُطلقه، وما يقوله.
 *
 *   npx tsx scripts/verify-price-alerts.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alertText,
  alreadyPast,
  crossed,
  describeAlert,
  dueAlerts,
  figuresOf,
  parseSubject,
  subjectOptions,
  toAlert,
  type PriceAlert,
} from "../src/lib/priceAlerts";
import { parseMarketPrices } from "../src/lib/marketPrices";
import type { FxReference } from "../src/lib/fxRates";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

const prices = parseMarketPrices(JSON.parse(readFileSync(join(__dirname, "../content/market/prices.json"), "utf8")));
if (!prices) throw new Error("content/market/prices.json could not be read");
const fx: FxReference = {
  bank: { name_ar: "بنك الخرطوم", name_en: "Bank of Khartoum", date: "2026-10-22", buy: 4850, sell: 4886.38, source: "https://example.test/bank" },
  parallel: { date: "2026-10-23", buy: 9670, sell: 10250, source: "https://example.test/parallel" },
};
const figures = figuresOf(prices, fx);

const base: PriceAlert = {
  id: "a", userId: "u", subject: "crop", market: "obeid", crop: "groundnut", unit: "qintar",
  direction: "above", threshold: 400_000, createdOn: "2026-10-01",
};
const groundnut = figures.crops.get("obeid:groundnut:qintar");

console.log("The figures an alert is measured against");
eq(groundnut?.price, 450000, "El Obeid groundnut: the newest point of its series");
eq(groundnut?.date, "2026-10-14", "with its own market day");
eq(figures.fx_bank, { price: 4886.38, date: "2026-10-22" }, "the bank dollar: the selling price");
eq(figures.fx_parallel, { price: 10250, date: "2026-10-23" }, "the parallel dollar: the selling price");

console.log("\nWhat crosses");
eq(crossed("above", 450000, 400000), true, "above: 450,000 is over 400,000");
eq(crossed("above", 400000, 400000), false, "above: equal does not cross");
eq(crossed("below", 399999, 400000), true, "below: 399,999 is under 400,000");
eq(crossed("below", 400000, 400000), false, "below: equal does not cross");
eq(alreadyPast("above", 450000, 400000), true, "the form refuses a limit the price is already past");
eq(alreadyPast("above", 450000, 500000), false, "and accepts one it has not reached");

console.log("\nWhich alerts fire");
const ids = (alerts: PriceAlert[]) => dueAlerts(alerts, figures).map((d) => d.alert.id);
eq(ids([{ ...base, id: "x", createdOn: "2026-10-01" }]), ["x"], "a limit crossed by a figure dated after the alert was set");
eq(ids([{ ...base, id: "x", createdOn: "2026-10-15" }]), [], "the same limit set after the figure's day waits for a newer figure");
eq(ids([{ ...base, id: "x", createdOn: "2026-10-14" }]), ["x"], "a figure dated the very day the alert was set counts");
eq(ids([{ ...base, id: "x", threshold: 450000 }]), [], "a price equal to the limit does not fire");
eq(ids([{ ...base, id: "x", direction: "below", threshold: 500000 }]), ["x"], "below fires when the price is under the limit");
eq(ids([{ ...base, id: "x", market: "gedaref", crop: "groundnut" }]), [], "a series that does not exist fires nothing");
eq(ids([{ ...base, id: "x", unit: "ardeb" }]), [], "a unit the series is not quoted in fires nothing");
eq(ids([{ ...base, id: "x", subject: "fx_parallel", market: null, crop: null, unit: null, threshold: 10000 }]), ["x"], "the parallel dollar over 10,000");
eq(ids([{ ...base, id: "x", subject: "fx_bank", market: null, crop: null, unit: null, direction: "below", threshold: 4000 }]), [], "the bank dollar is not under 4,000");
eq(dueAlerts([{ ...base, id: "x" }], figuresOf(null, null)), [], "with no prices read, nothing fires");

console.log("\nWhat the notification says");
const text = alertText({ ...base, threshold: 400000 }, groundnut!, prices.markets);
eq(text.title, "الفول السوداني الخام في الأبيض صار فوق 400,000", "the title names the crop, the market, the direction and the limit");
eq(text.body.includes("450,000 جنيه للقنطار") && text.body.includes("2026-10-14"), true, "the body gives the price in its unit and the day");
eq(describeAlert({ ...base, subject: "fx_parallel", market: null, crop: null, unit: null, direction: "below", threshold: 9000 }, prices.markets), "الدولار في السوق الموازي تحت 9,000 جنيه", "a currency alert reads plainly");

console.log("\nThe form's choices");
const options = subjectOptions(prices.series, prices.markets, figures);
eq(options.length, prices.series.length + 2, "one per followed series, and both dollars");
eq(options.every((o) => parseSubject(o.value) !== null), true, "every choice parses back");
eq(parseSubject("crop|obeid|groundnut|qintar"), { subject: "crop", market: "obeid", crop: "groundnut", unit: "qintar" }, "a crop choice");
eq(parseSubject("fx_bank|||"), { subject: "fx_bank", market: null, crop: null, unit: null }, "a currency choice");
eq(parseSubject("crop|obeid||"), null, "a crop with no name is nothing");
eq(parseSubject("gold|||"), null, "an unknown subject is nothing");

console.log("\nThe day an alert was set is the Khartoum day");
eq(
  toAlert({ id: "a", user_id: "u", subject: "fx_bank", market: null, crop: null, unit: null, direction: "above", threshold: "5000", created_at: "2026-10-23T22:30:00Z" }).createdOn,
  "2026-10-24",
  "22:30 UTC on the 23rd is already the 24th in Khartoum (UTC+2)",
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
