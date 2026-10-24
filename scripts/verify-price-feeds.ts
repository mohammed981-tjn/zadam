/**
 * The price readers on real articles (backlog 131).
 *
 *   npx tsx scripts/verify-price-feeds.ts
 *
 * Each fixture is an article as its site's WordPress API returned it on
 * 22 October 2026 (scripts/fixtures/price-feeds). The figures expected here
 * are the ones printed in those articles — and, as important, the ones that
 * are in the same articles and must NOT be taken: the bank's rate beside the
 * parallel market, the day's increases after El Obeid's list.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  holdReason,
  marketDay,
  parseAmount,
  readBank,
  readBankOfKhartoum,
  readBankOfKhartoumSentence,
  readGedarefProse,
  readObeidList,
  readParallelMarket,
  type WpPost,
} from "../src/lib/priceFeeds";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures/price-feeds", name), "utf8")) as WpPost;

console.log("Amounts as Sudanese papers write them");
eq(parseAmount("4,850"), 4850, "4,850");
eq(parseAmount("4٬850"), 4850, "Arabic thousands separator");
eq(parseAmount("٤٨٥٠"), 4850, "Arabic-Indic digits");
eq(parseAmount("4850.00"), 4850, "decimal point");
eq(parseAmount("4886.38"), 4886.38, "two decimals");
eq(parseAmount("6.448"), 6448, "a dot as the thousands separator");
eq(parseAmount("1,575,000"), 1575000, "millions");
eq(parseAmount("470 ألف"), 470000, "«ألف»");
eq(parseAmount("00,000"), null, "a broken zero is not a price");
eq(parseAmount("21.5%"), null, "a percentage is not a price");

console.log("\nThe market day");
eq(marketDay("اليوم الأربعاء 21 أكتوبر 2026", "2026-10-22T09:00:00"), "2026-10-21", "a named month");
eq(marketDay("اليوم الأربعاء 2026/10/14 م", "2026-10-15T09:00:00"), "2026-10-14", "a slashed date");
eq(marketDay("بلا تاريخ", "2026-10-15T09:00:00"), "2026-10-15", "else the post's day");

console.log("\nBank of Khartoum — iqraa24, 21 October 2026");
const bank = readBankOfKhartoum(fixture("iqraa24-45070.json"));
eq(bank && { date: bank.date, buy: bank.buy, sell: bank.sell }, { date: "2026-10-21", buy: 4850, sell: 4886.38 },
  "the dollar row of the day's table, cash buying and selling");
eq(readBankOfKhartoum({ ...fixture("bajnews-201602.json") }), null, "no table, no figure");
eq(readBankOfKhartoum(fixture("iqraa24-43999.json")), null,
  "a table with no buying and selling columns — buying 4200 above selling 3700 — gives nothing");

console.log("\nBank of Khartoum — bajnews's sentence, 21 October 2026 (backlog 176)");
const bankSentence = readBankOfKhartoumSentence(fixture("bajnews-201602.json"));
eq(bankSentence && { date: bankSentence.date, buy: bankSentence.buy, sell: bankSentence.sell }, { date: "2026-10-21", buy: 4850, sell: 4886 },
  "the sentence that names the bank and gives buying and selling");
const withSentence = (line: string): WpPost => ({
  ...fixture("bajnews-201602.json"),
  content: { rendered: `<p>${line}</p>` },
});
eq(readBankOfKhartoumSentence(withSentence("تراجعت قيمة الجنيه في بنك النيل ليُسجل سعر شراء الدولار 6,400 جنيهًا، مقابل 6,448 جنيهًا للبيع.")), null,
  "another bank's sentence is not the Bank of Khartoum's");
eq(readBankOfKhartoumSentence(withSentence("وبلغ سعر شراء الدولار الأمريكي 9,500 جنيه، بينما وصل سعر البيع إلى 10,105 جنيهات.")), null,
  "the parallel market's sentence names no bank, so gives nothing");
eq(readBankOfKhartoumSentence(withSentence("بنك الخرطوم: سعر البيع 4,886 جنيهًا")), null,
  "a selling price alone is not enough");
eq(readBankOfKhartoumSentence(fixture("iqraa24-43999.json")), null, "the aggregator's 4200-over-3700 snippet gives nothing");
eq(readBank(fixture("iqraa24-45070.json"))?.sell, 4886.38, "an article with the bank's table is still read from the table");
eq(readBank(fixture("bajnews-201602.json"))?.sell, 4886, "an article with only the sentence is read from the sentence");

console.log("\nThe parallel market — bajnews, 21 October 2026");
const parallel = readParallelMarket(fixture("bajnews-201602.json"));
eq(parallel && { date: parallel.date, buy: parallel.buy, sell: parallel.sell }, { date: "2026-10-21", buy: 9500, sell: 10105 },
  "the sentence after «السوق الموازية» — not the bank's 4,850 in the paragraph before");
eq(readParallelMarket(fixture("iqraa24-45070.json")), null, "a bank table is not the parallel market");

console.log("\nEl Obeid — sudafax, 14 October 2026");
const obeid = readObeidList(fixture("sudafax-585058.json"));
eq(
  obeid.map((q) => [q.crop, q.unit, q.price]),
  [
    ["groundnut", "qintar", 450000],
    ["hibiscus", "qintar", 630000],
    ["sesame_red", "qintar", 470000],
    ["millet", "ardeb", 1575000],
    ["feterita", "ardeb", 1100000],
    ["tabat", "ardeb", 1020000],
  ],
  "the six crops followed, each in its own unit",
);
eq(obeid.every((q) => q.date === "2026-10-14"), true, "on the list's own date");
eq(obeid.some((q) => q.price === 275000 || q.price === 230000 || q.price === 160000), false,
  "the day's increases after the list are not taken for prices");
eq(obeid.some((q) => q.price === 1150000), false, "«الصمغ السوداني» is not the hashab series");
eq(obeid.some((q) => q.price === 15000000), false, "shelled groundnut by the tonne is not raw groundnut by the qintar");
eq(readObeidList(fixture("iqraa24-45070.json")), [], "no El Obeid section, nothing");

console.log("\nGedaref — prose, held for a person");
const gedaref = readGedarefProse({
  id: 1,
  date: "2026-10-13T10:00:00",
  link: "https://example.sd/1",
  title: { rendered: "أسعار المحاصيل في بورصة القضارف" },
  content: {
    rendered:
      "<p>سجّل سعر قنطار السمسم في بورصة القضارف 520 ألف جنيه، فيما بلغ أردب الفتريتة 950,000 جنيه.</p>" +
      "<p>وارتفع أردب الدخن بزيادة 40 ألف جنيه عن الأمس.</p>",
  },
});
eq(gedaref.map((q) => [q.crop, q.price]), [["sesame", 520000], ["feterita", 950000]],
  "the crop, its unit and a price in one sentence");
eq(gedaref.some((q) => q.crop === "millet"), false, "a sentence about an increase gives no price");

console.log("\nWhat waits for a person");
eq(holdReason(4886.38, 4231.5, 0.25, [500, 100000]), null, "15% in a day is published");
eq(holdReason(9000, 4886, 0.25, [500, 100000]) !== null, true, "84% in a day is held");
eq(holdReason(10, null, 0.25, [500, 100000]) !== null, true, "outside the range is held");

console.log("");
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — every figure is one the article prints, beside the words it was read by");
