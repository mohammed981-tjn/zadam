/**
 * تقارير الدفتر كما يعرضها التطبيق (البند ٢٠٣). Pure: it takes what `loadReport` read for /books and lays it out as
 * plain JSON, every figure already written as the page writes it (`money`), so the app shows the website's numbers
 * character for character and never does sums of its own. Names are Arabic, as the app is.
 */

import { formatMoney } from "./money";
import { money } from "./reports";
import { currentIncomeLabel, type ReportData } from "./reportData";
import {
  counterNeedsAccount,
  isReversed,
  LINK_KIND_LABEL,
  LINK_STATUS_LABEL,
  REVERSAL_LABEL,
  reversalAction,
  type LinkRow,
} from "../ledgerLinks";

const TYPE_AR: Record<string, string> = { asset: "أصل", liability: "التزام", equity: "ملكيّة", revenue: "إيراد", expense: "مصروف" };

type Named = { code: string; name_ar: string };
const line = (r: Named, amount: bigint | number) => ({ code: r.code, name: r.name_ar, amount: money(amount) });
const nz = (v: bigint | number) => (Number(v) === 0 ? "" : money(v));

export function reportForApp(data: ReportData, today: string): Record<string, unknown> {
  switch (data.kind) {
    case "trial":
      return {
        kind: "trial",
        balanced: data.trial.balanced,
        rows: data.trial.rows.map((r) => ({ code: r.code, name: r.name_ar, debit: nz(r.debit_balance), credit: nz(r.credit_balance) })),
        memo: data.trial.memo.map((r) => ({ code: r.code, name: r.name_ar, debit: nz(r.debit_balance), credit: nz(r.credit_balance) })),
        total_debit: money(data.trial.totalDebit),
        total_credit: money(data.trial.totalCredit),
      };
    case "income":
      return {
        kind: "income",
        revenue: data.statement.revenue.map((r) => line(r, r.amount)),
        expense: data.statement.expense.map((r) => line(r, r.amount)),
        total_revenue: money(data.statement.totalRevenue),
        total_expense: money(data.statement.totalExpense),
        net_income: money(data.statement.netIncome),
      };
    case "balance": {
      const s = data.sheet;
      return {
        kind: "balance",
        balanced: s.balanced,
        assets: s.assets.map((r) => line(r, r.balance)),
        liabilities: s.liabilities.map((r) => line(r, r.balance)),
        equity: s.equity.map((r) => line(r, r.balance)),
        retained_income: s.retainedIncome !== BigInt(0) ? money(s.retainedIncome) : null,
        current_income_label: currentIncomeLabel(data.asOf, today).ar,
        current_income: money(s.currentIncome),
        total_assets: money(s.totalAssets),
        total_liabilities: money(s.totalLiabilities),
        total_equity: money(s.totalEquityWithIncome),
        total_liabilities_equity: money(s.totalLiabilities + s.totalEquityWithIncome),
      };
    }
    case "cash": {
      const f = data.flow;
      return {
        kind: "cash",
        ties: f.ties,
        opening: money(f.opening),
        sections: [
          { key: "operating", title: "أنشطة التشغيل", rows: f.operating.map((r) => line(r, r.amount)), total: money(f.totalOperating) },
          { key: "investing", title: "أنشطة الاستثمار", rows: f.investing.map((r) => line(r, r.amount)), total: money(f.totalInvesting) },
          { key: "financing", title: "أنشطة التمويل", rows: f.financing.map((r) => line(r, r.amount)), total: money(f.totalFinancing) },
        ],
        net: money(f.net),
        closing: money(f.closing),
      };
    }
    case "seasons":
      return {
        kind: "seasons",
        rows: data.rows.map((r) => ({
          season_id: r.season_id,
          name: r.name,
          revenue: money(r.revenue),
          expense: money(r.expense),
          profit: money(BigInt(Math.round(r.revenue)) - BigInt(Math.round(r.expense))),
        })),
      };
    case "journal":
      return {
        kind: "journal",
        has_more: data.hasMore,
        entries: data.entries.map((e) => ({
          id: e.id,
          entry_no: e.entry_no,
          entry_date: e.entry_date,
          memo: e.memo,
          reversal: e.reversal_of !== null,
          lines: e.lines.map((l) => ({
            code: l.code,
            account: l.account,
            debit: l.side === "D" ? money(l.base_minor) : "",
            credit: l.side === "C" ? money(l.base_minor) : "",
            foreign: l.currency !== "USD" ? `${money(l.amount_minor)} ${l.currency}` : "",
          })),
        })),
      };
    case "chart":
      return {
        kind: "chart",
        accounts: data.accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name_ar,
          type: TYPE_AR[a.type] ?? a.type,
          postable: a.postable,
          active: a.active,
          depth: Math.min(Math.max(0, a.code.length - 1), 4),
        })),
      };
    case "account":
      return {
        kind: "account",
        account: { id: data.account.id, code: data.account.code, name: data.account.name_ar },
        rows: data.rows.map((r) => ({
          date: r.entry_date,
          entry_no: r.entry_no,
          memo: r.memo,
          movement: r.row_type === "line" ? money(r.signed_base) : "",
          balance: money(r.running_base),
          opening: r.row_type === "opening",
        })),
      };
  }
}

/**
 * The partner proposals, grouped as LinksPanel groups them on /books?r=links, each with what the reader may do with
 * it — the same `reversalAction` and `counterNeedsAccount` the panel asks — so the app offers the website's buttons
 * and no others.
 */
export function linksForApp(rows: readonly LinkRow[]) {
  const amount = (r: LinkRow, minor = r.amount_minor) => formatMoney(BigInt(Math.round(minor)), r.currency, true);
  const view = (r: LinkRow) => {
    const reversed = isReversed(r);
    return {
      id: r.id,
      kind: r.kind,
      kind_label: LINK_KIND_LABEL[r.kind]?.ar ?? r.kind,
      status: r.status,
      mine: r.mine,
      amount: amount(r),
      settles: r.kind === "harvest_share" && r.principal_minor > 0 ? amount(r, r.principal_minor) : null,
      other_name: r.other_name,
      entry_date: r.entry_date,
      agreement_ref: r.agreement_ref,
      memo: r.memo,
      status_label: reversed
        ? "مؤكَّد ثمّ أُلغي باتّفاقكما — القيدان الأصليّان وقيدا العكس في دفترَيكما"
        : (LINK_STATUS_LABEL[r.status]?.ar ?? r.status),
      live: r.status === "confirmed" && !reversed,
      reject_reason: r.reject_reason,
      needs_account: counterNeedsAccount(r.kind),
      reversal: r.reversal
        ? {
            id: r.reversal.id,
            status: r.reversal.status,
            label: REVERSAL_LABEL[r.reversal.status]?.ar ?? r.reversal.status,
            reason: r.reversal.reason,
            reject_reason: r.reversal.reject_reason,
          }
        : null,
      action: reversalAction(r),
    };
  };
  return {
    waiting_for_me: rows.filter((r) => r.status === "pending" && !r.mine).map(view),
    reversals_for_me: rows.filter((r) => reversalAction(r) === "answer").map(view),
    waiting_for_them: rows.filter((r) => r.status === "pending" && r.mine).map(view),
    decided: rows.filter((r) => r.status !== "pending").map(view),
  };
}
