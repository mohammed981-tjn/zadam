/**
 * القوائم الماليّة الكاملة (البند ٢٠٥): المقارنة بالفترة السابقة، وأعمار الذمم، والميزانيّة مقابل الفعليّ، وقائمة التغيّر في
 * حقوق الملكيّة، والإيضاحات، وبصمة الأرقام.
 *
 * Pure: the database sums (20261106080000_ledger_statements_plus.sql), this arranges what came back into the shape
 * the page, the app and the PDF all show — so the three cannot disagree. Money stays a whole number of cents in a
 * bigint until it crosses into JSON (`bundleToWire`).
 *
 * The fingerprint is a SHA-256 of the figures and nothing else — not the time it was made, not who made it, not
 * the language — written in a fixed order. Two bundles of the same book and period with the same figures carry the
 * same fingerprint; change one cent anywhere and it changes. The PDF prints it on every page and the statements page
 * shows it, so a reader holding the paper opens the page for the same period and compares.
 */

import { createHash } from "node:crypto";
import { STAGE_TEMPLATES, type StageKey } from "../season";
import { STAGE_EN } from "../enNames";
import { formatMoney } from "./money";
import type { Basis } from "./statementsParams";

const ZERO = BigInt(0);
const big = (n: number | string | null | undefined): bigint => BigInt(Math.round(Number(n ?? 0)));
const bigOrNull = (n: number | string | null | undefined): bigint | null => (n === null || n === undefined ? null : big(n));

export interface Text {
  ar: string;
  en: string;
}

/** A figure in two columns: this period and the one it is compared with (null when there is none). */
export interface Pair {
  current: bigint;
  previous: bigint | null;
  change: bigint | null;
  /** Change as a percentage of the previous figure's size, one decimal; null when the previous was nothing. */
  pct: number | null;
}

export function pair(current: bigint, previous: bigint | null): Pair {
  if (previous === null) return { current, previous: null, change: null, pct: null };
  const change = current - previous;
  const abs = previous < ZERO ? -previous : previous;
  // One decimal, rounded half away from zero as the database's round() does, computed on integers.
  const pct = previous === ZERO ? null : roundTenths(change * BigInt(1000), abs);
  return { current, previous, change, pct };
}

function roundTenths(num: bigint, den: bigint): number {
  const neg = num < ZERO;
  const n = neg ? -num : num;
  const q = (n * BigInt(10)) / den; // hundredths of a percent ×10 → tenths after rounding
  const tenths = (q + BigInt(5)) / BigInt(10);
  return (neg ? -1 : 1) * Number(tenths) / 10;
}

const sumPairs = (rows: readonly { v: Pair }[], hasPrev: boolean): Pair =>
  pair(
    rows.reduce((a, r) => a + r.v.current, ZERO),
    hasPrev ? rows.reduce((a, r) => a + (r.v.previous ?? ZERO), ZERO) : null,
  );

// ── What the database returns ────────────────────────────────────────────────

export interface CompareDbRow {
  code: string;
  name_ar: string;
  name_en: string;
  type?: string;
  section?: string;
  system_key?: string | null;
  current_minor: number;
  previous_minor: number | null;
}

export interface EquityDbRow {
  ord: number;
  line: string;
  name_ar: string;
  name_en: string;
  amount: number;
}

export interface AgeingDbRow {
  side: "receivable" | "payable";
  code: string;
  name_ar: string;
  name_en: string;
  bucket: Bucket;
  items: number;
  amount_minor: number;
}

export interface BudgetDbRow {
  season_id: string;
  season_name: string;
  stage_id: string | null;
  stage_key: string | null;
  stage_order: number;
  budget_minor: number;
  actual_minor: number;
}

