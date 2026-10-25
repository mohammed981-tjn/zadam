/**
 * القيود المتقابلة بين الشريكين: ما يكتبه الطرف في نموذج الاقتراح، وكشف حساب المستثمر (البند ١٨٨ ج).
 *
 * The database decides (supabase/migrations/20261024160000_ledger_links.sql); this reads what a person typed,
 * with the same refusals the database makes, and arranges the confirmed links into the investor's statement:
 * what went in, what was recognised as his, what was handed over, and the return computed from the dates the
 * money really moved. Nothing here writes, and nothing promises a return.
 */

import { isIsoDate } from "./ledger/reportParams";
import { formatRate, parseAmount, parseRate, toBase, type CurrencyCode } from "./ledger/money";
import { xirr, type Flow } from "./investorReturns";

export const LINK_KINDS = ["input_finance", "harvest_share", "payout", "rent_payment"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_STATUSES = ["pending", "confirmed", "rejected", "cancelled"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const LINK_KIND_LABEL: Record<LinkKind, { ar: string; en: string }> = {
  input_finance: { ar: "تمويل مدخلات", en: "Input financing" },
  harvest_share: { ar: "نصيب من الحصاد", en: "Harvest share" },
  payout: { ar: "تسليم نصيب", en: "Payout of the share" },
  rent_payment: { ar: "أجرة أرض", en: "Land rent" },
};

export const REVERSAL_LABEL: Record<ReversalStatus, { ar: string; en: string }> = {
  pending: { ar: "طلب إلغاءٍ ينتظر الردّ", en: "Cancellation request waiting for a reply" },
  accepted: { ar: "أُلغي باتّفاقكما وعُكس في الدفترين", en: "Cancelled by your agreement and reversed in both books" },
  rejected: { ar: "رُفض طلب الإلغاء", en: "The cancellation request was refused" },
  withdrawn: { ar: "سُحب طلب الإلغاء", en: "The cancellation request was withdrawn" },
};

export const LINK_STATUS_LABEL: Record<LinkStatus, { ar: string; en: string }> = {
  pending: { ar: "ينتظر الردّ", en: "Waiting for a reply" },
  confirmed: { ar: "مؤكَّد ومقيَّد في الدفترين", en: "Confirmed and booked in both books" },
  rejected: { ar: "اعتُرض عليه", en: "Objected to" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

/** Which side pays from an account of its own: the proposer for these, the receiver for the next. */
export const proposerNeedsAccount = (k: LinkKind): boolean => k === "input_finance" || k === "payout" || k === "rent_payment";
export const counterNeedsAccount = (k: LinkKind): boolean => k === "payout" || k === "rent_payment";

export const REVERSAL_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;
export type ReversalStatus = (typeof REVERSAL_STATUSES)[number];

/** A row of ledger_link_reversals_list(): a request to cancel a confirmed entry by both partners' agreement. */
export interface ReversalRow {
  id: string;
  link_id: string;
  /** True when I asked for the cancellation. */
  mine: boolean;
  status: ReversalStatus;
  reason: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** A row of ledger_links_list(). Amounts are whole minor units, rates pounds per dollar. */
export interface LinkRow {
  id: string;
  kind: LinkKind;
  status: LinkStatus;
  mine: boolean;
  other_name: string;
  agreement_id: string;
  agreement_ref: string | null;
  season_id: string | null;
  amount_minor: number;
  principal_minor: number;
  currency: CurrencyCode;
  fx_rate: number | string | null;
  entry_date: string;
  memo: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  /** The cancellation request that matters for this entry, if any — see `attachReversals`. */
  reversal?: ReversalRow | null;
}

/**
 * A confirmed entry stays «confirmed» in the table for good; its cancellation by agreement is a row beside it. An
 * entry whose cancellation was accepted has been reversed in both books, so no statement may count it any more.
 */
export const isReversed = (r: Pick<LinkRow, "reversal">): boolean => r.reversal?.status === "accepted";

/** Confirmed and not cancelled since: what both books still carry. */
export const isLive = (r: Pick<LinkRow, "status" | "reversal">): boolean => r.status === "confirmed" && !isReversed(r);

/**
 * Hangs on each entry the request that matters: an accepted one, else a pending one, else the latest decided.
 * The database allows only one open (pending or accepted) request per entry, so the choice is never between two.
 */
export function attachReversals(links: readonly LinkRow[], reversals: readonly ReversalRow[]): LinkRow[] {
  const rank = (r: ReversalRow) => (r.status === "accepted" ? 3 : r.status === "pending" ? 2 : 1);
  const best = new Map<string, ReversalRow>();
  for (const r of reversals) {
    const cur = best.get(r.link_id);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && r.created_at > cur.created_at)) best.set(r.link_id, r);
  }
  return links.map((l) => ({ ...l, reversal: best.get(l.id) ?? null }));
}

/** What the reader may do with an entry: ask to cancel it, answer a request, or take back his own. */
export type ReversalAction = "request" | "answer" | "withdraw" | "none";
export function reversalAction(r: Pick<LinkRow, "status" | "reversal">): ReversalAction {
  if (r.status !== "confirmed") return "none";
  const v = r.reversal;
  if (!v || v.status === "rejected" || v.status === "withdrawn") return "request";
  if (v.status === "pending") return v.mine ? "withdraw" : "answer";
  return "none";
}

/** The reason typed with a cancellation request or its refusal: 3 to 300 characters once trimmed. */
export function parseReversalReason(raw: string): string | null {
  const t = raw.trim();
  return t.length >= 3 && t.length <= 300 ? t : null;
}

// ── الاقتراح ────────────────────────────────────────────────────────────────

export interface RawLinkProposal {
  kind: string;
  amount: string;
  currency: string;
  date: string;
  account: string;
  principal: string;
  season: string;
  rate: string;
  memo: string;
}

export interface LinkProposalArgs {
  kind: LinkKind;
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  account: "cash" | "bank" | "wallet" | null;
  principalMinor: number;
  season: string | null;
  rate: number | null;
  memo: string;
}

export type LinkProposalError = "kind" | "currency" | "amount" | "principal" | "date" | "account" | "season" | "rate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLinkProposal(raw: RawLinkProposal): { ok: true; args: LinkProposalArgs } | { ok: false; error: LinkProposalError } {
  if (!(LINK_KINDS as readonly string[]).includes(raw.kind)) return { ok: false, error: "kind" };
  const kind = raw.kind as LinkKind;
  const currency = raw.currency.trim() === "" ? "USD" : raw.currency.trim();
  if (currency !== "USD" && currency !== "SDG") return { ok: false, error: "currency" };

  const amount = parseAmount(raw.amount, currency);
  if (amount === null || amount <= BigInt(0)) return { ok: false, error: "amount" };

  let principal = BigInt(0);
  if (kind === "harvest_share" && raw.principal.trim() !== "") {
    const p = parseAmount(raw.principal, currency);
    if (p === null) return { ok: false, error: "principal" };
    principal = p;
  }

  if (!isIsoDate(raw.date)) return { ok: false, error: "date" };

  let account: LinkProposalArgs["account"] = null;
  if (proposerNeedsAccount(kind)) {
    if (raw.account !== "cash" && raw.account !== "bank" && raw.account !== "wallet") return { ok: false, error: "account" };
    account = raw.account;
  }

  const season = raw.season.trim() === "" ? null : raw.season.trim();
  if (season !== null && !UUID.test(season)) return { ok: false, error: "season" };
  if ((kind === "input_finance" || kind === "harvest_share") && season === null) return { ok: false, error: "season" };

  let rate: number | null = null;
  if (currency === "SDG" && raw.rate.trim() !== "") {
    const micro = parseRate(raw.rate);
    if (micro === null) return { ok: false, error: "rate" };
    rate = Number(formatRate(micro));
  }

  return {
    ok: true,
    args: {
      kind,
      amountMinor: Number(amount),
      currency,
      date: raw.date,
      account,
      principalMinor: Number(principal),
      season,
      rate,
      memo: raw.memo.trim().slice(0, 200),
    },
  };
}

export function linkProposalMessage(error: LinkProposalError, t: (ar: string, en: string) => string): string {
  switch (error) {
    case "kind":
      return t("نوع القيد غير معروف.", "Unknown kind of entry.");
    case "currency":
      return t("عملة غير معروفة.", "Unknown currency.");
    case "amount":
      return t("اكتب مبلغاً صحيحاً بأقصى كسرين عشريين.", "Enter a valid amount with at most two decimals.");
    case "principal":
      return t("ما يُطفئ من التمويل: اكتب رقماً صحيحاً أو اتركه فارغاً.", "The financing it settles: enter a valid number or leave it empty.");
    case "date":
      return t("اكتب تاريخاً صحيحاً.", "Enter a valid date.");
    case "account":
      return t("اختر النقد أو البنك أو المحفظة.", "Choose cash, bank or wallet.");
    case "season":
      return t("اختر الموسم.", "Choose the season.");
    case "rate":
      return t("سعر الصرف غير معقول — اكتب عدد الجنيهات للدولار الواحد.", "The exchange rate is not plausible — enter pounds per one dollar.");
  }
}

// ── كشف الحساب ──────────────────────────────────────────────────────────────

const ZERO = BigInt(0);

/** A confirmed link's amount in dollars' cents: its own figure, or the pounds at the rate it was booked at. */
export function linkUsd(row: Pick<LinkRow, "amount_minor" | "currency" | "fx_rate">, minor: number = row.amount_minor): bigint {
  if (row.currency === "USD") return BigInt(Math.round(minor));
  const micro = row.fx_rate === null ? null : parseRate(String(row.fx_rate));
  return micro === null ? ZERO : toBase(BigInt(Math.round(minor)), micro);
}

/**
 * What a season still owes the investor as financing, in dollars' cents: confirmed financing less the principal the
 * shares settled, each at the rate it was booked at. One figure, not one per currency: a share in dollars settles
 * financing given in pounds too (review 198 B9 — kept apart, pounds financed and settled by a dollar share still
 * showed as owed).
 */
export function outstandingFinancing(rows: readonly LinkRow[], seasonId: string): bigint {
  let out = ZERO;
  for (const r of rows) {
    if (!isLive(r) || r.season_id !== seasonId) continue;
    if (r.kind === "input_finance") out += linkUsd(r);
    if (r.kind === "harvest_share") out -= linkUsd(r, r.principal_minor);
  }
  return out < ZERO ? ZERO : out;
}

/**
 * The shortest stretch, first flow to last, a yearly rate is shown for. Over days or weeks a modest gain compounds
 * into an absurd yearly figure (2% in a day is 137,000% a year); the investment-performance standards (GIPS) do not
 * annualise a period under a year, and neither does this (review 198 B3).
 */
export const MIN_ANNUAL_DAYS = 365;

/**
 * The return line of the statement: a yearly rate when the money moved over a year or more, else the plain return
 * over the days it took, saying why no yearly rate is shown.
 */
export function returnSentence(
  st: Pick<InvestorStatement, "xirr" | "cashReturn" | "spanDays" | "settled">,
  t: (ar: string, en: string) => string,
): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const rest = st.settled ? "" : t(" (يرتفع حين يُسلَّم الباقي)", " (it rises as the rest is handed over)");
  if (st.xirr !== null) {
    return t(`العائد السنويّ على ما سُلّم فعلاً: ${pct(st.xirr)}${rest}.`, `Yearly return on what was actually paid: ${pct(st.xirr)}${rest}.`);
  }
  if (st.cashReturn === null) return "";
  const days = st.spanDays ?? 0;
  return t(
    `العائد على ما سُلّم فعلاً: ${pct(st.cashReturn)} خلال ${days} يوماً${rest}. لا يُحسب عائدٌ سنويّ لمدّةٍ أقلّ من سنة.`,
    `Return on what was actually paid: ${pct(st.cashReturn)} over ${days} days${rest}. No yearly rate is given for less than a year.`,
  );
}

export interface InvestorStatement {
  /** Financed inputs, in dollars' cents at the rates they were booked at. */
  invested: bigint;
  /** What the farmer recognised as the investor's share of the crop. */
  recognised: bigint;
  /** What was actually handed over. */
  handedOver: bigint;
  /** recognised − handedOver: the share recognised and not yet handed over. */
  due: bigint;
  /** Rent paid, for a lease. */
  rent: bigint;
  /** Money out and money in, on the dates it moved. */
  flows: Flow[];
  /** handed over ÷ invested; null when nothing was invested. */
  moicCash: number | null;
  /** recognised ÷ invested: the multiple the crop share stands for, collected or not. */
  moicRecognised: number | null;
  /** The yearly rate of the cash flows; null when there is none to compute, or the flows span less than MIN_ANNUAL_DAYS. */
  xirr: number | null;
  /** Days from the first flow to the last; null without flows. */
  spanDays: number | null;
  /** (money back − money in) ÷ money in over the whole span, not per year; null when nothing went in. */
  cashReturn: number | null;
  /** True when nothing recognised is still waiting to be handed over. */
  settled: boolean;
}

export function investorStatement(rows: readonly LinkRow[]): InvestorStatement {
  let invested = ZERO;
  let recognised = ZERO;
  let handedOver = ZERO;
  let rent = ZERO;
  const flows: Flow[] = [];
  for (const r of rows) {
    if (!isLive(r)) continue;
    const usd = linkUsd(r);
    const cents = Number(usd) / 100;
    if (r.kind === "input_finance") {
      invested += usd;
      flows.push({ date: r.entry_date, amount: -cents });
    } else if (r.kind === "harvest_share") {
      recognised += usd;
    } else if (r.kind === "payout") {
      handedOver += usd;
      flows.push({ date: r.entry_date, amount: cents });
    } else if (r.kind === "rent_payment") {
      rent += usd;
      flows.push({ date: r.entry_date, amount: -cents });
    }
  }
  const inv = Number(invested) / 100;
  const due = recognised - handedOver;
  const days = flows.map((f) => Date.parse(`${f.date}T00:00:00Z`) / 86_400_000).filter((d) => Number.isFinite(d));
  const spanDays = days.length ? Math.max(...days) - Math.min(...days) : null;
  const paidIn = flows.filter((f) => f.amount < 0).reduce((a, f) => a - f.amount, 0);
  const paidBack = flows.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0);
  return {
    invested,
    recognised,
    handedOver,
    due,
    rent,
    flows,
    moicCash: inv > 0 ? Number(handedOver) / 100 / inv : null,
    moicRecognised: inv > 0 ? Number(recognised) / 100 / inv : null,
    xirr: spanDays !== null && spanDays >= MIN_ANNUAL_DAYS ? xirr(flows) : null,
    spanDays,
    cashReturn: paidIn > 0 ? (paidBack - paidIn) / paidIn : null,
    settled: due <= ZERO,
  };
}


/**
 * Where a form of this feature may send the person back to: the books page (with a plain query) or one agreement.
 * Anything else — an address a form field was made to carry — becomes the proposals page.
 */
export function safeReturnTo(raw: string): string {
  const to = raw.trim();
  if (to === "/books" || /^\/books\?[A-Za-z0-9=&_.-]*$/.test(to)) return to;
  if (/^\/invest\/agreements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(to)) return to;
  return "/books?r=links";
}
