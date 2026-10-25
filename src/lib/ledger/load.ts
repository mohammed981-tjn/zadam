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
  owner_id: string | null;
}

const BOOK_COLUMNS = "id, kind, closed_through, owner_id";

/**
 * With `bookId`, that one book, if the policy lets the reader see it — the book an administrator's inspection opened,
 * and no other. Without it, the reader's **own** book of the kind asked for (the farm book by default, else the
 * investor's; `platform` is the platform's, which has no owner). Picking by kind alone took whichever book the policy
 * showed first, and an administrator inspecting one farm, or farming himself, could be shown another (review 198 B2).
 */
export async function pickBook(
  supabase: SupabaseClient,
  want: BookKind | null,
  me: string,
  bookId: string | null = null,
): Promise<BookRef | null> {
  if (bookId) {
    const { data } = await supabase.from("ledger_books").select(BOOK_COLUMNS).eq("id", bookId).maybeSingle();
    return (data as BookRef | null) ?? null;
  }
  const kinds: BookKind[] = want ? [want] : ["farm", "investor"];
  for (const kind of kinds) {
    const q = supabase.from("ledger_books").select(BOOK_COLUMNS).eq("kind", kind);
    const { data } = await (kind === "platform" ? q.is("owner_id", null) : q.eq("owner_id", me)).limit(1).maybeSingle();
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

/**
 * `whole` is the file export: every entry of the period and every line of a statement, read in pages of what the API
 * returns at most, not the screen's page of 25 (backlog 198: the journal file used to hold the last 25 and say nothing).
 */
export async function loadReport(
  supabase: SupabaseClient,
  book: BookRef,
  p: BookReportParams,
  opts: { whole?: boolean } = {},
): Promise<ReportData> {
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
      const [rows, income, prior] = await Promise.all([
        rpc<BalanceRow>(supabase, "ledger_balance_sheet", { p_book: book.id, p_as_of: p.asOf }),
        rpc<IncomeRow>(supabase, "ledger_income_statement", { p_book: book.id, p_from: null, p_to: p.asOf, p_season: null }),
        // Up to the last day of the year before the sheet's date: the part of the profit a year-end closing would carry forward.
        rpc<IncomeRow>(supabase, "ledger_income_statement", { p_book: book.id, p_from: null, p_to: dayBefore(`${p.asOf.slice(0, 4)}-01-01`), p_season: null }),
      ]);
      return {
        kind: "balance",
        sheet: buildBalanceSheet(rows, buildIncomeStatement(income).netIncome, buildIncomeStatement(prior).netIncome),
        asOf: p.asOf,
      };
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
    case "journal":
      return opts.whole ? wholeJournal(supabase, book, p) : journalPage(supabase, book, p);
    case "chart":
      return { kind: "chart", accounts: await chart(supabase, book) };
    case "account": {
      const accounts = await chart(supabase, book);
      const account = accounts.find((a) => a.id === p.account);
      if (!account) return { kind: "chart", accounts };
      const args = { p_book: book.id, p_account: account.id, p_from: p.from, p_to: p.to };
      const rows = opts.whole ? await rpcAll<StatementLine>(supabase, "ledger_account_statement", args) : await rpc<StatementLine>(supabase, "ledger_account_statement", args);
      return { kind: "account", account, rows };
    }
  }
}

/** The most rows one request returns (the API's own limit); a full page means there may be more. */
const API_ROWS = 1000;
/** A file past this many entries is cut and says so: a shorter period exports the rest. */
export const EXPORT_MAX_ENTRIES = 20000;

/** A set-returning function read to its end, a page at a time. */
async function rpcAll<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += API_ROWS) {
    const { data, error } = await supabase.rpc(fn, args).range(from, from + API_ROWS - 1);
    if (error) throw new Error(`${fn}: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < API_ROWS) return out;
  }
}

type EntryRow = Omit<JournalEntryView, "lines">;
type LineRow = { entry_id: string; line_no: number; account_id: string; side: "D" | "C"; currency: string; amount_minor: number; base_minor: number };

function entriesQuery(supabase: SupabaseClient, book: BookRef, p: BookReportParams) {
  return supabase
    .from("journal_entries")
    .select("id, entry_no, entry_date, memo, reversal_of, fx_rate")
    .eq("book_id", book.id)
    .gte("entry_date", p.from)
    .lte("entry_date", p.to)
    .order("entry_date", { ascending: false })
    .order("entry_no", { ascending: false });
}

/** The lines of these entries, all of them: a few hundred entries at a time, each read to its end. */
async function linesOf(supabase: SupabaseClient, book: BookRef, ids: string[]): Promise<LineRow[]> {
  const out: LineRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let from = 0; ; from += API_ROWS) {
      const { data, error } = await supabase
        .from("journal_lines")
        .select("entry_id, line_no, account_id, side, currency, amount_minor, base_minor")
        .eq("book_id", book.id)
        .in("entry_id", chunk)
        .order("entry_id")
        .order("line_no")
        .range(from, from + API_ROWS - 1);
      if (error) throw new Error(`journal_lines: ${error.message}`);
      const page = (data ?? []) as LineRow[];
      out.push(...page);
      if (page.length < API_ROWS) break;
    }
  }
  return out;
}

async function journalView(supabase: SupabaseClient, book: BookRef, entries: EntryRow[]): Promise<JournalEntryView[]> {
  const lines = entries.length ? await linesOf(supabase, book, entries.map((e) => e.id)) : [];
  const byEntry = new Map<string, LineRow[]>();
  for (const l of lines) byEntry.set(l.entry_id, [...(byEntry.get(l.entry_id) ?? []), l]);
  const accounts = await chart(supabase, book);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return entries.map((e) => ({
    ...e,
    lines: (byEntry.get(e.id) ?? [])
      .sort((a, b) => a.line_no - b.line_no)
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
}

async function journalPage(supabase: SupabaseClient, book: BookRef, p: BookReportParams): Promise<ReportData> {
  const from = (p.page - 1) * PAGE_SIZE;
  // One more than a page, to know whether there is a next.
  const { data, error } = await entriesQuery(supabase, book, p).range(from, from + PAGE_SIZE);
  if (error) throw new Error(`journal_entries: ${error.message}`);
  const all = (data ?? []) as EntryRow[];
  return { kind: "journal", entries: await journalView(supabase, book, all.slice(0, PAGE_SIZE)), hasMore: all.length > PAGE_SIZE };
}

async function wholeJournal(supabase: SupabaseClient, book: BookRef, p: BookReportParams): Promise<ReportData> {
  const entries: EntryRow[] = [];
  let cut = false;
  for (let from = 0; ; from += API_ROWS) {
    const { data, error } = await entriesQuery(supabase, book, p).range(from, from + API_ROWS - 1);
    if (error) throw new Error(`journal_entries: ${error.message}`);
    const page = (data ?? []) as EntryRow[];
    entries.push(...page);
    if (page.length < API_ROWS) break;
    if (entries.length >= EXPORT_MAX_ENTRIES) {
      cut = true;
      break;
    }
  }
  const kept = entries.slice(0, EXPORT_MAX_ENTRIES);
  return { kind: "journal", entries: await journalView(supabase, book, kept), hasMore: cut || entries.length > kept.length };
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
