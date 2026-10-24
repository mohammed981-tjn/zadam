/**
 * عائد المستثمر على ما وظّفه (البند ١٨٨): مضاعف رأس المال والمعدّل الداخليّ للعائد.
 *
 * MOIC: what came back for each unit that went in. XIRR: the yearly rate that makes the flows, on the dates
 * they really happened, worth nothing today — Excel's XIRR, on actual/365 days. Both are for reading, not
 * for promising: the platform guarantees no return (the agreements say so), and a figure computed from
 * flows that have not all happened yet says so by its `complete` flag.
 */

export interface Flow {
  /** ISO day, 2026-03-01. */
  date: string;
  /** Negative: money the investor put in. Positive: money that came back. */
  amount: number;
}

const DAY = 86_400_000;
const day = (iso: string): number => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY;
};

/** Money back per unit in. Null when nothing went in. */
export function moic(flows: readonly Flow[]): number | null {
  const out = flows.filter((f) => f.amount < 0).reduce((a, f) => a - f.amount, 0);
  if (out <= 0) return null;
  return flows.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0) / out;
}

/**
 * The yearly rate r with Σ amount / (1 + r)^((date − first date) / 365) = 0. Null when there is no such
 * rate: all flows one way, a bad date, or no sign change inside −99.99% … +1,000,000%.
 */
export function xirr(flows: readonly Flow[]): number | null {
  const fs = flows.filter((f) => f.amount !== 0);
  if (fs.length < 2) return null;
  if (!fs.some((f) => f.amount < 0) || !fs.some((f) => f.amount > 0)) return null;
  const days = fs.map((f) => day(f.date));
  if (days.some((d) => Number.isNaN(d))) return null;
  const t0 = Math.min(...days);
  const years = days.map((d) => (d - t0) / 365);

  const f = (r: number): number => fs.reduce((acc, fl, i) => acc + fl.amount / Math.pow(1 + r, years[i]), 0);

  let lo = -0.9999;
  let hi = 10_000;
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}
