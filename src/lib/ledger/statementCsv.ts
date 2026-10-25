/**
 * قراءة كشف المزوّد CSV (البند ١٨٩): بنكك أو MTN أو أيّ بنكٍ يصدّر جدولاً بتاريخٍ ومبلغ.
 *
 * Every provider names its columns its own way, in Arabic or English, and writes money either as one signed amount or
 * as two columns (money out, money in). The reader finds the columns by their names, reads each row to a day and a
 * signed whole number of minor units — positive into the account, negative out of it — and keeps the description and
 * reference. Nothing is guessed: a row whose day or amount cannot be read is reported by its line, and a file with more
 * than a few of them is refused whole, so a wrong column choice never turns into a statement that "matches" nothing.
 *
 * The database does the matching (`ledger_statement_import`, 20261025210100_ledger_statements.sql); this only reads.
 */

import { CURRENCIES, MAX_MINOR, normaliseNumber, type CurrencyCode } from "./money";

export interface StatementRow {
  date: string;
  /** Minor units: positive into the account, negative out of it. */
  minor: number;
  description: string;
  reference: string;
}

export type StatementError = "empty" | "no_date_column" | "no_amount_column" | "too_many_rows" | "too_many_bad_rows";

export type StatementParse =
  | { ok: true; rows: StatementRow[]; skipped: number[]; columns: { date: string; amount: string; description: string | null; reference: string | null } }
  | { ok: false; error: StatementError; badLines?: number[] };

export const MAX_STATEMENT_ROWS = 2000;
/** Rows that cannot be read are reported; more than this share of them means the columns were not understood. */
export const MAX_BAD_SHARE = 0.1;

const norm = (h: string) =>
  h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[\s_\-./()]+/g, " ")
    .trim();

// Header words, normalised as above. Order matters within each list only for readability.
const DATE = ["date", "transaction date", "value date", "posting date", "txn date", "التاريخ", "تاريخ", "تاريخ العمليه", "تاريخ المعامله", "تاريخ الحركه"];
const AMOUNT = ["amount", "transaction amount", "المبلغ", "مبلغ", "القيمه", "قيمه العمليه"];
const OUT = ["debit", "withdrawal", "withdrawals", "money out", "paid out", "out", "سحب", "مسحوبات", "مدين", "خصم", "صادر", "منصرف"];
const IN = ["credit", "deposit", "deposits", "money in", "paid in", "in", "ايداع", "ايداعات", "دائن", "اضافه", "وارد"];
const DESC = ["description", "details", "narrative", "particulars", "memo", "remarks", "البيان", "الوصف", "التفاصيل", "ملاحظات", "الشرح"];
const REF = ["reference", "ref", "transaction id", "txn id", "id", "رقم المرجع", "المرجع", "رقم العمليه", "رقم المعامله", "مرجع"];

/** Splits CSV text into rows of cells: quoted cells, doubled quotes, and a comma, semicolon or tab between cells. */
export function splitCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === "") {
      quoted = true;
    } else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * A day in any of the forms statements use: 2026-10-05, 2026/10/05, 05/10/2026, 05-10-2026, 5.10.26. Day-first,
 * as Sudanese and most non-American statements are; a time after the day is ignored.
 */
