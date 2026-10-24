/**
 * قراءة تقارير الدفتر من القاعدة (البند ١٨٧ ٢د). كلّ القراءات بصلاحية القارئ نفسه، فسياسة الصفوف هي من يقرّر
 * ما يرى؛ ومن لا دفتر له (أو دفترٌ ليس له) لا يصله صفّ. الصفحة والتصدير يمرّان من هنا فيتّفقان.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayBefore, PAGE_SIZE, type BookKind, type ReportKey, type ReportParams } from "./reportParams";
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
  cashBalance,
  type BalanceRow,
  type CashFlowRow,
  type IncomeRow,
  type TrialRow,
} from "./reports";
import type { ChartRow, JournalEntryView, ReportData, SeasonProfitRow, StatementLine } from "./reportData";

export interface BookRef {
  id: string;
  kind: BookKind;
  closed_through: string | null;
}

/**
 * The reader's own book of the kind asked for — the farm book by default, else the investor's. For an
 * administrator `platform` is the platform's. The policy decides: asking for a book that is not yours
 * returns nothing, and so does a kind nobody has opened yet.
 */
export async function pickBook(supabase: SupabaseClient, want: BookKind | null): Promise<BookRef | null> {
  const kinds: BookKind[] = want ? [want] : ["farm", "investor"];
  for (const kind of kinds) {
    const { data } = await supabase.from("ledger_books").select("id, kind, closed_through").eq("kind", kind).limit(1).maybeSingle();
    if (data) return data as BookRef;
  }
  return null;
}

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

/** The reports that read a book. The partner proposals ("links") are the person's, not a book's, and load beside it. */
export type BookReportParams = ReportParams & { report: Exclude<ReportKey, "links"> };

export async function loadReport(supabase: SupabaseClient, book: BookRef, p: BookReportParams): Promise<ReportData> {
  switch (p.report) {
    case "trial": {
      const rows = await rpc<TrialRow>(supabase, "ledger_trial_balance", { p_book: book.id, p_as_of: p.asOf });
      return { kind: "trial", trial: buildTrialBalance(rows) };
    }
    case "income": {
      const rows = await rpc<IncomeRow>(supabase, "ledger_income_statement", { p_book: book.id, p_from: p.from, p_to: p.to, p_season: null });
      return { kind: "income", statement: buildIncomeStatement(rows) };
    }
    case "balance": {
      const [rows, income] = await Promise.all([
        rpc<BalanceRow>(supabase, "ledger_balance_sheet", { p_book: book.id, p_as_of: p.asOf }),
        rpc<IncomeRow>(supabase, "ledger_income_statement", { p_book: book.id, p_from: null, p_to: p.asOf, p_season: null }),
      ]);
      return { kind: "balance", sheet: buildBalanceSheet(rows, buildIncomeStatement(income).netIncome) };
    }
    case "cash": {
      const [rows, opening, closing] = await Promise.all([
        rpc<CashFlowRow>(supabase, "ledger_cash_flow", { p_book: book.id, p_from: p.from, p_to: p.to }),
        rpc<BalanceRow>(supabase, "ledger_balance_sheet", { p_book: book.id, p_as_of: dayBefore(p.from) }),
        rpc<BalanceRow>(supabase, "ledger_balance_sheet", { p_book: book.id, p_as_of: p.to }),
      ]);
      return { kind: "cash", flow: buildCashFlow(rows, cashBalance(opening), cashBalance(closing)) };
    }
    case "seasons": {
      const rows = await rpc<{ season_id: string | null; revenue: number; expense: number }>(supabase, "ledger_profit_by_season", {
        p_book: book.id,
        p_from: p.from,
        p_to: p.to,
      });
      const ids = rows.map((r) => r.season_id).filter((x): x is string => !!x);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from("seasons").select("id, name").in("id", ids);
        for (const s of (data ?? []) as { id: string; name: string }[]) names.set(s.id, s.name);
      }
      const out: SeasonProfitRow[] = rows.map((r) => ({
        season_id: r.season_id,
        name: r.season_id ? (names.get(r.season_id) ?? "—") : "بلا موسم",
        revenue: Number(r.revenue),
        expense: Number(r.expense),
      }));
      return { kind: "seasons", rows: out };
    }
    case "journal": {
      const from = (p.page - 1) * PAGE_SIZE;
      const { data: entries, error } = await supabase
        .from("journal_entries")
        .select("id, entry_no, entry_date, memo, reversal_of, fx_rate")
        .eq("book_id", book.id)
        .gte("entry_date", p.from)
        .lte("entry_date", p.to)
        .order("entry_date", { ascending: false })
        .order("entry_no", { ascending: false })
        .range(from, from + PAGE_SIZE); // one more than a page, to know whether there is a next
      if (error) throw new Error(`journal_entries: ${error.message}`);
      const all = (entries ?? []) as Omit<JournalEntryView, "lines">[];
      const page = all.slice(0, PAGE_SIZE);
      const ids = page.map((e) => e.id);
      const lines = ids.length
        ? (((await supabase
            .from("journal_lines")
            .select("entry_id, line_no, account_id, side, currency, amount_minor, base_minor")
            .eq("book_id", book.id)
            .in("entry_id", ids)
            .order("line_no")).data ?? []) as {
            entry_id: string;
            line_no: number;
            account_id: string;
            side: "D" | "C";
            currency: string;
            amount_minor: number;
            base_minor: number;
          }[])
        : [];
      const accounts = await chart(supabase, book);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const view: JournalEntryView[] = page.map((e) => ({
        ...e,
        lines: lines
          .filter((l) => l.entry_id === e.id)
          .map((l) => ({
            line_no: l.line_no,
            code: byId.get(l.account_id)?.code ?? "",
            account: byId.get(l.account_id)?.name_ar ?? "",
            side: l.side,
            currency: l.currency,
            amount_minor: Number(l.amount_minor),
            base_minor: Number(l.base_minor),
          })),
      }));
      return { kind: "journal", entries: view, hasMore: all.length > PAGE_SIZE };
    }
    case "chart":
      return { kind: "chart", accounts: await chart(supabase, book) };
    case "account": {
      const accounts = await chart(supabase, book);
      const account = accounts.find((a) => a.id === p.account);
      if (!account) return { kind: "chart", accounts };
      const rows = await rpc<StatementLine>(supabase, "ledger_account_statement", {
        p_book: book.id,
        p_account: account.id,
        p_from: p.from,
        p_to: p.to,
      });
      return { kind: "account", account, rows };
    }
  }
}

async function chart(supabase: SupabaseClient, book: BookRef): Promise<ChartRow[]> {
  const { data, error } = await supabase
    .from("ledger_accounts")
    .select("id, code, parent_code, name_ar, name_en, type, postable, active")
    .eq("book_id", book.id)
    .order("code");
  if (error) throw new Error(`ledger_accounts: ${error.message}`);
  return (data ?? []) as ChartRow[];
}
