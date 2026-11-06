/**
 * القيد اليدويّ (البند ٢٠٥): ما يكتبه صاحب الدفتر أو مُعِدّه، سطوراً مدينة ودائنة من شجرة حسابات الدفتر.
 *
 * Pure, no database. The form (website and app) reads what was typed through here, so both refuse the same mistakes in
 * the same words before anything is sent: an account that takes no entries, an amount that is not money, fewer than
 * two lines, debits that do not equal credits. The database checks it all again with the posting function itself
 * (supabase/migrations/20261106070000_ledger_manual_review.sql) — a sum here is a convenience, never the guard.
 *
 * A ready entry (`ledger_entry_templates`) only fills the lines: the account of each, its side, and which accounts the
 * person may pick instead. The one amount typed goes on every line.
 */

import { formatMoney, isCurrency, normaliseNumber, parseAmount, parseRate, toWire, type CurrencyCode } from "./money";

export type Side = "D" | "C";

export interface ChartAccount {
  code: string;
  parent_code: string | null;
  name_ar: string;
  name_en: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  postable: boolean;
  active: boolean;
  system_key: string | null;
  currency: string | null;
  provider: string | null;
}

export type Choose = "money" | "expense" | "revenue" | "inventory" | "expense_or_inventory";

export interface TemplateLine {
  side: Side;
  key: string;
  choose?: Choose;
}

export interface EntryTemplate {
  key: string;
  book_kinds: string[];
  grp: "daily" | "adjusting";
  name_ar: string;
  name_en: string;
  hint_ar: string;
  hint_en: string;
  lines: TemplateLine[];
  sort: number;
}

/** A line as typed: the account's code, its side, and the amount in the entry's currency. */
export interface LineInput {
  account: string;
  side: Side;
  amount: string;
}

export interface EntryInput {
  date: string;
  memo: string;
  currency: string;
  /** Pounds per dollar, typed; empty for the published rate (or for a dollar entry). */
  rate: string;
  lines: LineInput[];
}

/** What the database's `ledger_entry_submit` takes for `p_lines`. */
export interface WireLine {
  account: string;
  side: Side;
  currency: CurrencyCode;
  minor: number;
}

export type EntryError =
  | { code: "date" }
  | { code: "memo" }
  | { code: "currency" }
  | { code: "rate" }
  | { code: "lines" }
  | { code: "account"; line: number }
  | { code: "amount"; line: number }
  | { code: "side"; line: number }
  | { code: "unbalanced"; debit: bigint; credit: bigint };

export type ParsedEntry =
  | { ok: true; date: string; memo: string; currency: CurrencyCode; rate: string | null; lines: WireLine[]; debit: bigint; credit: bigint }
  | { ok: false; error: EntryError };

export const MAX_LINES = 200;
const ZERO = BigInt(0);

const CASH_KEYS = new Set(["cash_on_hand", "bank", "wallet"]);

/** The accounts an entry may be written on: postable and not stopped, the platform's statistical 9xxx left out. */
export function postableAccounts(chart: readonly ChartAccount[]): ChartAccount[] {
  return chart.filter((a) => a.postable && a.active && !a.code.startsWith("9"));
}

/** A cash account: cash on hand, the bank, a wallet, or one the owner added with a provider. */
export const isMoneyAccount = (a: ChartAccount): boolean =>
  a.type === "asset" && ((a.system_key !== null && CASH_KEYS.has(a.system_key)) || a.provider !== null);

/** Stock: the accounts under 13 (inputs, fuel, harvested crop). */
export const isInventoryAccount = (a: ChartAccount): boolean => a.type === "asset" && a.code.startsWith("13");

/** The accounts a template line lets the person pick instead of its own. */
export function choicesFor(chart: readonly ChartAccount[], choose: Choose | undefined): ChartAccount[] {
  const usable = postableAccounts(chart);
  switch (choose) {
    case "money":
      return usable.filter(isMoneyAccount);
    case "expense":
      return usable.filter((a) => a.type === "expense");
    case "revenue":
      return usable.filter((a) => a.type === "revenue");
    case "inventory":
      return usable.filter(isInventoryAccount);
    case "expense_or_inventory":
      return usable.filter((a) => a.type === "expense" || isInventoryAccount(a));
    default:
      return [];
  }
}