export function parseStatementDate(raw: string): string | null {
  const s = normaliseNumber(raw.split(/[T\s]/)[0] ?? "");
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (r) {
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * An amount as statements write it, to signed minor units: "1,234.50", "-1,234.50", "(1,234.50)", "1234.5 CR",
 * "١٬٢٣٤٫٥٠", with or without a currency word. More decimals than the currency has is refused, never rounded.
 */
export function parseStatementAmount(raw: string, currency: CurrencyCode): bigint | null {
  let s = normaliseNumber(raw).replace(/[^\d.,()+\-a-z]/gi, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const suffix = s.match(/(cr|dr)$/i);
  if (suffix) {
    negative = suffix[1].toLowerCase() === "dr";
    s = s.slice(0, -2);
  }
  s = s.replace(/[a-z]/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const { digits } = CURRENCIES[currency];
  const frac = m[2] ?? "";
  if (frac.length > digits) return null;
  const minor = BigInt(m[1].replace(/,/g, "") + frac.padEnd(digits, "0"));
  if (minor > MAX_MINOR) return null;
  return negative ? -minor : minor;
}

const has = (header: string, w: string) => header.split(" ").includes(w) || (w.includes(" ") && header.includes(w));

function findColumn(headers: string[], words: string[], unless: string[] = []): number {
  const h = headers.map(norm);
  for (const w of words) {
    const i = h.indexOf(w);
    if (i !== -1) return i;
  }
  // A header that contains one of the words ("Withdrawal (SDG)") — but "Debit amount" is the money-out column, not
  // a signed amount, so a header that also names the other kind of column is passed over.
  for (const w of words) {
    const i = h.findIndex((x) => has(x, w) && !unless.some((u) => has(x, u)));
    if (i !== -1) return i;
  }
  return -1;
}

/** Reads a provider's CSV. `currency` is the statement's: the account's own, or the one the person chose. */
export function parseStatementCsv(text: string, currency: CurrencyCode): StatementParse {
  const table = splitCsv(text);
  if (table.length < 2) return { ok: false, error: "empty" };
  const headers = table[0];
  const di = findColumn(headers, DATE);
  if (di === -1) return { ok: false, error: "no_date_column" };
  const ai = findColumn(headers, AMOUNT, [...OUT, ...IN]);
  const oi = findColumn(headers, OUT);
  const ii = findColumn(headers, IN);
  if (ai === -1 && oi === -1 && ii === -1) return { ok: false, error: "no_amount_column" };
  const ti = findColumn(headers, DESC);
  const ri = findColumn(headers, REF);

  const body = table.slice(1);
  if (body.length > MAX_STATEMENT_ROWS) return { ok: false, error: "too_many_rows" };

  const rows: StatementRow[] = [];
  const bad: number[] = [];
  const skipped: number[] = [];
  body.forEach((cells, k) => {
    const line = k + 2;
    const cell = (i: number) => (i === -1 ? "" : (cells[i] ?? "").trim());
    const date = parseStatementDate(cell(di));
    let minor: bigint | null = null;
    if (ai !== -1 && cell(ai) !== "") {
      minor = parseStatementAmount(cell(ai), currency);
    } else {
      const out = cell(oi) === "" ? BigInt(0) : parseStatementAmount(cell(oi), currency);
      const inn = cell(ii) === "" ? BigInt(0) : parseStatementAmount(cell(ii), currency);
      // Money out is out whatever sign the file writes it with.
      if (out !== null && inn !== null) minor = (inn < 0 ? -inn : inn) - (out < 0 ? -out : out);
    }
    // A row with a day but no movement (an opening-balance line) is not a movement: it is passed over, and said so.
    if (date && minor === BigInt(0)) {
      skipped.push(line);
      return;
    }
    if (!date || minor === null) {
      bad.push(line);
      return;
    }
    rows.push({
      date,
      minor: Number(minor),
      description: cell(ti).slice(0, 200),
      reference: cell(ri).slice(0, 80),
    });
  });

  if (rows.length === 0) return { ok: false, error: "empty", badLines: bad.slice(0, 20) };
  if (bad.length > Math.max(1, Math.floor((rows.length + bad.length) * MAX_BAD_SHARE))) {
    return { ok: false, error: "too_many_bad_rows", badLines: bad.slice(0, 20) };
  }
  return {
    ok: true,
    rows,
    skipped: [...skipped, ...bad],
    columns: {
      date: headers[di],
      amount: ai !== -1 ? headers[ai] : [oi !== -1 ? headers[oi] : null, ii !== -1 ? headers[ii] : null].filter(Boolean).join(" / "),
      description: ti !== -1 ? headers[ti] : null,
      reference: ri !== -1 ? headers[ri] : null,
    },
  };
}

/** The refusal in the reader's words. */
export function statementErrorMessage(e: StatementError, t: (ar: string, en: string) => string, lines?: number[]): string {
  const at = lines && lines.length ? t(` (السطور: ${lines.join("، ")})`, ` (lines: ${lines.join(", ")})`) : "";
  switch (e) {
    case "empty":
      return t("لم أجد في الملف سطراً فيه تاريخٌ ومبلغ.", "No row with a date and an amount was found in the file.") + at;
    case "no_date_column":
      return t("لم أجد عمود التاريخ. سمّه «التاريخ» أو «Date» في السطر الأوّل.", "No date column found. Name it “Date” in the first row.");
    case "no_amount_column":
      return t(
        "لم أجد عمود المبلغ. سمّه «المبلغ» (موجبٌ للداخل وسالبٌ للخارج)، أو عمودين «سحب» و«إيداع».",
        "No amount column found. Name it “Amount” (positive in, negative out), or two columns “Debit” and “Credit”.",
      );
    case "too_many_rows":
      return t(`الكشف أطول من ${MAX_STATEMENT_ROWS} سطر؛ قسّمه إلى فترات.`, `The statement is longer than ${MAX_STATEMENT_ROWS} rows; split it by period.`);
    case "too_many_bad_rows":
      return t("سطورٌ كثيرة لم تُقرأ تواريخها أو مبالغها؛ تأكّد من الأعمدة.", "Many rows had a date or amount that could not be read; check the columns.") + at;
  }
}
