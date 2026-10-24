/**
 * ما يطلبه القارئ من صفحة الدفتر في عنوانها: أيّ تقرير، ومن أيّ يومٍ إلى أيّ يوم (البند ١٨٧ ٢د).
 *
 * The address is typed by whoever opens the page, so nothing in it is trusted: a report name outside the
 * list falls back to the trial balance, a date that is not a real calendar day falls back to its default,
 * a period that runs backwards is turned round, and a page number is a small positive whole number.
 */

export const REPORTS = ["trial", "income", "balance", "cash", "seasons", "journal", "chart", "account", "links"] as const;
export type ReportKey = (typeof REPORTS)[number];

export const BOOK_KINDS = ["farm", "investor", "platform"] as const;
export type BookKind = (typeof BOOK_KINDS)[number];

export interface ReportParams {
  report: ReportKey;
  kind: BookKind | null;
  from: string;
  to: string;
  asOf: string;
  account: string | null;
  page: number;
}

export const PAGE_SIZE = 25;
export const MAX_PAGE = 400;

const DAY = 86_400_000;

/** A real calendar day in ISO form — 2026-02-31 is not one. */
export function isIsoDate(s: string | undefined): s is string {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Number(m[1]) >= 2000;
}

/** The day before an ISO day: the opening balance of a period is the balance at the end of that day. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DAY).toISOString().slice(0, 10);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReportParams(sp: Record<string, string | undefined>, today: string): ReportParams {
  const report = (REPORTS as readonly string[]).includes(sp.r ?? "") ? (sp.r as ReportKey) : "trial";
  const kind = (BOOK_KINDS as readonly string[]).includes(sp.book ?? "") ? (sp.book as BookKind) : null;

  let from = isIsoDate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  let to = isIsoDate(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];
  const asOf = isIsoDate(sp.as_of) ? sp.as_of : today;

  const account = sp.a && UUID.test(sp.a) ? sp.a.toLowerCase() : null;
  const n = Number(sp.p);
  const page = Number.isInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;

  return { report: report === "account" && !account ? "chart" : report, kind, from, to, asOf, account, page };
}

/** The query string of a report, for links and for the export — only what differs from the default is written. */
export function reportHref(base: string, p: Partial<ReportParams> & { report: ReportKey }, today: string): string {
  const q = new URLSearchParams();
  q.set("r", p.report);
  if (p.kind) q.set("book", p.kind);
  if (p.from && p.from !== `${today.slice(0, 4)}-01-01`) q.set("from", p.from);
  if (p.to && p.to !== today) q.set("to", p.to);
  if (p.asOf && p.asOf !== today) q.set("as_of", p.asOf);
  if (p.account) q.set("a", p.account);
  if (p.page && p.page > 1) q.set("p", String(p.page));
  return `${base}?${q.toString()}`;
}
