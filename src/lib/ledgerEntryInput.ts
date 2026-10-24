/**
 * ما يكتبه صاحب الموسم في نموذج القيد، قبل أن يصل إلى القاعدة (البند ١٨٧، المرحلة ٢ج).
 *
 * A cost or a sale may be typed in dollars or in pounds, paid from the cash box, the bank, a wallet
 * or on credit, and in pounds it carries the rate it was settled at. This turns the raw form text
 * into the columns `ledger_entries` takes, with the same refusals the database makes: a figure with
 * more decimals than the currency has is refused, never rounded; a rate outside 1…100,000,000 is a
 * typing mistake. The dollar value of a pound entry is NOT computed here — the database does it from
 * the same minor units and rate (`ledger_entries_prepare`), so the page and the ledger cannot differ.
 */

import {
  isCurrency,
  minorToDecimal,
  parseAmount,
  parseRate,
  formatRate,
  type CurrencyCode,
} from "./ledger/money";

export type PaidFrom = "cash" | "bank" | "wallet" | "credit";

export const PAID_FROM: readonly PaidFrom[] = ["cash", "bank", "wallet", "credit"];

export const isPaidFrom = (p: string): p is PaidFrom => (PAID_FROM as readonly string[]).includes(p);

export interface RawLedgerEntryInput {
  amount: string;
  currency: string;
  paid_from: string;
  fx_rate: string;
}

/** The money columns of the row, as text so no figure passes through a float. */
export interface LedgerEntryMoney {
  currency: CurrencyCode;
  amount: string;
  entered_amount: string | null;
  fx_rate: string | null;
  paid_from: PaidFrom;
}

export type LedgerEntryInputError = "currency" | "amount" | "rate" | "paid_from";

export type LedgerEntryInputResult =
  | { ok: true; money: LedgerEntryMoney }
  | { ok: false; error: LedgerEntryInputError };

export function parseLedgerEntryInput(raw: RawLedgerEntryInput): LedgerEntryInputResult {
  // An old form, or an entry kept on the phone before this form existed, sends no currency: dollars.
  const currency = raw.currency.trim() === "" ? "USD" : raw.currency.trim();
  if (!isCurrency(currency)) return { ok: false, error: "currency" };

  const paidFrom = raw.paid_from.trim() === "" ? "cash" : raw.paid_from.trim();
  if (!isPaidFrom(paidFrom)) return { ok: false, error: "paid_from" };

  const minor = parseAmount(raw.amount, currency);
  if (minor === null || minor <= BigInt(0)) return { ok: false, error: "amount" };
  const typed = minorToDecimal(minor, currency);

  if (currency === "USD") {
    return { ok: true, money: { currency, amount: typed, entered_amount: null, fx_rate: null, paid_from: paidFrom } };
  }

  // A pound entry: the figure is what was paid; the rate is optional (the database then takes the
  // latest published one, or refuses if there is none). A rate that is typed must be a sane one.
  let rate: string | null = null;
  if (raw.fx_rate.trim() !== "") {
    const micro = parseRate(raw.fx_rate);
    if (micro === null) return { ok: false, error: "rate" };
    rate = formatRate(micro);
  }
  // The row's `amount` is the dollar value; the database overwrites it from the pounds and the rate.
  return { ok: true, money: { currency, amount: "0", entered_amount: typed, fx_rate: rate, paid_from: paidFrom } };
}

/** The message shown for a refusal, in the reader's language. */
export function ledgerEntryInputMessage(error: LedgerEntryInputError, t: (ar: string, en: string) => string): string {
  switch (error) {
    case "currency":
      return t("عملة غير معروفة.", "Unknown currency.");
    case "paid_from":
      return t("جهة الدفع غير معروفة.", "Unknown way of paying.");
    case "amount":
      return t(
        "اكتب مبلغاً صحيحاً بأقصى كسرين عشريين.",
        "Enter a valid amount with at most two decimals.",
      );
    case "rate":
      return t(
        "سعر الصرف غير معقول — اكتب عدد الجنيهات للدولار الواحد.",
        "The exchange rate is not plausible — enter pounds per one dollar.",
      );
  }
}