/** The templates that fit a book's kind, in their order. */
export const templatesFor = (templates: readonly EntryTemplate[], kind: string): EntryTemplate[] =>
  templates.filter((t) => t.book_kinds.includes(kind)).sort((a, b) => a.sort - b.sort);

/**
 * The lines a template fills: each system key turned into the book's own account code, the amount on every line. Null
 * when the book lacks one of the accounts (a custom account took its number before the template was added).
 */
export function fillTemplate(template: EntryTemplate, chart: readonly ChartAccount[], amount = ""): LineInput[] | null {
  const out: LineInput[] = [];
  for (const l of template.lines) {
    const a = chart.find((c) => c.system_key === l.key && c.postable && c.active);
    if (!a) return null;
    out.push({ account: a.code, side: l.side, amount });
  }
  return out;
}

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/**
 * Reads the form. Every line is in the entry's one currency (the engine allows one besides the dollar per entry, and
 * the form keeps it simple: one for all). With pounds, the debits and credits must agree in pounds; the database turns
 * each into dollars and puts a cent or two of rounding where it falls.
 */
export function parseEntry(input: EntryInput, chart: readonly ChartAccount[]): ParsedEntry {
  const date = input.date.trim();
  if (!isIsoDate(date)) return { ok: false, error: { code: "date" } };
  const memo = input.memo.trim();
  if (memo.length < 1 || memo.length > 500) return { ok: false, error: { code: "memo" } };
  const currency = input.currency.trim().toUpperCase();
  if (!isCurrency(currency)) return { ok: false, error: { code: "currency" } };
  let rate: string | null = null;
  const rawRate = normaliseNumber(input.rate ?? "");
  if (currency !== "USD" && rawRate !== "") {
    if (parseRate(rawRate) === null) return { ok: false, error: { code: "rate" } };
    rate = rawRate.replace(/,/g, "");
  }

  const typed = input.lines.filter((l) => l.account.trim() !== "" || l.amount.trim() !== "");
  if (typed.length < 2 || typed.length > MAX_LINES) return { ok: false, error: { code: "lines" } };
  const usable = new Map(postableAccounts(chart).map((a) => [a.code, a]));
  const lines: WireLine[] = [];
  let debit = ZERO;
  let credit = ZERO;
  for (let i = 0; i < typed.length; i++) {
    const l = typed[i];
    const acc = usable.get(l.account.trim());
    if (!acc) return { ok: false, error: { code: "account", line: i + 1 } };
    if (acc.currency !== null && acc.currency !== currency) return { ok: false, error: { code: "account", line: i + 1 } };
    if (l.side !== "D" && l.side !== "C") return { ok: false, error: { code: "side", line: i + 1 } };
    const minor = parseAmount(l.amount, currency);
    if (minor === null || minor <= ZERO) return { ok: false, error: { code: "amount", line: i + 1 } };
    if (l.side === "D") debit += minor;
    else credit += minor;
    lines.push({ account: acc.code, side: l.side, currency, minor: toWire(minor) });
  }
  if (debit !== credit) return { ok: false, error: { code: "unbalanced", debit, credit } };
  return { ok: true, date, memo, currency, rate, lines, debit, credit };
}

