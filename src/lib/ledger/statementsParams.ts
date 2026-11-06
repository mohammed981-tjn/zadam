/**
 * ما يطلبه القارئ من صفحة القوائم الماليّة (البند ٢٠٥): أيّ دفتر، وعلى أيّ أساسٍ تُقارَن الفترة، وأيّ شهرٍ أو سنةٍ أو موسم.
 *
 * The address is typed by whoever opens it, the app sends the same keys, and the PDF route reads them too — so one
 * parser, and nothing in it is trusted: an unknown basis is the year, a month or year that is not real is this one,
 * a season id that is not a uuid is no season. The previous period itself is the database's (`ledger_compare_period`),
 * so the website, the app, the PDF and the SQL gate agree on it to the day.
 */

import { BOOK_KINDS, type BookKind } from "./reportParams";

export const BASES = ["year", "month", "season"] as const;
export type Basis = (typeof BASES)[number];

export interface StatementsParams {
  kind: BookKind | null;
  /** The book an administrator's inspection opened; without it, the reader's own. */
  bookId: string | null;
  basis: Basis;
  /** YYYY, for the year basis. */
  year: number;
  /** YYYY-MM, for the month basis. */
  month: string;
  /** For the season basis. */
  season: string | null;
  /** Two columns (this period and the one before) or one. */
  compare: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStatementsParams(sp: Record<string, string | undefined>, today: string): StatementsParams {
  const thisYear = Number(today.slice(0, 4));
  const basis = (BASES as readonly string[]).includes(sp.basis ?? "") ? (sp.basis as Basis) : "year";
  const kind = (BOOK_KINDS as readonly string[]).includes(sp.book ?? "") ? (sp.book as BookKind) : null;
  const bookId = sp.id && UUID.test(sp.id) ? sp.id.toLowerCase() : null;

  const y = Number(sp.y);
  const year = Number.isInteger(y) && y >= 2000 && y <= thisYear ? y : thisYear;

  const m = /^(\d{4})-(\d{2})$/.exec(sp.m ?? "");
  const month =
    m && Number(m[1]) >= 2000 && Number(m[2]) >= 1 && Number(m[2]) <= 12 && `${m[1]}-${m[2]}` <= today.slice(0, 7)
      ? `${m[1]}-${m[2]}`
      : today.slice(0, 7);

  const season = sp.s && UUID.test(sp.s) ? sp.s.toLowerCase() : null;
  const compare = sp.compare !== "0";

  // A season basis with no season is the year: there is nothing to pick the period from.
  return { kind, bookId, basis: basis === "season" && !season ? "year" : basis, year, month, season, compare };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The last day of a month, `YYYY-MM`. */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/**
 * The period a month or a year stands for, never past today: this year is the year to date, this month the month
 * to date — and the database compares it with the same days a year or a month before.
 */
export function periodOf(p: Pick<StatementsParams, "basis" | "year" | "month">, today: string): { from: string; to: string } {
  const [from, end] = p.basis === "month" ? [`${p.month}-01`, monthEnd(p.month)] : [`${p.year}-01-01`, `${p.year}-12-31`];
  return { from, to: end < today ? end : today };
}

/** The query string of these statements, for links, the PDF and the app — only what differs from the default. */
export function statementsQuery(p: StatementsParams, today: string): string {
  const q = new URLSearchParams();
  if (p.kind) q.set("book", p.kind);
  if (p.bookId) q.set("id", p.bookId);
  if (p.basis !== "year") q.set("basis", p.basis);
  if (p.basis === "year" && p.year !== Number(today.slice(0, 4))) q.set("y", String(p.year));
  if (p.basis === "month" && p.month !== today.slice(0, 7)) q.set("m", p.month);
  if (p.basis === "season" && p.season) q.set("s", p.season);
  if (!p.compare) q.set("compare", "0");
  const s = q.toString();
  return s ? `?${s}` : "";
}
