/**
 * «أين السماد والجازولين»: البلاغ يُفحص قبل أن يصل القاعدة بما تفحصه القاعدة،
 * والوحدة تناسب الصنف، والحكم على التوفّر عدٌّ لا رأي، وملفّ المصادر يُسقط
 * السطر الناقص ولا يعرضه خطأً، وكلّ رقمٍ فيه بمصدرٍ وتاريخ.
 */
import { readFileSync } from "node:fs";
import {
  availabilityVerdict,
  groupByItem,
  khartoumToday,
  parsePublishedInputs,
  perUnit,
  reportProblem,
  unitsFor,
  type SummaryRow,
} from "../src/lib/inputBoard";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const today = "2026-10-21";
const good = { item: "urea", unit: "sack_50kg", priceKind: "", availability: "available", price: 300000, observedOn: today };

ok(reportProblem(good, today, "ar") === null, "a urea report by the sack, today, is well-formed");
ok(reportProblem({ ...good, unit: "liter" }, today, "ar")!.includes("السماد"), "fertiliser by the litre is refused, in a sentence about fertiliser");
ok(reportProblem({ ...good, item: "diesel", unit: "gallon" }, today, "ar")!.includes("الرسميّ"), "fuel without official/parallel is refused");
ok(reportProblem({ ...good, item: "diesel", unit: "gallon", priceKind: "parallel" }, today, "ar") === null, "fuel by the gallon, parallel market, passes");
ok(reportProblem({ ...good, price: null }, today, "ar") !== null, "«available» with no price is refused");
ok(reportProblem({ ...good, price: null, availability: "unavailable" }, today, "ar") === null, "«not to be found» with no price passes");
ok(reportProblem({ ...good, observedOn: "2026-10-22" }, today, "ar")!.includes("المستقبل"), "a day that has not come is refused");
ok(reportProblem({ ...good, observedOn: "2026-10-06" }, today, "ar")!.includes("أربعة عشر"), "fifteen days back is refused");
ok(reportProblem({ ...good, observedOn: "2026-10-07" }, today, "ar") === null, "fourteen days back passes, as the database allows");
ok(reportProblem({ ...good, item: "gold" }, today, "en") === "Choose the item.", "an item off the list is refused, in English too");

ok(unitsFor("dap").join() === "sack_50kg,kg" && unitsFor("petrol").join() === "liter,gallon,barrel", "units follow the item, as the database pairs them");
ok(perUnit("liter", "ar") === "للّتر" && perUnit("sack", "ar") === "للجوال", "«للّتر» is written out, not «لل» + «لتر»");
ok(/^\d{4}-\d{2}-\d{2}$/.test(khartoumToday()) && khartoumToday(new Date("2026-10-21T23:30:00Z")) === "2026-10-22", "Khartoum's day, not the server's: 23:30 UTC is already tomorrow there");

ok(availabilityVerdict({ reports: 4, unavailable: 3, limited: 0 }) === "unavailable", "most say «not to be found»: not to be found");
ok(availabilityVerdict({ reports: 4, unavailable: 1, limited: 2 }) === "limited", "most say scarce or absent: scarce");
ok(availabilityVerdict({ reports: 4, unavailable: 1, limited: 0 }) === "available", "otherwise: available");

const row = (item: SummaryRow["item"]): SummaryRow => ({
  item, unit: "liter", price_kind: "", state: "القضارف", reports: 1, reporters: 1, priced: 1,
  low: 1, high: 1, median: 1, latest_on: today, unavailable: 0, limited: 0,
});
ok(groupByItem([row("petrol"), row("urea"), row("diesel")]).map(([i]) => i).join() === "urea,diesel,petrol", "fertiliser first, then fuel");

ok(parsePublishedInputs(null) === null && parsePublishedInputs({ checked: "x" }) === null, "a file without its check date is refused whole");
const p = parsePublishedInputs({
  checked: today,
  figures: [
    { item: "urea", place_ar: "الجزيرة", place_en: "Gezira", price: 300000, unit: "sack", date: "2026-10-09", source_ar: "مصدر", source_en: "source", url: "https://a.b/c" },
    { item: "urea", place_ar: "الجزيرة", place_en: "Gezira", price: 300000, unit: "sack", date: "2026-10-09", source_ar: "مصدر", source_en: "source", url: "not a url" },
    { item: "urea", place_ar: "الجزيرة", place_en: "Gezira", price: -1, unit: "sack", date: "2026-10-09", source_ar: "مصدر", source_en: "source", url: "https://a.b/c" },
  ],
  trends: [{ month: "2026-08", source_ar: "م", source_en: "s", url: "https://a.b", ar: "نصّ", en: "text" }],
});
ok(p!.figures.length === 1, "a line without a real source or with a negative price is dropped, the good one kept");
ok(p!.trends.length === 0, "a trend whose source name is one letter is dropped");

const real = parsePublishedInputs(JSON.parse(readFileSync("content/market/inputs.json", "utf8")));
ok(!!real && real.figures.length >= 5 && real.trends.length === 2, "the shipped file reads whole: every figure and both trends survive validation");
ok(!!real && real.figures.every((f) => f.date <= real.checked && f.url.startsWith("https://")), "every shipped figure is dated no later than the check, with its source");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\ninput board: all checks passed");
