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

export const LINK_STATUS_LABEL: Record<LinkStatus, { ar: string; en: string }> = {
  pending: { ar: "ينتظر الردّ", en: "Waiting for a reply" },
  confirmed: { ar: "مؤكَّد ومقيَّد في الدفترين", en: "Confirmed and booked in both books" },
  rejected: { ar: "اعتُرض عليه", en: "Objected to" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

/** Which side pays from an account of its own: the proposer for these, the receiver for the next. */
export const proposerNeedsAccount = (k: LinkKind): boolean => k === "input_finance" || k === "payout" || k === "rent_payment";
export const counterNeedsAccount = (k: LinkKind): boolean => k === "payout" || k === "rent_payment";

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

/** What a season still owes the investor as financing: confirmed financing less the principal the shares settled, per currency. */
export function outstandingFinancing(rows: readonly LinkRow[], seasonId: string): Record<CurrencyCode, bigint> {
  const out: Record<CurrencyCode, bigint> = { USD: ZERO, SDG: ZERO };
  for (const r of rows) {
    if (r.status !== "confirmed" || r.season_id !== seasonId) continue;
    if (r.kind === "input_finance") out[r.currency] += BigInt(Math.round(r.amount_minor));
    if (r.kind === "harvest_share") out[r.currency] -= BigInt(Math.round(r.principal_minor));
  }
  if (out.USD < ZERO) out.USD = ZERO;
  if (out.SDG < ZERO) out.SDG = ZERO;
  return out;
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
  /** The yearly rate of the cash flows; null when there is none to compute. */
  xirr: number | null;
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
    if (r.status !== "confirmed") continue;
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
  return {
    invested,
    recognised,
    handedOver,
    due,
    rent,
    flows,
    moicCash: inv > 0 ? Number(handedOver) / 100 / inv : null,
    moicRecognised: inv > 0 ? Number(recognised) / 100 / inv : null,
    xirr: xirr(flows),
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