export interface Facts {
  kind: "farm" | "investor" | "platform";
  owner_name: string | null;
  closed_through: string | null;
  entries: number;
  reversals: number;
  manual: number;
  first_entry: string | null;
  currencies: { currency: string; lines: number; native_minor: number | null; base_minor: number | null }[];
  fx: { entries: number; min_rate: number | null; max_rate: number | null; parallel: number; bank: number; user: number };
  fx_result: number;
  fixed_assets: { count: number; cost_minor: number; salvage_minor: number; min_life: number | null; max_life: number | null };
  depreciation_minor: number;
  growing_crops_minor: number;
  open_credit_rows: number;
}

// ── The statements ───────────────────────────────────────────────────────────

export interface Line {
  code: string;
  name: Text;
  v: Pair;
}

const line = (r: CompareDbRow, hasPrev: boolean): Line => ({
  code: r.code,
  name: { ar: r.name_ar, en: r.name_en || r.name_ar },
  v: pair(big(r.current_minor), hasPrev ? big(r.previous_minor ?? 0) : null),
});

export interface IncomeCompare {
  revenue: Line[];
  expense: Line[];
  totalRevenue: Pair;
  totalExpense: Pair;
  net: Pair;
}

export function buildIncomeCompare(rows: readonly CompareDbRow[], hasPrev: boolean): IncomeCompare {
  const revenue = rows.filter((r) => r.type === "revenue").map((r) => line(r, hasPrev));
  const expense = rows.filter((r) => r.type === "expense").map((r) => line(r, hasPrev));
  const totalRevenue = sumPairs(revenue, hasPrev);
  const totalExpense = sumPairs(expense, hasPrev);
  const net = pair(
    totalRevenue.current - totalExpense.current,
    hasPrev ? (totalRevenue.previous ?? ZERO) - (totalExpense.previous ?? ZERO) : null,
  );
  return { revenue, expense, totalRevenue, totalExpense, net };
}

export interface BalanceCompare {
  assets: Line[];
  liabilities: Line[];
  equity: Line[];
  totalAssets: Pair;
  totalLiabilities: Pair;
  /** Equity with the profit not yet closed — the two computed lines are inside `equity`. */
  totalEquity: Pair;
  /** Assets = liabilities + equity, in each column. */
  balanced: boolean;
}

export function buildBalanceCompare(rows: readonly CompareDbRow[], hasPrev: boolean): BalanceCompare {
  const of = (t: string) => rows.filter((r) => r.type === t).map((r) => line(r, hasPrev));
  // The computed profit lines are shown even at zero only when they are not both zero.
  const equity = of("equity").filter((l) => !l.code.startsWith("399") || l.v.current !== ZERO || (l.v.previous ?? ZERO) !== ZERO);
  const assets = of("asset");
  const liabilities = of("liability");
  const totalAssets = sumPairs(assets, hasPrev);
  const totalLiabilities = sumPairs(liabilities, hasPrev);
  const totalEquity = sumPairs(equity, hasPrev);
  const balanced =
    totalAssets.current === totalLiabilities.current + totalEquity.current &&
    (!hasPrev || totalAssets.previous === (totalLiabilities.previous ?? ZERO) + (totalEquity.previous ?? ZERO));
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced };
}

export interface CashCompare {
  operating: Line[];
  investing: Line[];
  financing: Line[];
  totalOperating: Pair;
  totalInvesting: Pair;
  totalFinancing: Pair;
  net: Pair;
  opening: Pair;
  closing: Pair;
  /** Opening cash + the movement = closing cash, in each column. */
  ties: boolean;
}

export function buildCashCompare(rows: readonly CompareDbRow[], hasPrev: boolean): CashCompare {
  const sec = (s: string) => rows.filter((r) => r.section === s).map((r) => line(r, hasPrev));
  const operating = sec("operating");
  const investing = sec("investing");
  const financing = sec("financing");
  const totalOperating = sumPairs(operating, hasPrev);
  const totalInvesting = sumPairs(investing, hasPrev);
  const totalFinancing = sumPairs(financing, hasPrev);
  const net = sumPairs([...operating, ...investing, ...financing], hasPrev);
  const cash = (code: string) => {
    const r = rows.find((x) => x.section === "cash" && x.code === code);
    return pair(big(r?.current_minor), hasPrev ? big(r?.previous_minor) : null);
  };
  const opening = cash("_opening");
  const closing = cash("_closing");
  const ties =
    opening.current + net.current === closing.current &&
    (!hasPrev || (opening.previous ?? ZERO) + (net.previous ?? ZERO) === (closing.previous ?? ZERO));
  return { operating, investing, financing, totalOperating, totalInvesting, totalFinancing, net, opening, closing, ties };
}

