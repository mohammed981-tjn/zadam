/**
 * قراءة القوائم الماليّة من القاعدة (البند ٢٠٥). The page, the app's JSON and both PDF routes come through here, with
 * the reader's own session — the database's functions check that the reader may read the book (owner, the
 * administrators in the platform's book, an administrator while an inspection stands) and refuse anyone else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookRef } from "./load";
import { bookHeading } from "./reportParams";
import { periodOf, type StatementsParams } from "./statementsParams";
import {
  buildAgeing,
  buildBalanceCompare,
  buildBudget,
  buildCashCompare,
  buildEquity,
  buildIncomeCompare,
  buildNotes,
  fingerprintOf,
  fingerprintText,
  type AgeingDbRow,
  type BudgetDbRow,
  type CompareDbRow,
  type EquityDbRow,
  type Facts,
  type PeriodView,
  type StatementsBundle,
} from "./statements";

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

interface PeriodRow {
  cur_from: string;
  cur_to: string;
  prev_from: string | null;
  prev_to: string | null;
  cur_season: string | null;
  prev_season: string | null;
  cur_season_name: string | null;
  prev_season_name: string | null;
}

export interface SeasonOption {
  id: string;
  name: string;
  planting_date: string;
}

/** The seasons a farm book's statements may be taken over: its owner's, newest first. */
export async function seasonOptions(supabase: SupabaseClient, book: BookRef): Promise<SeasonOption[]> {
  if (book.kind !== "farm" || !book.owner_id) return [];
  const { data } = await supabase
    .from("seasons")
    .select("id, name, planting_date")
    .eq("owner_id", book.owner_id)
    .order("planting_date", { ascending: false })
    .limit(60);
  return (data ?? []) as SeasonOption[];
}

export async function loadStatements(
  supabase: SupabaseClient,
  book: BookRef,
  p: StatementsParams,
  today: string,
  me: string,
  now: Date = new Date(),
): Promise<StatementsBundle> {
  const own = periodOf(p, today);
  const [period] = await rpc<PeriodRow>(supabase, "ledger_compare_period", {
    p_book: book.id,
    p_basis: p.basis,
    p_from: p.basis === "season" ? null : own.from,
    p_to: p.basis === "season" ? null : own.to,
    p_season: p.basis === "season" ? p.season : null,
  });
  if (!period) throw new Error("ledger_compare_period: no row");

  const current: PeriodView = {
    from: period.cur_from,
    to: period.cur_to,
    season: period.cur_season ? { id: period.cur_season, name: period.cur_season_name ?? "" } : null,
  };
  const hasPrev = p.compare && period.prev_from !== null && period.prev_to !== null;
  const previous: PeriodView | null = hasPrev
    ? {
        from: period.prev_from as string,
        to: period.prev_to as string,
        season: period.prev_season ? { id: period.prev_season, name: period.prev_season_name ?? "" } : null,
      }
    : null;
  const bySeason = p.basis === "season";

  const [income, balance, cash, equity, ageing, budget, facts] = await Promise.all([
    rpc<CompareDbRow>(supabase, "ledger_income_compare", {
      p_book: book.id,
      // A season's income is the season's own lines, whatever their date; a month or a year is its days.
      p_from: bySeason ? null : current.from,
      p_to: bySeason ? null : current.to,
      p_prev_from: previous && !bySeason ? previous.from : null,
      p_prev_to: previous && !bySeason ? previous.to : null,
      p_season: bySeason ? current.season?.id : null,
      p_prev_season: bySeason && previous ? previous.season?.id : null,
    }),
    rpc<CompareDbRow>(supabase, "ledger_balance_compare", { p_book: book.id, p_as_of: current.to, p_prev_as_of: previous?.to ?? null }),
    rpc<CompareDbRow>(supabase, "ledger_cash_flow_compare", {
      p_book: book.id,
      p_from: current.from,
      p_to: current.to,
      p_prev_from: previous?.from ?? null,
      p_prev_to: previous?.to ?? null,
    }),
    rpc<EquityDbRow>(supabase, "ledger_equity_statement", { p_book: book.id, p_from: current.from, p_to: current.to }),
    rpc<AgeingDbRow>(supabase, "ledger_ageing", { p_book: book.id, p_as_of: current.to }),
    rpc<BudgetDbRow>(supabase, "ledger_budget_vs_actual", { p_book: book.id, p_season: bySeason ? current.season?.id : null }),
    supabase.rpc("ledger_statement_facts", { p_book: book.id, p_from: current.from, p_to: current.to }).then(({ data, error }) => {
      if (error) throw new Error(`ledger_statement_facts: ${error.message}`);
      return data as Facts;
    }),
  ]);

  // A month or a year shows the seasons that were growing in it, not every season the farm ever had.
  const seasons = bySeason ? null : await seasonOptions(supabase, book);
  const inPeriod = seasons ? new Set(seasons.filter((s) => s.planting_date <= current.to).map((s) => s.id)) : null;
  const budgetRows = inPeriod ? budget.filter((r) => inPeriod.has(r.season_id)) : budget;

  const balanceView = buildBalanceCompare(balance, hasPrev);
  const base = {
    book: {
      id: book.id,
      kind: book.kind,
      heading: bookHeading(book, me),
      ownerName: book.kind === "platform" ? null : facts.owner_name,
      closedThrough: book.closed_through,
    },
    basis: p.basis,
    current,
    previous,
    income: buildIncomeCompare(income, hasPrev),
    balance: balanceView,
    cash: buildCashCompare(cash, hasPrev),
    equity: buildEquity(equity, balanceView.totalEquity.current),
    ageing: { asOf: current.to, ...buildAgeing(ageing) },
    budget: buildBudget(budgetRows).filter((s) => s.budget !== BigInt(0) || s.actual !== BigInt(0)).slice(0, 6),
  };
  return {
    ...base,
    notes: buildNotes(base, facts),
    fingerprint: fingerprintOf(fingerprintText(base)),
    generatedAt: now.toISOString(),
  };
}
