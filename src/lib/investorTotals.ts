/**
 * مجاميع محفظة المستثمر (BUG-15، البند ١٦٢).
 *
 * «إجمالي الاستثمار» كان يجمع كلّ الطلبات، فيظهر طلبٌ معلَّق أو مُلغى كأنّه مالٌ استُثمر. المؤكَّد
 * وحده استثمار؛ والمعلَّق يُعرض بجانبه منفصلاً، والمُلغى لا يدخل في شيء.
 */
export interface PortfolioRow {
  status: string;
  amount: number | string;
  shares: number;
  project_id: string;
}

export interface PortfolioTotals {
  invested: number;
  shares: number;
  projects: number;
  pendingCount: number;
  pendingAmount: number;
}

export function portfolioTotals(rows: PortfolioRow[]): PortfolioTotals {
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const pending = rows.filter((r) => r.status === "pending");
  return {
    invested: confirmed.reduce((sum, r) => sum + Number(r.amount), 0),
    shares: confirmed.reduce((sum, r) => sum + r.shares, 0),
    projects: new Set(confirmed.map((r) => r.project_id)).size,
    pendingCount: pending.length,
    pendingAmount: pending.reduce((sum, r) => sum + Number(r.amount), 0),
  };
}