export interface EquityStatement {
  rows: { line: string; name: Text; amount: bigint }[];
  closing: bigint;
  /** The closing line is the balance sheet's equity on the period's last day, to the cent. */
  closesToBalance: boolean;
}

export function buildEquity(rows: readonly EquityDbRow[], balanceEquity: bigint): EquityStatement {
  const out = [...rows]
    .sort((a, b) => a.ord - b.ord)
    .map((r) => ({ line: r.line, name: { ar: r.name_ar, en: r.name_en }, amount: big(r.amount) }));
  const closing = out.find((r) => r.line === "closing")?.amount ?? ZERO;
  return { rows: out, closing, closesToBalance: closing === balanceEquity };
}

export const BUCKETS = ["0_30", "31_60", "61_90", "90_plus", "advance"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, Text> = {
  "0_30": { ar: "حتى ٣٠ يوماً", en: "0–30 days" },
  "31_60": { ar: "٣١–٦٠", en: "31–60" },
  "61_90": { ar: "٦١–٩٠", en: "61–90" },
  "90_plus": { ar: "أكثر من ٩٠", en: "Over 90" },
  advance: { ar: "مدفوعٌ مقدّماً", en: "Paid ahead" },
};

export interface AgeingAccount {
  code: string;
  name: Text;
  buckets: Record<Bucket, bigint>;
  items: number;
  total: bigint;
}

export interface AgeingSide {
  accounts: AgeingAccount[];
  buckets: Record<Bucket, bigint>;
  total: bigint;
}

const emptyBuckets = (): Record<Bucket, bigint> => ({ "0_30": ZERO, "31_60": ZERO, "61_90": ZERO, "90_plus": ZERO, advance: ZERO });

export function buildAgeing(rows: readonly AgeingDbRow[]): { receivable: AgeingSide; payable: AgeingSide } {
  const side = (s: "receivable" | "payable"): AgeingSide => {
    const byCode = new Map<string, AgeingAccount>();
    for (const r of rows.filter((x) => x.side === s)) {
      const a = byCode.get(r.code) ?? { code: r.code, name: { ar: r.name_ar, en: r.name_en || r.name_ar }, buckets: emptyBuckets(), items: 0, total: ZERO };
      a.buckets[r.bucket] += big(r.amount_minor);
      a.items += r.bucket === "advance" ? 0 : Number(r.items);
      a.total += big(r.amount_minor);
      byCode.set(r.code, a);
    }
    const accounts = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
    const buckets = emptyBuckets();
    for (const a of accounts) for (const b of BUCKETS) buckets[b] += a.buckets[b];
    return { accounts, buckets, total: accounts.reduce((n, a) => n + a.total, ZERO) };
  };
  return { receivable: side("receivable"), payable: side("payable") };
}

export interface BudgetStage {
  stageKey: string | null;
  name: Text;
  budget: bigint;
  actual: bigint;
  variance: bigint;
  /** Spent as a share of the plan, one decimal; null with no plan. */
  usedPct: number | null;
}

export interface BudgetSeason {
  seasonId: string;
  name: string;
  stages: BudgetStage[];
  budget: bigint;
  actual: bigint;
  variance: bigint;
  usedPct: number | null;
}

export function stageName(key: string | null): Text {
  if (!key) return { ar: "بلا مرحلة", en: "No stage" };
  const ar = STAGE_TEMPLATES[key as StageKey]?.name ?? key;
  return { ar, en: STAGE_EN[key] ?? ar };
}

const usedPct = (actual: bigint, budget: bigint): number | null => (budget > ZERO ? roundTenths(actual * BigInt(1000), budget) : null);

export function buildBudget(rows: readonly BudgetDbRow[]): BudgetSeason[] {
  const seasons = new Map<string, BudgetSeason>();
  for (const r of rows) {
    const s = seasons.get(r.season_id) ?? { seasonId: r.season_id, name: r.season_name, stages: [], budget: ZERO, actual: ZERO, variance: ZERO, usedPct: null };
    const budget = big(r.budget_minor);
    const actual = big(r.actual_minor);
    s.stages.push({ stageKey: r.stage_key, name: stageName(r.stage_key), budget, actual, variance: budget - actual, usedPct: usedPct(actual, budget) });
    s.budget += budget;
    s.actual += actual;
    seasons.set(r.season_id, s);
  }
  return [...seasons.values()].map((s) => ({ ...s, variance: s.budget - s.actual, usedPct: usedPct(s.actual, s.budget) }));
}

// ── The bundle ───────────────────────────────────────────────────────────────

export interface PeriodView {
  from: string;
  to: string;
  season: { id: string; name: string } | null;
}

export interface StatementsBundle {
  book: { id: string; kind: "farm" | "investor" | "platform"; heading: Text; ownerName: string | null; closedThrough: string | null };
  basis: Basis;
  current: PeriodView;
  previous: PeriodView | null;
  income: IncomeCompare;
  balance: BalanceCompare;
  cash: CashCompare;
  equity: EquityStatement;
  ageing: { asOf: string; receivable: AgeingSide; payable: AgeingSide };
  budget: BudgetSeason[];
  notes: { title: Text; body: Text }[];
  fingerprint: string;
  generatedAt: string;
}

/** The period in words, as a heading says it. */
export function periodLabel(p: PeriodView, basis: Basis): Text {
  if (p.season) return { ar: `موسم «${p.season.name}» (${p.from} — ${p.to})`, en: `Season “${p.season.name}” (${p.from} — ${p.to})` };
  if (basis === "month") return { ar: `شهر ${p.from.slice(0, 7)} (${p.from} — ${p.to})`, en: `Month ${p.from.slice(0, 7)} (${p.from} — ${p.to})` };
  return { ar: `سنة ${p.from.slice(0, 4)} (${p.from} — ${p.to})`, en: `Year ${p.from.slice(0, 4)} (${p.from} — ${p.to})` };
}

/**
 * The fingerprint's text: every figure, in a fixed order, as integers of cents. Names are left out on purpose —
 * an account renamed is not a figure changed — and so are the time and the reader's language.
 */
export function fingerprintText(b: Omit<StatementsBundle, "fingerprint" | "notes" | "generatedAt">): string {
  const p = (v: Pair) => [v.current.toString(), v.previous === null ? "" : v.previous.toString()].join("/");
  const lines = (title: string, ls: readonly Line[]) => ls.map((l) => `${title}|${l.code}|${p(l.v)}`);
  const out: string[] = [
    "sudagri-statements|v1",
    `book|${b.book.id}`,
    `basis|${b.basis}`,
    `current|${b.current.from}|${b.current.to}|${b.current.season?.id ?? ""}`,
    `previous|${b.previous ? `${b.previous.from}|${b.previous.to}|${b.previous.season?.id ?? ""}` : ""}`,
    ...lines("income.revenue", b.income.revenue),
    ...lines("income.expense", b.income.expense),
    `income.net|${p(b.income.net)}`,
    ...lines("balance.asset", b.balance.assets),
    ...lines("balance.liability", b.balance.liabilities),
    ...lines("balance.equity", b.balance.equity),
    ...lines("cash.operating", b.cash.operating),
    ...lines("cash.investing", b.cash.investing),
    ...lines("cash.financing", b.cash.financing),
    `cash.opening|${p(b.cash.opening)}`,
    `cash.closing|${p(b.cash.closing)}`,
    ...b.equity.rows.map((r) => `equity|${r.line}|${r.amount}`),
    `ageing.asof|${b.ageing.asOf}`,
    ...(["receivable", "payable"] as const).flatMap((s) =>
      b.ageing[s].accounts.map((a) => `ageing.${s}|${a.code}|${BUCKETS.map((k) => a.buckets[k].toString()).join("/")}`),
    ),
    ...b.budget.flatMap((s) => s.stages.map((st) => `budget|${s.seasonId}|${st.stageKey ?? ""}|${st.budget}|${st.actual}`)),
  ];
  return out.join("\n");
}

export const fingerprintOf = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** The fingerprint in groups of eight, so a reader can compare it by eye. */
export const fingerprintGroups = (hex: string): string => hex.replace(/(.{8})(?=.)/g, "$1 ");

// ── The notes ────────────────────────────────────────────────────────────────

const usd = (minor: bigint | number): string => `${formatMoney(typeof minor === "bigint" ? minor : big(minor), "USD", false)} $`;

/**
 * Short notes to the statements, written from the book's own facts: the basis they are prepared on, the currency and
 * the rule that turned pounds into dollars, how assets are depreciated, and the items worth a reader's attention.
 * Nothing here is typed by hand; a book with no pound entries says so instead of describing a rule it never used.
 */
export function buildNotes(b: Omit<StatementsBundle, "fingerprint" | "notes" | "generatedAt">, f: Facts): { title: Text; body: Text }[] {
  const notes: { title: Text; body: Text }[] = [];

  notes.push({
    title: { ar: "أساس الإعداد", en: "Basis of preparation" },
    body: {
      ar:
        "حساباتٌ إداريّة من دفترٍ مزدوج القيد لا يُعدَّل قيده ولا يُحذف بل يُعكس، بأساس الاستحقاق والتكلفة التاريخيّة: البيع والشراء يُقيَّدان يوم وقوعهما ولو آجلاً، " +
        "والمحاصيل القائمة تُحمل بتكلفتها حتى تُباع، وتقدير قيمة المحصول يُعرض ولا يُقيَّد. ليست قوائم قانونيّة مدقَّقة." +
        (f.closed_through ? ` الدفتر مقفلٌ حتى ${f.closed_through}: ما قبله لا يُكتب فيه.` : ""),
      en:
        "Management accounts from a double-entry book whose entries are never edited or deleted, only reversed; on the accrual basis at historical cost: " +
        "sales and purchases are booked on the day they happen, on credit or not; growing crops are carried at cost until sold, and a crop's estimated value is shown, never booked. Not audited statutory statements." +
        (f.closed_through ? ` The book is closed through ${f.closed_through}: nothing before it can be written.` : ""),
    },
  });

  const sdg = f.currencies.find((c) => c.currency === "SDG");
  const fxNet = big(f.fx_result);
  notes.push({
    title: { ar: "العملة وسعر الصرف", en: "Currency and exchange rate" },
    body: sdg
      ? {
          ar:
            `وحدة القياس الدولار الأمريكيّ. ${sdg.lines} سطراً في الفترة كُتبت بالجنيه السودانيّ وحُوِّلت بسعر يوم القيد` +
            (f.fx.min_rate !== null ? ` (من ${fmtRate(f.fx.min_rate)} إلى ${fmtRate(f.fx.max_rate)} جنيهاً للدولار)` : "") +
            `: سعر السوق الموازي المنشور على المنصّة في ${f.fx.parallel} قيداً، وسعر البنك في ${f.fx.bank}، وسعرٌ كتبه صاحب القيد في ${f.fx.user}. ` +
            "لا يُعاد تقويم القيد بعد يومه؛ وفرق الصرف بين يوم الدين ويوم سداده يُقيَّد يوم السداد" +
            (fxNet !== ZERO ? `، وصافيه في الفترة ${fxNet > ZERO ? "ربحٌ" : "خسارةٌ"} ${usd(fxNet < ZERO ? -fxNet : fxNet)}.` : "."),
          en:
            `The unit of measure is the US dollar. ${sdg.lines} lines in the period were written in Sudanese pounds and converted at the rate of the entry's day` +
            (f.fx.min_rate !== null ? ` (from ${fmtRate(f.fx.min_rate)} to ${fmtRate(f.fx.max_rate)} pounds per dollar)` : "") +
            `: the parallel-market rate published on the platform in ${f.fx.parallel} entries, the bank rate in ${f.fx.bank}, and a rate the writer typed in ${f.fx.user}. ` +
            "An entry is not revalued after its day; the exchange difference between the day a debt arose and the day it was paid is booked on the day it is paid" +
            (fxNet !== ZERO ? `, a net ${fxNet > ZERO ? "gain" : "loss"} of ${usd(fxNet < ZERO ? -fxNet : fxNet)} in the period.` : "."),
        }
      : {
          ar: "وحدة القياس الدولار الأمريكيّ، وكلّ قيود الفترة بالدولار فلا تحويل فيها. ما يُكتب بالجنيه يُحوَّل بسعر يوم القيد (السعر الموازي المنشور، أو سعرٌ يكتبه صاحب القيد) ولا يُعاد تقويمه بعده.",
          en: "The unit of measure is the US dollar, and every entry in the period is in dollars, so nothing was converted. An entry written in pounds is converted at its day's rate (the published parallel rate, or one the writer types) and is not revalued afterwards.",
        },
  });

  const fa = f.fixed_assets;
  notes.push({
    title: { ar: "الأصول الثابتة والإهلاك", en: "Fixed assets and depreciation" },
    body:
      fa.count > 0
        ? {
            ar:
              `${fa.count} أصلاً ثابتاً قائماً بتكلفة ${usd(fa.cost_minor)} وقيمة خردة ${usd(fa.salvage_minor)}. يُهلك كلٌّ بالقسط الثابت شهراً بشهر من الشهر التالي لشرائه: ` +
              `(التكلفة − الخردة) ÷ العمر بالأشهر (${fa.min_life === fa.max_life ? fa.min_life : `${fa.min_life}–${fa.max_life}`} شهراً)، والشهر الأخير يأخذ الباقي. إهلاك الفترة ${usd(f.depreciation_minor)}.`,
            en:
              `${fa.count} fixed asset(s) in use at a cost of ${usd(fa.cost_minor)}, scrap value ${usd(fa.salvage_minor)}. Each is depreciated on a straight line, month by month from the month after purchase: ` +
              `(cost − scrap) ÷ life in months (${fa.min_life === fa.max_life ? fa.min_life : `${fa.min_life}–${fa.max_life}`} months), the last month taking what is left. Depreciation for the period: ${usd(f.depreciation_minor)}.`,
          }
        : {
            ar: "لا أصول ثابتة مسجّلة في الدفتر لهذه الفترة. ما يُسجَّل يُهلك بالقسط الثابت شهراً بشهر من الشهر التالي لشرائه.",
            en: "No fixed assets are recorded in the book for this period. Any that are recorded are depreciated on a straight line, month by month from the month after purchase.",
          },
  });

  // Significant items: the largest figures, what is owed either way and how old it is, crops still at cost.
  const items: Text[] = [];
  const top = (ls: readonly Line[], total: bigint, ar: string, en: string) => {
    const l = [...ls].sort((a, b) => (b.v.current > a.v.current ? 1 : b.v.current < a.v.current ? -1 : 0))[0];
    if (!l || l.v.current <= ZERO || total <= ZERO) return;
    const share = Math.round(Number((l.v.current * BigInt(1000)) / total) / 10);
    items.push({ ar: `${ar} «${l.name.ar}» ${usd(l.v.current)} (${share}٪ من المجموع).`, en: `${en} “${l.name.en}”: ${usd(l.v.current)} (${share}% of the total).` });
  };
  top(b.income.revenue, b.income.totalRevenue.current, "أكبر الإيراد", "Largest revenue");
  top(b.income.expense, b.income.totalExpense.current, "وأكبر المصروف", "Largest expense");
  const r = b.ageing.receivable;
  const pa = b.ageing.payable;
  if (r.total !== ZERO) {
    items.push({
      ar: `لك على غيرك ${usd(r.total)} يوم ${b.ageing.asOf}، منها ${usd(r.buckets["90_plus"])} مضى عليها أكثر من ٩٠ يوماً.`,
      en: `Owed to you: ${usd(r.total)} on ${b.ageing.asOf}, of which ${usd(r.buckets["90_plus"])} is over 90 days old.`,
    });
  }
  if (pa.total !== ZERO) {
    items.push({
      ar: `وعليك لغيرك ${usd(pa.total)}، منها ${usd(pa.buckets["90_plus"])} مضى عليها أكثر من ٩٠ يوماً.`,
      en: `You owe: ${usd(pa.total)}, of which ${usd(pa.buckets["90_plus"])} is over 90 days old.`,
    });
  }
  if (big(f.growing_crops_minor) !== ZERO) {
    items.push({
      ar: `محاصيل قائمة بتكلفتها ${usd(f.growing_crops_minor)}: تكلفةٌ تُنقل إلى «تكلفة المباع» يوم يُقفل موسمها، لا ربحٌ ولا خسارة بعد.`,
      en: `Growing crops at cost: ${usd(f.growing_crops_minor)} — cost moved to “cost of crop sold” when the season closes, not yet a profit or a loss.`,
    });
  }
  items.push({
    ar: `${f.entries} قيداً في الفترة، منها ${f.manual} بيد صاحب الدفتر و${f.reversals} قيداً عاكساً يصحّح قيداً سبقه.`,
    en: `${f.entries} entries in the period, ${f.manual} of them by hand and ${f.reversals} reversing an earlier entry.`,
  });
  if (!b.balance.balanced || !b.cash.ties || !b.equity.closesToBalance) {
    items.push({
      ar: "تنبيه: قائمةٌ من هذه القوائم لا تتوازن — أبلغ الإدارة قبل الاعتماد عليها.",
      en: "Warning: one of these statements does not balance — tell the administrators before relying on it.",
    });
  }
  notes.push({
    title: { ar: "بنودٌ تستحقّ الانتباه", en: "Significant items" },
    body: { ar: items.map((i) => i.ar).join(" "), en: items.map((i) => i.en).join(" ") },
  });

  if (b.previous) {
    const cmp: Text =
      b.basis === "season"
        ? { ar: `الموسم الذي زُرع قبله («${b.previous.season?.name ?? ""}»)`, en: `the season planted before it (“${b.previous.season?.name ?? ""}”)` }
        : b.basis === "month"
          ? { ar: "الأيّام نفسها من الشهر السابق", en: "the same days of the month before" }
          : { ar: "الأيّام نفسها من السنة السابقة", en: "the same days of the year before" };
    notes.push({
      title: { ar: "المقارنة", en: "Comparison" },
      body: {
        ar: `العمود المقابل: ${cmp.ar}، من ${b.previous.from} إلى ${b.previous.to}. التغيّر = هذه الفترة − السابقة، ونسبته إلى السابقة؛ ولا نسبة لما كان صفراً.`,
        en: `The comparison column: ${cmp.en}, ${b.previous.from} to ${b.previous.to}. Change = this period − the previous, and its share of the previous; no percentage where the previous was zero.`,
      },
    });
  }
  return notes;
}

const fmtRate = (n: number | null): string => (n === null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));

// ── JSON ─────────────────────────────────────────────────────────────────────

/** The bundle as JSON: every bigint becomes a safe integer of cents (the largest a line may carry is far inside it). */
export function bundleToWire(b: StatementsBundle): unknown {
  return JSON.parse(JSON.stringify(b, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

export { big, bigOrNull };
