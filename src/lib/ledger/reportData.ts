/**
 * شكل ما تعرضه صفحة الدفتر، وكيف يصير ملف CSV (البند ١٨٧ ٢د). نقيٌّ بلا قاعدة: الصفحة والتصدير يأخذان البيانات
 * نفسها من `load.ts`، فما في الملف هو ما على الشاشة.
 */

import {
  moneyCell,
  toCsv,
  type BalanceSheet,
  type CashFlowStatement,
  type CsvCell,
  type IncomeStatement,
  type TrialBalance,
} from "./reports";

export interface SeasonProfitRow {
  season_id: string | null;
  name: string;
  revenue: number;
  expense: number;
}

export interface JournalLineView {
  line_no: number;
  code: string;
  account: string;
  side: "D" | "C";
  currency: string;
  amount_minor: number;
  base_minor: number;
}

export interface JournalEntryView {
  id: string;
  entry_no: number;
  entry_date: string;
  memo: string;
  reversal_of: string | null;
  fx_rate: number | null;
  lines: JournalLineView[];
}

export interface ChartRow {
  id: string;
  code: string;
  parent_code: string | null;
  name_ar: string;
  name_en: string;
  type: string;
  postable: boolean;
  active: boolean;
}

export interface StatementLine {
  row_type: "opening" | "line";
  entry_no: number | null;
  entry_date: string | null;
  memo: string | null;
  side: string | null;
  currency: string | null;
  amount_minor: number | null;
  base_minor: number | null;
  signed_base: number;
  running_base: number;
}

export type ReportData =
  | { kind: "trial"; trial: TrialBalance }
  | { kind: "income"; statement: IncomeStatement }
  | { kind: "balance"; sheet: BalanceSheet }
  | { kind: "cash"; flow: CashFlowStatement }
  | { kind: "seasons"; rows: SeasonProfitRow[] }
  | { kind: "journal"; entries: JournalEntryView[]; hasMore: boolean }
  | { kind: "chart"; accounts: ChartRow[] }
  | { kind: "account"; account: ChartRow; rows: StatementLine[] };

const TYPE_AR: Record<string, string> = { asset: "أصل", liability: "التزام", equity: "ملكيّة", revenue: "إيراد", expense: "مصروف" };
const SECTION_AR: Record<string, string> = { operating: "تشغيليّة", investing: "استثماريّة", financing: "تمويليّة" };

/** The rows of the CSV a report exports, with the heading the page shows, amounts in dollars. */
export function reportToCsv(data: ReportData): string {
  const rows: CsvCell[][] = [];
  switch (data.kind) {
    case "trial":
      rows.push(["الرمز", "الحساب", "النوع", "مدين (دولار)", "دائن (دولار)"]);
      for (const r of [...data.trial.rows, ...data.trial.memo]) {
        rows.push([r.code, r.name_ar, TYPE_AR[r.type] ?? r.type, moneyCell(r.debit_balance), moneyCell(r.credit_balance)]);
      }
      rows.push(["", "المجموع", "", moneyCell(data.trial.totalDebit), moneyCell(data.trial.totalCredit)]);
      break;
    case "income":
      rows.push(["الرمز", "الحساب", "النوع", "المبلغ (دولار)"]);
      for (const r of data.statement.revenue) rows.push([r.code, r.name_ar, "إيراد", moneyCell(r.amount)]);
      rows.push(["", "مجموع الإيراد", "", moneyCell(data.statement.totalRevenue)]);
      for (const r of data.statement.expense) rows.push([r.code, r.name_ar, "مصروف", moneyCell(r.amount)]);
      rows.push(["", "مجموع المصروف", "", moneyCell(data.statement.totalExpense)]);
      rows.push(["", "صافي الدخل", "", moneyCell(data.statement.netIncome)]);
      break;
    case "balance":
      rows.push(["الرمز", "الحساب", "النوع", "الرصيد (دولار)"]);
      for (const r of data.sheet.assets) rows.push([r.code, r.name_ar, "أصل", moneyCell(r.balance)]);
      rows.push(["", "مجموع الأصول", "", moneyCell(data.sheet.totalAssets)]);
      for (const r of data.sheet.liabilities) rows.push([r.code, r.name_ar, "التزام", moneyCell(r.balance)]);
      rows.push(["", "مجموع الالتزامات", "", moneyCell(data.sheet.totalLiabilities)]);
      for (const r of data.sheet.equity) rows.push([r.code, r.name_ar, "ملكيّة", moneyCell(r.balance)]);
      rows.push(["", "أرباح السنوات السابقة (محتجزة)", "", moneyCell(data.sheet.retainedIncome)]);
      rows.push(["", "ربح هذه السنة حتى اليوم", "", moneyCell(data.sheet.currentIncome)]);
      rows.push(["", "مجموع الملكيّة", "", moneyCell(data.sheet.totalEquityWithIncome)]);
      break;
    case "cash":
      rows.push(["القسم", "الرمز", "الحساب المقابل", "المبلغ (دولار)"]);
      for (const sec of ["operating", "investing", "financing"] as const) {
        for (const r of data.flow[sec]) rows.push([SECTION_AR[sec], r.code, r.name_ar, moneyCell(r.amount)]);
      }
      rows.push(["", "", "رصيد النقد أوّل الفترة", moneyCell(data.flow.opening)]);
      rows.push(["", "", "صافي الحركة", moneyCell(data.flow.net)]);
      rows.push(["", "", "رصيد النقد آخر الفترة", moneyCell(data.flow.closing)]);
      break;
    case "seasons":
      rows.push(["الموسم", "الإيراد (دولار)", "المصروف (دولار)", "الربح (دولار)"]);
      for (const r of data.rows) {
        rows.push([r.name, moneyCell(r.revenue), moneyCell(r.expense), moneyCell(BigInt(Math.round(r.revenue)) - BigInt(Math.round(r.expense)))]);
      }
      break;
    case "journal":
      rows.push(["رقم القيد", "التاريخ", "البيان", "الرمز", "الحساب", "مدين (دولار)", "دائن (دولار)", "العملة", "المبلغ بعملته"]);
      for (const e of data.entries) {
        for (const l of e.lines) {
          rows.push([
            e.entry_no,
            e.entry_date,
            e.reversal_of ? `عكس: ${e.memo}` : e.memo,
            l.code,
            l.account,
            l.side === "D" ? moneyCell(l.base_minor) : null,
            l.side === "C" ? moneyCell(l.base_minor) : null,
            l.currency,
            moneyCell(l.amount_minor),
          ]);
        }
      }
      // A file that does not hold the whole period says so, on its last line.
      if (data.hasMore) rows.push(["", "", `الملف ناقص: يحمل أحدث ${data.entries.length} قيداً من الفترة فقط؛ صدّر فترةً أقصر لما قبلها`]);
      break;
    case "chart":
      rows.push(["الرمز", "الحساب", "النوع", "يُقيَّد عليه", "نشط"]);
      for (const a of data.accounts) rows.push([a.code, a.name_ar, TYPE_AR[a.type] ?? a.type, a.postable ? "نعم" : "لا (تجميعيّ)", a.active ? "نعم" : "لا"]);
      break;
    case "account":
      rows.push(["التاريخ", "رقم القيد", "البيان", "الجانب", "العملة", "المبلغ (دولار)", "الرصيد الجاري (دولار)"]);
      for (const r of data.rows) {
        rows.push([r.entry_date, r.entry_no, r.memo, r.side, r.currency, moneyCell(r.signed_base), moneyCell(r.running_base)]);
      }
      break;
  }
  return toCsv(rows);
}
