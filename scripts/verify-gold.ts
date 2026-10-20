/**
 * سعر الذهب اليومي: القارئ يقبل ذهباً بالدولار فقط، والقاعدة كما كتبها المنشور 13/2026.
 *
 * gold-api.com answered {"currency":"USD","name":"Gold","price":4127.600098,
 * "symbol":"XAU","updatedAt":"2026-10-20T01:46:05Z",…} on 20 October 2026.
 * These checks pin that shape, refuse anything else, and pin the circular's
 * arithmetic: (world price − 10) ÷ 31.1035, times purity below 24 karat.
 */
import { CIRCULAR_DISCOUNT_USD, GRAMS_PER_TROY_OUNCE, circularUsdPerGram, parseGoldSpot, usdPerGram } from "../src/lib/goldPrice";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const answer = { currency: "USD", currencySymbol: "$", exchangeRate: 1.0, name: "Gold", price: 4127.600098, symbol: "XAU", updatedAt: "2026-10-20T01:46:05Z" };
const spot = parseGoldSpot(answer);
ok(spot !== null && spot.usdPerOunce === 4127.600098 && spot.updatedAt === "2026-10-20T01:46:05Z", "the answer of 20 October is read as written");
ok(parseGoldSpot({ ...answer, symbol: "XAG" }) === null, "silver is not gold");
ok(parseGoldSpot({ ...answer, currency: "EUR" }) === null, "a price in another currency is refused");
ok(parseGoldSpot({ ...answer, price: "4127.6" }) === null && parseGoldSpot({ ...answer, price: 0 }) === null, "a price as a string or zero is refused");
ok(parseGoldSpot({ ...answer, updatedAt: "yesterday" }) === null && parseGoldSpot(null) === null, "a bad time, or no answer, is nothing");

ok(GRAMS_PER_TROY_OUNCE === 31.1035 && CIRCULAR_DISCOUNT_USD === 10, "the circular's own numbers: 31.1035 g and US$10");
ok(near(usdPerGram(3110.35), 100), "per gram: the ounce price over 31.1035");
ok(near(circularUsdPerGram(3120.35), 100), "Circular 13/2026: (price − 10) ÷ 31.1035");
ok(near(circularUsdPerGram(3120.35, 21), 87.5), "and 21 karat is 21/24 of it");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
