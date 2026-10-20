/**
 * ماء الأرض من الفاو (WaPOR): الفترات العشريّة وأيّامها، والتحويل إلى م³ للفدان.
 *
 * The reading itself happens on Vercel (the files are on Google Cloud
 * Storage); on 20 October 2026 the pixel at 14.4 N, 33.5 E read 8, 5 and 1
 * for 2026-10-D1, 09-D3 and 09-D2 (raw, before the 0.1 scale). These checks
 * pin the calendar and the arithmetic around it.
 */
import { M3_PER_MM_FEDDAN, dekadDays, dekadOf, recentDekads, toDekadWater } from "../src/lib/wapor";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

ok(dekadOf(new Date("2026-10-01T00:00:00Z")) === "2026-10-D1" && dekadOf(new Date("2026-10-15T00:00:00Z")) === "2026-10-D2" && dekadOf(new Date("2026-10-31T00:00:00Z")) === "2026-10-D3", "the three dekads of a month");
ok(dekadDays("2026-10-D1") === 10 && dekadDays("2026-10-D3") === 11 && dekadDays("2026-02-D3") === 8 && dekadDays("2028-02-D3") === 9, "the third dekad is the month's remainder, leap years too");
ok(dekadDays("bad") === 0, "a bad code has no days");

const back = recentDekads(new Date("2026-10-20T12:00:00Z"), 4);
ok(back.join() === "2026-10-D1,2026-09-D3,2026-09-D2,2026-09-D1", "on 20 October the dekad still running is left out, then back through September");
ok(recentDekads(new Date("2026-11-03T12:00:00Z"), 2).join() === "2026-10-D3,2026-10-D2", "early in a month it starts from the last dekad of the one before");
ok(recentDekads(new Date("2026-01-05T12:00:00Z"), 1).join() === "2025-12-D3", "and across a year");

ok(M3_PER_MM_FEDDAN === 4.2, "a millimetre over a feddan (4,200 m²) is 4.2 m³");
const w = toDekadWater("2026-10-D3", 5);
ok(w.days === 11 && w.m3PerFeddan === 231, "5 mm a day over the 11 days of late October is 231 m³ per feddan");
ok(toDekadWater("2026-10-D1", 0.8).m3PerFeddan === 33.6, "0.8 mm a day over ten days is 33.6 m³");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
