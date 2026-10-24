/**
 * حداثة الأسعار (GAP-3، البند ١٦٣): الخطّ الفاصل بين «هادئ» و«معطَّل» هو النافذة التي تنظر فيها
 * المهمّة اليومية للوراء، فما أقدم منها لا يمكن أن تجده المهمّة ولو نُشر اليوم.
 *
 *   npx tsx scripts/verify-price-freshness.ts
 */
import { CROP_WINDOW_DAYS, FX_WINDOW_DAYS, feedStates, staleLines } from "../src/lib/priceFreshness";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const now = new Date("2026-10-24T12:00:00Z");
const day = (back: number) => new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
const states = (b: number | null, p: number | null, o: number | null) =>
  feedStates({ fx_bank: b === null ? null : day(b), fx_parallel: p === null ? null : day(p), crop_obeid: o === null ? null : day(o) }, now);

ok(FX_WINDOW_DAYS === 4 && CROP_WINDOW_DAYS === 10, "the limits are the windows the daily run looks back over (4 and 10 days)");

const fresh = states(1, 0, 3);
ok(fresh.every((s) => !s.stale), "recent figures are not stale");
ok(staleLines(fresh).length === 0, "and give no line");

const edge = states(FX_WINDOW_DAYS, FX_WINDOW_DAYS, CROP_WINDOW_DAYS);
ok(edge.every((s) => !s.stale), "a figure exactly at the window is not stale yet");

const over = states(FX_WINDOW_DAYS + 1, 2, CROP_WINDOW_DAYS + 1);
ok(over[0].stale && !over[1].stale && over[2].stale, "one day past the window is stale — per feed, not all together");
ok(over[0].ageDays === FX_WINDOW_DAYS + 1, "the age is counted in whole days");

const none = states(null, 1, 1);
ok(none[0].stale && none[0].newest === null && none[0].ageDays === null, "a feed with no figure at all is stale");

const lines = staleLines(over);
ok(lines.length === 2 && lines[0].includes("بنك الخرطوم") && lines[0].includes("5") && lines[1].includes("الأبيض"), "each stale feed gets a line naming it and its age");
ok(staleLines(none)[0].includes("لا رقمَ منشور"), "and a feed with nothing says so");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