/** The sentence for a refusal of the form, in the reader's language. */
export function entryErrorMessage(e: EntryError, t: (ar: string, en: string) => string, fmt: (minor: bigint) => string = String): string {
  switch (e.code) {
    case "date":
      return t("اكتب تاريخ القيد.", "Enter the entry's date.");
    case "memo":
      return t("اكتب بيان القيد (حتى ٥٠٠ حرف).", "Write the entry's description (up to 500 characters).");
    case "currency":
      return t("العملة دولار أو جنيه.", "The currency is dollars or pounds.");
    case "rate":
      return t("سعر الصرف غير مقروء: اكتبه جنيهاً لكلّ دولار، أو اتركه للسعر المنشور.", "The exchange rate cannot be read: write it in pounds per dollar, or leave it for the published rate.");
    case "lines":
      return t("القيد من سطرين إلى مئتي سطر.", "An entry has from two to two hundred lines.");
    case "account":
      return t(`اختر حساباً يُقيَّد عليه في السطر ${e.line}.`, `Choose an account that takes entries on line ${e.line}.`);
    case "amount":
      return t(`اكتب مبلغاً صحيحاً في السطر ${e.line}.`, `Enter a valid amount on line ${e.line}.`);
    case "side":
      return t(`اختر مدين أو دائن في السطر ${e.line}.`, `Choose debit or credit on line ${e.line}.`);
    case "unbalanced":
      return t(
        `القيد غير متوازن: المدين ${fmt(e.debit)} والدائن ${fmt(e.credit)}.`,
        `The entry does not balance: debit ${fmt(e.debit)} and credit ${fmt(e.credit)}.`,
      );
  }
}

/** Debits and credits of what is typed so far, for the running total under the lines; unreadable amounts count nothing. */
export function runningTotals(lines: readonly LineInput[], currency: string): { debit: bigint; credit: bigint } {
  const cur: CurrencyCode = isCurrency(currency.toUpperCase()) ? (currency.toUpperCase() as CurrencyCode) : "USD";
  let debit = ZERO;
  let credit = ZERO;
  for (const l of lines) {
    const m = parseAmount(l.amount, cur);
    if (m === null) continue;
    if (l.side === "D") debit += m;
    else credit += m;
  }
  return { debit, credit };
}

/** The account's name in the reader's language, the Arabic when it has no English. */
export const accountName = (a: Pick<ChartAccount, "name_ar" | "name_en">, locale: string): string =>
  locale === "en" && a.name_en ? a.name_en : a.name_ar;

// ── سجلّ التدقيق والاستثناءات: أسماء ما فيهما ────────────────────────────────

export const AUDIT_ACTIONS: Record<string, { ar: string; en: string }> = {
  entry_posted: { ar: "رُحِّل قيد", en: "Entry posted" },
  entry_reversed: { ar: "عُكس قيد", en: "Entry reversed" },
  lines_posted: { ar: "سطور القيد", en: "Entry lines" },
  draft_submitted: { ar: "أُعِدّ قيدٌ للمراجعة", en: "Entry prepared for review" },
  draft_approved: { ar: "اعتُمد قيدٌ مُعَدّ", en: "Prepared entry approved" },
  draft_rejected: { ar: "رُدّ قيدٌ مُعَدّ", en: "Prepared entry turned back" },
  draft_withdrawn: { ar: "سُحب قيدٌ مُعَدّ", en: "Prepared entry withdrawn" },
  period_closed: { ar: "أُقفلت الفترة", en: "Period closed" },
  period_reopened: { ar: "أُعيد فتح الفترة", en: "Period reopened" },
  closing_posted: { ar: "قيد إقفال", en: "Closing entry" },
  preparer_invited: { ar: "دُعي مُعِدّ", en: "Preparer invited" },
  preparer_added: { ar: "أُضيف مُعِدّ", en: "Preparer added" },
  preparer_accepted: { ar: "قبل المُعِدّ", en: "Preparer accepted" },
  preparer_declined: { ar: "اعتذر المدعوّ", en: "Invitation declined" },
  preparer_ended: { ar: "انتهى إذن مُعِدّ", en: "Preparer's permission ended" },
  review_setting: { ar: "تغيّر إعداد المراجعة", en: "Review setting changed" },
};

export const VIA: Record<string, { ar: string; en: string }> = {
  web: { ar: "الموقع", en: "Website" },
  app: { ar: "التطبيق", en: "App" },
  agent: { ar: "الوكيل", en: "Agent" },
  system: { ar: "النظام", en: "System" },
};

