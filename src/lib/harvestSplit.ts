/**
 * قسمة الحصاد بين الأطراف بحسب نموذج العقد (البند ١٨٨).
 *
 * Given what the crop sold for (or is valued at) and the documented costs each party paid, this works out
 * what each party receives, what it paid, and what it is left with, by the rules the agreement's own
 * text states (`agreements.ts`). It writes nothing and decides nothing: it is the arithmetic a landowner,
 * an investor and a managing company can check before the harvest, and the one the books post from after it.
 *
 * Every figure is a whole number of the dollar's cents, and a split never loses or invents a cent:
 * the parties' net results add up to the season's profit exactly (largest-remainder rounding).
 *
 * The rules, as the agreement says them:
 *  - sharecrop, finance, musaqah: the crop (fruit) is split by the stated proportions; each party keeps
 *    its own costs. No money moves between the parties other than the split itself.
 *  - lease: the whole crop is the investor's; the owner takes the rent, whatever the harvest was.
 *  - managed: the documented costs are repaid first, to whoever paid them (in proportion when the sale
 *    does not cover them); the net profit then goes first to the managing company's share, and the rest
 *    between owner and investor by their proportions. With no profit the company takes nothing.
 */

import { allocateBig } from "./ledger/money";
import type { InvestorModel } from "./investors";

export type Party = "owner" | "investor" | "manager";

export interface SplitTerms {
  owner_share?: number;
  investor_share?: number;
  manager_share?: number;
}

export interface SplitInput {
  model: InvestorModel;
  terms: SplitTerms;
  /** What the crop sold for, or its market value on harvest day — dollars' cents, not negative. */
  revenue: bigint;
  /** The documented costs each party paid, in dollars' cents, not negative. */
  costs: Record<Party, bigint>;
  /** Lease only: the rent for the term, in dollars' cents. */
  rent: bigint;
}

export interface PartyResult {
  /** What the party receives out of the harvest (or, for the owner of a lease, the rent). */
  received: bigint;
  /** What it paid itself: its documented costs, and for a lease's investor the rent. */
  paid: bigint;
  /** received − paid: what the party is left with. */
  net: bigint;
}

export type SplitNote =
  | "costs_repaid_first"
  | "loss_costs_pro_rata"
  | "no_manager_share"
  | "lease_rent_fixed"
  | "costs_stay_with_payer";

export type SplitError = "model" | "shares" | "manager_share" | "negative";

export type SplitResult =
  | {
      ok: true;
      parties: Partial<Record<Party, PartyResult>>;
      revenue: bigint;
      totalCosts: bigint;
      /** revenue − costs. The parties' nets add up to exactly this. */
      profit: bigint;
      notes: SplitNote[];
    }
  | { ok: false; error: SplitError };

const ZERO = BigInt(0);
const BP = 10_000; // a share of 100% in basis points

/** A percentage as basis points, exact to a hundredth of a percent. */
const bp = (pct: number): bigint => BigInt(Math.round(pct * 100));

const sum = (xs: readonly bigint[]): bigint => xs.reduce((a, b) => a + b, ZERO);

function result(received: bigint, paid: bigint): PartyResult {
  return { received, paid, net: received - paid };
}

export function splitHarvest(input: SplitInput): SplitResult {
  const { model, terms, revenue, costs, rent } = input;
  if (revenue < ZERO || rent < ZERO || costs.owner < ZERO || costs.investor < ZERO || costs.manager < ZERO) {
    return { ok: false, error: "negative" };
  }
  const totalCosts = costs.owner + costs.investor + costs.manager;
  const profit = revenue - totalCosts;
  const notes: SplitNote[] = [];

  if (model === "lease") {
    notes.push("lease_rent_fixed");
    return {
      ok: true,
      revenue,
      totalCosts,
      profit,
      notes,
      parties: {
        owner: result(rent, costs.owner),
        investor: result(revenue, costs.investor + rent),
      },
    };
  }

  if (model !== "sharecrop" && model !== "finance" && model !== "musaqah" && model !== "managed") {
    return { ok: false, error: "model" };
  }

  const os = terms.owner_share;
  const is = terms.investor_share;
  if (os === undefined || is === undefined || !Number.isFinite(os) || !Number.isFinite(is) || os < 1 || is < 1 || bp(os) + bp(is) !== BigInt(BP)) {
    return { ok: false, error: "shares" };
  }

  if (model !== "managed") {
    // The crop is split by the stated proportions; each keeps the costs it paid.
    notes.push("costs_stay_with_payer");
    const [toOwner, toInvestor] = allocateBig(revenue, [bp(os), bp(is)]);
    return {
      ok: true,
      revenue,
      totalCosts,
      profit,
      notes,
      parties: {
        owner: result(toOwner, costs.owner),
        investor: result(toInvestor, costs.investor),
      },
    };
  }

  const ms = terms.manager_share;
  if (ms === undefined || !Number.isFinite(ms) || ms < 1 || ms > 50) return { ok: false, error: "manager_share" };

  // Costs first, to whoever paid them.
  if (revenue >= totalCosts) {
    notes.push("costs_repaid_first");
    if (profit === ZERO) notes.push("no_manager_share");
    // The manager takes its share of the net profit; owner and investor divide what is left.
    const m = bp(ms);
    const rest = BigInt(BP) - m;
    const [mgr, own, inv] = allocateBig(profit, [m * BigInt(BP), rest * bp(os), rest * bp(is)]);
    return {
      ok: true,
      revenue,
      totalCosts,
      profit,
      notes,
      parties: {
        owner: result(costs.owner + own, costs.owner),
        investor: result(costs.investor + inv, costs.investor),
        manager: result(costs.manager + mgr, costs.manager),
      },
    };
  }

  // The sale does not cover the costs: it is shared among those who paid them, in proportion, and nobody
  // takes a profit share — the loss falls on whoever paid, which is what the loss rule of the agreement says.
  notes.push("costs_repaid_first", "loss_costs_pro_rata", "no_manager_share");
  const [ro, ri, rm] = allocateBig(revenue, [costs.owner, costs.investor, costs.manager]);
  return {
    ok: true,
    revenue,
    totalCosts,
    profit,
    notes,
    parties: {
      owner: result(ro, costs.owner),
      investor: result(ri, costs.investor),
      manager: result(rm, costs.manager),
    },
  };
}

/** The parties a model has: the managing company only in a three-party agreement. */
export const partiesOf = (model: InvestorModel): Party[] => (model === "managed" ? ["owner", "investor", "manager"] : ["owner", "investor"]);

/** The sum of the parties' nets — it must equal the profit; a page can show that it does. */
export const netsAddUp = (r: Extract<SplitResult, { ok: true }>): boolean => sum(Object.values(r.parties).map((p) => p.net)) === r.profit;
