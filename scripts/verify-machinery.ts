/**
 * إيجار الجرّار (البند ١٦٨): ما تقوله الصفحة عن توفّر مقدّم الخدمة يطابق ما تقرّره القاعدة، وشريط الحجز يقيس
 * المسافة إلى الحدّ الأدنى كما يقيسها الإرسال.
 *
 *   npx tsx scripts/verify-machinery.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABILITY_FRESH_DAYS, availabilityState, bookingProgress } from "../src/lib/machinery";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

console.log("\nأ) أيّام الصلاحيّة نفسها في الصفحة والقاعدة");
const sql = readFileSync(join(__dirname, "../supabase/migrations/20261025220000_machinery_availability_and_group_booking.sql"), "utf8");
const m = sql.match(/create function public\.machinery_fresh_days\(\)[\s\S]*?\$\$ select (\d+) \$\$/);
ok(m !== null && Number(m[1]) === AVAILABILITY_FRESH_DAYS, `machinery_fresh_days() = ${m?.[1]} و AVAILABILITY_FRESH_DAYS = ${AVAILABILITY_FRESH_DAYS}`);

console.log("\nب) حال التوفّر");
const now = new Date("2026-10-25T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
ok(availabilityState(true, ago(1), now) === "fresh", "أكّد أمس: متوفّر");
ok(availabilityState(true, ago(AVAILABILITY_FRESH_DAYS), now) === "fresh", `أكّد قبل ${AVAILABILITY_FRESH_DAYS} يوماً بالضبط: ما زال صالحاً`);
ok(availabilityState(true, ago(AVAILABILITY_FRESH_DAYS + 0.1), now) === "stale", "وبعدها بساعات: قديم");
ok(availabilityState(true, ago(40), now) === "stale", "أكّد قبل ٤٠ يوماً: قديم");
ok(availabilityState(false, ago(1), now) === "off", "قال أمس إنّه غير متوفّر: غير متوفّر");
ok(availabilityState(true, null, now) === "off", "لم يؤكّد قطّ: غير متوفّر");

console.log("\nج) المسافة إلى الحدّ الأدنى");
const a = bookingProgress(20, 30);
ok(Math.round(a.pct) === 67 && a.remaining === 10 && !a.enough, "٢٠ من ٣٠: الثلثان، وبقي ١٠، ولا يُرسل");
const b = bookingProgress(35, 30);
ok(b.pct === 100 && b.remaining === 0 && b.enough, "٣٥ من ٣٠: ممتلئ، ويُرسل");
ok(bookingProgress(30, 30).enough, "٣٠ من ٣٠ بالضبط: يُرسل (كما في القاعدة: لا يقلّ عن الحدّ)");
ok(bookingProgress(0, 0).enough && bookingProgress(0, 0).pct === 100, "حدٌّ صفر: لا يُنتظر شيء");

if (failed > 0) {
  console.error(`\n${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("\nOK");
