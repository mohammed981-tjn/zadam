/**
 * الدفتر العامّ للمنصّة والمحافظ (البند ١٨٩): ما تحتاجه الصفحات من حسابٍ بسيط قبل أن تذهب إلى القاعدة وبعد أن تعود.
 *
 *  - رسم المنصّة: نموذج المدير يُقرأ هنا (المبلغ بالوحدة الصغرى، والسعر بستّ خانات) قبل `ledger_fee_propose`.
 *  - مزوّد الحساب النقديّ: قائمة المزوّدين الذين يسمّي بهم صاحب الدفتر حساباته النقديّة.
 *  - المطابقة: خلاصة ما أعادته `ledger_reconciliation`، وأيّ قيود الدفتر يصلح أن يُطابَق بها سطرٌ من الكشف يدويّاً.
 */

import { formatRate, isCurrency, parseAmount, parseRate, type CurrencyCode } from "./money";
import { isIsoDate } from "./reportParams";
import type { Locale } from "../i18n";

export const FEE_KINDS = ["inspection", "agreement", "service"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const FEE_LABEL: Record<FeeKind, { ar: string; en: string }> = {
  inspection: { ar: "رسم معاينة", en: "Inspection fee" },
  agreement: { ar: "رسم توثيق عقد", en: "Agreement documentation fee" },
  service: { ar: "رسم خدمة", en: "Service fee" },
};

export const FEE_STATUS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "ينتظر تأكيد الدافع", en: "Waiting for the payer" },
  confirmed: { ar: "مؤكَّد ومُقيَّد في الدفترين", en: "Confirmed and booked in both books" },
  rejected: { ar: "اعترض عليه الدافع", en: "Disputed by the payer" },
  cancelled: { ar: "ألغته الإدارة", en: "Cancelled by the administrators" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeeFormError = "payer" | "payer_kind" | "kind" | "currency" | "amount" | "date" | "rate";

export interface FeeArgs {
  payer: string;
  payerKind: "farm" | "investor";
  kind: FeeKind;
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  /** Pounds per dollar as typed, or null to take the published rate when the payer confirms. */
  rate: number | null;
  memo: string;
}

export function parseFeeForm(
  f: { payer: string; payerKind: string; kind: string; amount: string; currency: string; date: string; rate: string; memo: string },
  today: string,
): { ok: true; args: FeeArgs } | { ok: false; error: FeeFormError } {
  if (!UUID.test(f.payer)) return { ok: false, error: "payer" };
  if (f.payerKind !== "farm" && f.payerKind !== "investor") return { ok: false, error: "payer_kind" };
  if (!(FEE_KINDS as readonly string[]).includes(f.kind)) return { ok: false, error: "kind" };
  if (!isCurrency(f.currency)) return { ok: false, error: "currency" };
  const minor = parseAmount(f.amount, f.currency);
  if (minor === null || minor < BigInt(1)) return { ok: false, error: "amount" };
  if (!isIsoDate(f.date) || f.date > today) return { ok: false, error: "date" };
  let rate: number | null = null;
  if (f.currency === "SDG" && f.rate.trim() !== "") {
    const micro = parseRate(f.rate);
    if (micro === null) return { ok: false, error: "rate" };
    rate = Number(formatRate(micro));
  }
  return {
    ok: true,
    args: {
      payer: f.payer.toLowerCase(),
      payerKind: f.payerKind,
      kind: f.kind as FeeKind,
      amountMinor: Number(minor),
      currency: f.currency,
      date: f.date,
      rate,
      memo: f.memo.trim().slice(0, 200),
    },
  };
}

export function feeFormMessage(e: FeeFormError, locale: Locale = "ar"): string {
  if (locale === "en") {
    switch (e) {
      case "payer":
        return "Choose the payer from the search results.";
      case "payer_kind":
        return "Choose the payer's book: the farm or the investor.";
      case "kind":
        return "Choose the fee type.";
      case "currency":
        return "Choose the currency.";
      case "amount":
        return "Enter the amount as a positive number (at most two decimal places).";
      case "date":
        return "Enter the payment day (not a future day).";
      case "rate":
        return "The exchange rate is a number between 1 and 100,000,000 (at most six decimal places), or leave it blank.";
    }
  }
  switch (e) {
    case "payer":
      return "اختر الدافع من نتائج البحث.";
    case "payer_kind":
      return "اختر دفتر الدافع: المزرعة أو المستثمر.";
    case "kind":
      return "اختر نوع الرسم.";
    case "currency":
      return "اختر العملة.";
    case "amount":
      return "اكتب المبلغ رقماً موجباً (بخانتين بعد الفاصلة على الأكثر).";
    case "date":
      return "اكتب يوم الدفع (لا يومٌ قادم).";
    case "rate":
      return "سعر الصرف رقمٌ بين ١ و١٠٠٬٠٠٠٬٠٠٠ (بستّ خانات بعد الفاصلة على الأكثر)، أو اتركه فارغاً.";
  }
}

// ── الحسابات النقديّة ────────────────────────────────────────────────────────

/** The providers a cash account may name (the user's own account with them; the platform holds no money). */
export const PROVIDERS: { key: string; ar: string; en: string }[] = [
  { key: "bankak", ar: "بنكك (بنك الخرطوم)", en: "Bankak (Bank of Khartoum)" },
  { key: "mtn_momo", ar: "MTN موبايل موني", en: "MTN Mobile Money" },
  { key: "zain_bede", ar: "زين بيدي", en: "Zain Bede" },
  { key: "sudani_sah", ar: "سوداني ساه", en: "Sudani Sah" },
  { key: "cashi", ar: "كاشي", en: "Cashi" },
  { key: "sudanpay", ar: "SudanPay", en: "SudanPay" },
  { key: "bank", ar: "حساب مصرفيّ آخر", en: "Another bank account" },
  { key: "wallet", ar: "محفظة أخرى", en: "Another wallet" },
  { key: "cash", ar: "نقد", en: "Cash" },
];

export const providerLabel = (key: string | null, locale: "ar" | "en") => {
  const p = PROVIDERS.find((x) => x.key === key);
  return p ? (locale === "en" ? p.en : p.ar) : "";
};

// ── المطابقة ────────────────────────────────────────────────────────────────

export interface ReconRow {
  status: "matched" | "statement_only" | "book_only";
  statement_line: string | null;
  journal_line: string | null;
  txn_date: string;
  amount_minor: number;
  currency: string;
  description: string;
  reference: string;
  entry_no: number | null;
  entry_date: string | null;
  memo: string | null;
  match_kind: "auto" | "manual" | null;
}

export interface ReconSummary {
  matched: number;
  statementOnly: number;
  bookOnly: number;
  /** Per currency, in minor units: what the statement says moved, and what the book says moved. */
  totals: Record<string, { statement: bigint; book: bigint }>;
}

export function summarise(rows: ReconRow[]): ReconSummary {
  const totals: ReconSummary["totals"] = {};
  const t = (c: string) => (totals[c] ??= { statement: BigInt(0), book: BigInt(0) });
  let matched = 0;
  let statementOnly = 0;
  let bookOnly = 0;
  for (const r of rows) {
    const amount = BigInt(r.amount_minor);
    if (r.status === "matched") {
      matched++;
      t(r.currency).statement += amount;
      t(r.currency).book += amount;
    } else if (r.status === "statement_only") {
      statementOnly++;
      t(r.currency).statement += amount;
    } else {
      bookOnly++;
      t(r.currency).book += amount;
    }
  }
  return { matched, statementOnly, bookOnly, totals };
}

/** The book lines a statement line may be matched with by hand: the same currency and signed amount, nearest day first. */
export function candidatesFor(line: ReconRow, rows: ReconRow[]): ReconRow[] {
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
  return rows
    .filter((r) => r.status === "book_only" && r.currency === line.currency && r.amount_minor === line.amount_minor && r.journal_line)
    .sort((a, b) => Math.abs(day(a.txn_date) - day(line.txn_date)) - Math.abs(day(b.txn_date) - day(line.txn_date)) || (a.entry_no ?? 0) - (b.entry_no ?? 0));
}
