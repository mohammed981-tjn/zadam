/**
 * القوائم الماليّة من أرقام القاعدة (البند ١٨٧، المرحلة ٢د).
 *
 * The database sums the lines; this arranges them: the income statement with its totals, the balance sheet
 * with the unclosed net income carried to equity, the cash-flow statement tied to the cash balances. Every
 * figure is a whole number of the dollar's cents — sums are done with BigInt, never a float — and every
 * statement says whether it ties, so a page never shows a statement that does not add up without saying so.
 *
 * Also the CSV writer the export uses: quoted per RFC 4180, with the byte-order mark Excel needs to read
 * Arabic, and a guard against a cell that a spreadsheet would run as a formula.
 */

import { formatMoney, minorToDecimal } from "./money";

const ZERO = BigInt(0);

export interface IncomeRow {
  code: string;
  name_ar: string;
  name_en: string;
  type: "revenue" | "expense";
  system_key: string | null;
  amount: number;
}

export interface BalanceRow {
  code: string;
  name_ar: string;
  name_en: string;
  type: "asset" | "liability" | "equity";
  system_key: string | null;
  balance: number;
}

export interface CashFlowRow {
  section: "operating" | "investing" | "financing";
  code: string;
  name_ar: string;
  name_en: string;
  amount: number;
}

const big = (n: number): bigint => BigInt(Math.round(n));
const sum = (xs: readonly bigint[]): bigint => xs.reduce((a, b) => a + b, ZERO);

export interface IncomeStatement {
  revenue: IncomeRow[];
  expense: IncomeRow[];
  totalRevenue: bigint;
  totalExpense: bigint;
  netIncome: bigint;
}

export function buildIncomeStatement(rows: readonly IncomeRow[]): IncomeStatement {
  const revenue = rows.filter((r) => r.type === "revenue");
  const expense = rows.filter((r) => r.type === "expense");
  const totalRevenue = sum(revenue.map((r) => big(r.amount)));
  const totalExpense = sum(expense.map((r) => big(r.amount)));
  return { revenue, expense, totalRevenue, totalExpense, netIncome: totalRevenue - totalExpense };
}

export interface BalanceSheet {
  assets: BalanceRow[];
  liabilities: BalanceRow[];
  equity: BalanceRow[];
  totalAssets: bigint;
  totalLiabilities: bigint;
  /** Equity accounts only; the unclosed net income is shown beside it, not inside it. */
  totalEquity: bigint;
  /** What the income statement says the period earned and nobody has yet closed into retained earnings. */
  netIncome: bigint;
  /** Equity including the unclosed net income. */
  totalEquityWithIncome: bigint;
  /** Assets = liabilities + equity + net income. False means a ledger fault, and the page must say so. */
  balanced: boolean;
}

export function buildBalanceSheet(rows: readonly BalanceRow[], netIncome: bigint): BalanceSheet {
  const assets = rows.filter((r) => r.type === "asset");
  const liabilities = rows.filter((r) => r.type === "liability");
  const equity = rows.filter((r) => r.type === "equity");
  const totalAssets = sum(assets.map((r) => big(r.balance)));
  const totalLiabilities = sum(liabilities.map((r) => big(r.balance)));
  const totalEquity = sum(equity.map((r) => big(r.balance)));
  const totalEquityWithIncome = totalEquity + netIncome;
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    totalEquityWithIncome,
    balanced: totalAssets === totalLiabilities + totalEquityWithIncome,
  };
}

export const CASH_KEYS: readonly string[] = ["cash_on_hand", "bank", "wallet"];

export interface CashFlowStatement {
  operating: CashFlowRow[];
  investing: CashFlowRow[];
  financing: CashFlowRow[];
  totalOperating: bigint;
  totalInvesting: bigint;
  totalFinancing: bigint;
  net: bigint;
  opening: bigint;
  closing: bigint;
  /** Opening cash + the period's movement = closing cash. */
  ties: boolean;
}

export function buildCashFlow(rows: readonly CashFlowRow[], opening: bigint, closing: bigint): CashFlowStatement {
  const operating = rows.filter((r) => r.section === "operating");
  const investing = rows.filter((r) => r.section === "investing");
  const financing = rows.filter((r) => r.section === "financing");
  const totalOperating = sum(operating.map((r) => big(r.amount)));
  const totalInvesting = sum(investing.map((r) => big(r.amount)));
  const totalFinancing = sum(financing.map((r) => big(r.amount)));
  const net = totalOperating + totalInvesting + totalFinancing;
  return {
    operating,
    investing,
    financing,
    totalOperating,
    totalInvesting,
    totalFinancing,
    net,
    opening,
    closing,
    ties: opening + net === closing,
  };
}

/** The cash on the books at a date: the balance of the cash, bank and wallet accounts. */
export const cashBalance = (rows: readonly BalanceRow[]): bigint =>
  sum(rows.filter((r) => r.system_key !== null && CASH_KEYS.includes(r.system_key)).map((r) => big(r.balance)));

export interface TrialRow {
  code: string;
  name_ar: string;
  name_en: string;
  type: string;
  debit_balance: number;
  credit_balance: number;
}

export interface TrialBalance {
  /** Real accounts; the 9xxx statistical accounts of the platform book are kept apart. */
  rows: TrialRow[];
  memo: TrialRow[];
  totalDebit: bigint;
  totalCredit: bigint;
  balanced: boolean;
}

export function buildTrialBalance(rows: readonly TrialRow[]): TrialBalance {
  const memo = rows.filter((r) => r.code.startsWith("9"));
  const real = rows.filter((r) => !r.code.startsWith("9"));
  const totalDebit = sum(real.map((r) => big(r.debit_balance)));
  const totalCredit = sum(real.map((r) => big(r.credit_balance)));
  return { rows: real, memo, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/** A figure for the screen: grouped thousands and two decimals, no currency name (the heading carries it). */
export const money = (minor: bigint | number): string =>
  formatMoney(typeof minor === "bigint" ? minor : big(minor), "USD", false);

// ── CSV ─────────────────────────────────────────────────────────────────────

/** A money cell: written as the plain decimal a spreadsheet reads as a number ("-1234.50"). */
export interface MoneyCell {
  minor: bigint;
}
export const moneyCell = (minor: bigint | number): MoneyCell => ({ minor: typeof minor === "bigint" ? minor : big(minor) });

export type CsvCell = string | number | MoneyCell | null;

/**
 * A spreadsheet runs a cell that starts with = + - @ (or a tab or return) as a formula, and a ledger's
 * memo text is typed by users. Text cells starting so get a leading apostrophe; money and counts are
 * written as numbers and never touched.
 */
function csvText(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  const lines = rows.map((row) =>
    row
      .map((c) => {
        if (c === null) return "";
        if (typeof c === "number") return String(c);
        if (typeof c === "string") return csvText(c);
        return minorToDecimal(c.minor, "USD");
      })
      .join(","),
  );
  // The byte-order mark makes Excel read the file as UTF-8, so Arabic names are not shown as symbols.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
