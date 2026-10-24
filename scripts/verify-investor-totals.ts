/**
 * مجاميع المحفظة (BUG-15، البند ١٦٢): المؤكَّد وحده «استثمار»، والمعلَّق منفصل، والمُلغى لا يدخل.
 *
 *   npx tsx scripts/verify-portfolio.ts
 */
import { portfolioTotals } from "../src/lib/investorTotals";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const rows = [
  { status: "confirmed", amount: "500", shares: 5, project_id: "a" },
  { status: "confirmed", amount: 300, shares: 3, project_id: "a" },
  { status: "confirmed", amount: 200, shares: 2, project_id: "b" },
  { status: "pending", amount: 1000, shares: 10, project_id: "c" },
  { status: "pending", amount: 100, shares: 1, project_id: "a" },
  { status: "cancelled", amount: 9999, shares: 99, project_id: "d" },
];
const t = portfolioTotals(rows);
ok(t.invested === 1000, "المستثمَر: المؤكَّد وحده (٥٠٠ + ٣٠٠ + ٢٠٠)");
ok(t.shares === 10, "والحصص: المؤكَّدة وحدها");
ok(t.projects === 2, "والمشاريع: التي فيها مؤكَّد (a وb)، لا المعلَّقة (c) ولا المُلغاة (d)");
ok(t.pendingCount === 2 && t.pendingAmount === 1100, "والمعلَّق منفصل: طلبان ومبلغهما ١١٠٠");
const none = portfolioTotals([{ status: "pending", amount: 50, shares: 1, project_id: "x" }]);
ok(none.invested === 0 && none.projects === 0 && none.pendingCount === 1, "طلبٌ معلَّق وحده: لا استثمار ولا مشاريع");
const empty = portfolioTotals([]);
ok(empty.invested === 0 && empty.shares === 0 && empty.pendingCount === 0, "بلا طلبات: أصفار");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