export const EXCEPTION_KINDS: Record<string, { ar: string; en: string; hint_ar: string; hint_en: string }> = {
  no_document: {
    ar: "قيدٌ بلا مستند",
    en: "Entry without a document",
    hint_ar: "قيدٌ يدويّ لم يُرفق به إيصالٌ ولا فاتورة.",
    hint_en: "A manual entry with no receipt or invoice attached.",
  },
  large_amount: {
    ar: "مبلغٌ كبيرٌ على غير العادة",
    en: "Unusually large amount",
    hint_ar: "أكبر من ثلاثة أمثال ما جرت عليه سطور الحساب نفسه في التسعين يوماً قبله.",
    hint_en: "More than three times what the same account's lines usually were in the 90 days before.",
  },
  back_dated: {
    ar: "قيدٌ بتاريخٍ قديم",
    en: "Back-dated entry",
    hint_ar: "كُتب بعد تاريخه بأيّامٍ كثيرة.",
    hint_en: "Written many days after its own date.",
  },
  duplicate: {
    ar: "قيدٌ مكرَّر؟",
    en: "Possible duplicate",
    hint_ar: "الحساب والجانب والمبلغ نفسها في قيدٍ آخر بفرق يومٍ أو أقلّ.",
    hint_en: "The same account, side and amount in another entry a day or less apart.",
  },
  negative_cash: {
    ar: "نقدٌ أو بنكٌ بالسالب",
    en: "Negative cash or bank",
    hint_ar: "صُرف منه أكثر ممّا فيه: قيدٌ ناقص أو في غير مكانه.",
    hint_en: "More was paid out than it held: an entry is missing or misplaced.",
  },
  stale_draft: {
    ar: "قيدٌ مُعَدّ ينتظر",
    en: "Prepared entry waiting",
    hint_ar: "ينتظر الاعتماد أو الردّ منذ أيّام.",
    hint_en: "Waiting for approval or return for days.",
  },
};

/** What the row says in a line: the entry, the date and the amount, the status before and after, the reason. */
export function auditSummary(
  r: { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null },
  t: (ar: string, en: string) => string,
): string {
  const a = (r.after ?? {}) as Record<string, unknown>;
  const b = (r.before ?? {}) as Record<string, unknown>;
  const usd = (n: unknown) => (typeof n === "number" ? formatMoney(BigInt(n), "USD") : "");
  switch (r.action) {
    case "entry_posted":
    case "entry_reversed":
      return [`#${a.entry_no ?? ""}`, a.entry_date, a.memo].filter(Boolean).join(" · ");
    case "lines_posted":
      return `${t("مدين", "Debit")} ${usd(a.debit)} · ${t("دائن", "Credit")} ${usd(a.credit)} · ${
        Array.isArray(a.lines) ? (a.lines as { account: string; side: string }[]).map((l) => `${l.side === "D" ? "+" : "−"}${l.account}`).join(" ") : ""
      }`;
    case "draft_submitted":
      return [a.entry_date, a.memo, usd(a.debit_minor), a.document ? t("بمستند", "with a document") : t("بلا مستند", "no document")].filter(Boolean).join(" · ");
    case "draft_approved":
    case "draft_rejected":
    case "draft_withdrawn":
      return [`${b.status ?? ""} → ${a.status ?? ""}`, a.note ? `${t("السبب", "reason")}: ${a.note}` : ""].filter(Boolean).join(" · ");
    case "period_closed":
    case "period_reopened":
      return [
        `${b.closed_through ?? t("غير مقفل", "open")} → ${a.closed_through ?? t("غير مقفل", "open")}`,
        a.reason ? `${t("السبب", "reason")}: ${a.reason}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "closing_posted":
      return [a.scope === "season" ? t("موسم", "season") : t("فترة", "period"), a.period_from, a.period_to].filter(Boolean).join(" · ");
    case "review_setting":
      return a.always_review ? t("يُراجع كلّ قيد", "every entry reviewed") : t("قيود صاحب الدفتر تُرحَّل في الحال", "the owner's entries post at once");
    default:
      return [a.role, a.status, a.contact_tail ? `…${a.contact_tail}` : ""].filter(Boolean).join(" · ");
  }
}

