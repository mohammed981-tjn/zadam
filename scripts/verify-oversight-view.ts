/**
 * عرض الإحصاءات للإدارة لا يكشف خليّةً محجوبة ولا يسدّ فراغها من جاراتها (البند ١٩١).
 *
 *   npx tsx scripts/verify-oversight-view.ts
 */
import { inspectionState, lastMonths, pivotFlows, reconcileVerdict, type FlowRow, type ReconcileRow } from "../src/lib/oversightView";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const row = (period: string, metric: string, value: number | null, suppressed = false): FlowRow => ({
  period, metric, label_ar: `بند ${metric}`, value_minor: value, books: suppressed ? null : 4, entries: suppressed ? null : 9, suppressed,
});

console.log("\nأ) الجدول");
{
  const t = pivotFlows([
    row("2026-09-01", "farm_sales", null, true),
    row("2026-08-01", "farm_sales", 500000),
    row("2026-08-01", "farm_costs", 120000),
    row("2026-09-01", "farm_costs", 90000),
  ]);
  ok(t.periods.join(",") === "2026-08-01,2026-09-01", "الشهور من الأقدم");
  ok(t.metrics.map((m) => m.metric).join(",") === "farm_sales,farm_costs", "والبنود بترتيب ظهورها");
  ok(t.cell("farm_sales", "2026-08-01")?.value_minor === 500000, "الخليّة الظاهرة بقيمتها");
  const hidden = t.cell("farm_sales", "2026-09-01");
  ok(hidden?.suppressed === true && hidden.value_minor === null && hidden.books === null && hidden.entries === null, "والمحجوبة بلا قيمةٍ ولا عددٍ");
  ok(t.cell("farm_costs", "2026-07-01") === undefined, "وخليّةٌ لم تأتِ لا تُخترع");
  ok(pivotFlows([]).periods.length === 0 && pivotFlows([]).metrics.length === 0, "وجدولٌ فارغ");
  const keys = JSON.stringify(t.periods) + JSON.stringify(t.metrics);
  ok(!keys.includes("null"), "ولا يُدخل إلى العناوين شيئاً من الخلايا");
}

console.log("\nب) الأشهر");
{
  const m = lastMonths("2026-10-24");
  ok(m.length === 12 && m[0] === "2025-11-01" && m[11] === "2026-10-01", "اثنا عشر شهراً تنتهي بشهر اليوم");
  ok(lastMonths("2026-01-05", 3).join(",") === "2025-11-01,2025-12-01,2026-01-01", "وعبر رأس السنة");
  ok(lastMonths("2026-03-31", 2).join(",") === "2026-02-01,2026-03-01", "وآخر الشهر لا يقفز");
}

console.log("\nج) حالة الفحص");
{
  const now = new Date("2026-10-24T12:00:00Z");
  ok(inspectionState({ closed_at: null, expires_at: "2026-10-25T00:00:00Z" }, now) === "active", "جارٍ");
  ok(inspectionState({ closed_at: null, expires_at: "2026-10-24T11:59:59Z" }, now) === "expired", "وانتهى بالوقت");
  ok(inspectionState({ closed_at: "2026-10-24T10:00:00Z", expires_at: "2026-10-25T00:00:00Z" }, now) === "closed", "وأُغلق قبل وقته");
}

console.log("\nج) فرق الذمّتين لا يُخترع");
{
  const r = (over: Partial<ReconcileRow>): ReconcileRow => ({
    due_to_partner_minor: 1150000, due_from_farmer_minor: 1140000, difference_minor: 10000, farm_books: 4, investor_books: 4, suppressed: false, ...over,
  });
  const v = reconcileVerdict(r({}));
  ok(v.kind === "differs" && v.difference === 10000 && v.direction === "farm_more", "ما عند المزارعين أكثر بـ١٠٠$");
  const w = reconcileVerdict(r({ difference_minor: -250000 }));
  ok(w.kind === "differs" && w.difference === 250000 && w.direction === "investor_more", "وما عند المستثمرين أكثر: الفرق موجبٌ والاتّجاه يقول من");
  ok(reconcileVerdict(r({ difference_minor: 0 })).kind === "match", "وصفرٌ يعني تطابقاً");
  ok(reconcileVerdict(r({ suppressed: true, difference_minor: null, due_to_partner_minor: null, due_from_farmer_minor: null })).kind === "withheld", "والمحجوب يبقى محجوباً");
  ok(reconcileVerdict(r({ suppressed: true })).kind === "withheld", "وإن جاء رقمٌ مع الحجب فلا يُعرض");
  ok(reconcileVerdict(r({ difference_minor: null })).kind === "withheld", "وفرقٌ بلا رقم محجوب");
  ok(reconcileVerdict(undefined).kind === "withheld", "وغياب الصفّ محجوب لا صفر");
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
