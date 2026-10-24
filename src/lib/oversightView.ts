/**
 * عرض الإحصاءات المجمَّعة للإدارة (البند ١٩١): جدولٌ بالشهر والمقياس، والخليّة المحجوبة تبقى محجوبة.
 *
 * `oversight_flows` already withholds a cell that too few books fed or one book dominated, returning no figure
 * for it; this only arranges the rows. It never computes a figure for a suppressed cell and never fills one in
 * from its neighbours (a total of the visible cells would let a reader subtract the hidden one).
 */

export interface FlowRow {
  period: string;
  metric: string;
  label_ar: string;
  value_minor: number | null;
  books: number | null;
  entries: number | null;
  suppressed: boolean;
}

export interface FlowTable {
  periods: string[];
  metrics: { metric: string; label: string }[];
  cell: (metric: string, period: string) => FlowRow | undefined;
}

export function pivotFlows(rows: readonly FlowRow[]): FlowTable {
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const metrics: { metric: string; label: string }[] = [];
  for (const r of rows) {
    if (!metrics.some((m) => m.metric === r.metric)) metrics.push({ metric: r.metric, label: r.label_ar });
  }
  const byKey = new Map(rows.map((r) => [`${r.metric}|${r.period}`, r]));
  return { periods, metrics, cell: (metric, period) => byKey.get(`${metric}|${period}`) };
}

/** The twelve month starts ending with the month of `today` (ISO day), oldest first. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** What an inspection is, for the list: running, ended by time, or closed by the administrator. */
export function inspectionState(i: { closed_at: string | null; expires_at: string }, now: Date): "active" | "expired" | "closed" {
  if (i.closed_at) return "closed";
  return new Date(i.expires_at).getTime() > now.getTime() ? "active" : "expired";
}
