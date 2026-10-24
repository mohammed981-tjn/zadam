/**
 * مالُ الدفتر: أعدادٌ صحيحة بالوحدة الصغرى، لا كسورَ عشريّة (البند ١٨٦).
 *
 * Money in the ledger is a whole number of minor units (cents, piastres) in a named currency. It is
 * never a float: 0.1 + 0.2 is not 0.3, and a trial balance needs equality, not nearness. Everything
 * here is `bigint` until it must cross into JSON, where `toWire` hands over a safe integer or refuses.
 *
 * The database does the same arithmetic (`ledger_to_base` in 20261024110000_ledger_engine.sql), and
 * the two must agree to the unit: scripts/fixtures/ledger-money.json holds the cases, worked out by a
 * third implementation (exact fractions), and both this file and the SQL gate are held to it.
 *
 * Rules that are policy, not measurement: the dollar is the unit of measure; the rate is pounds per
 * dollar (the dollar's selling price) and is kept to six decimals; a rate outside 1…100,000,000 is a
 * typing mistake; a figure typed with more decimals than the currency has is refused, never rounded —
 * rounding someone's money silently is how a ledger stops being trusted.
 */

export type CurrencyCode = "USD" | "SDG";

export const BASE_CURRENCY: CurrencyCode = "USD";

export const CURRENCIES: Record<CurrencyCode, { digits: number; nameAr: string; symbol: string }> = {
  USD: { digits: 2, nameAr: "دولار", symbol: "$" },
  SDG: { digits: 2, nameAr: "جنيه", symbol: "ج.س" },
};

export const isCurrency = (c: string): c is CurrencyCode => c === "USD" || c === "SDG";

/** The most one line may carry, in minor units — the column's own check. */
export const MAX_MINOR = BigInt("10000000000000");

const RATE_SCALE = BigInt(1_000_000);
const RATE_MIN = BigInt(1) * RATE_SCALE;
const RATE_MAX = BigInt(100_000_000) * RATE_SCALE;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** Arabic-Indic and Persian digits and separators to their plain forms; spaces dropped. */
export function normaliseNumber(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[\s  ]/g, "");
}

/**
 * A positive-or-zero decimal as the person typed it: digits, an optional single point, and commas
 * only as thousands separators (groups of three). "12,5" is refused rather than guessed.
 */
function splitDecimal(raw: string): { whole: string; frac: string } | null {
  const s = normaliseNumber(raw);
  const m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  return { whole: m[1].replace(/,/g, ""), frac: m[2] ?? "" };
}

/** "1,234.50" or "١٢٣٤٫٥٠" to minor units; null when it is not a plain amount or has too many decimals. */
export function parseAmount(raw: string, currency: CurrencyCode): bigint | null {
  const parts = splitDecimal(raw);
  if (!parts) return null;
  const { digits } = CURRENCIES[currency];
  if (parts.frac.length > digits) return null;
  const minor = BigInt(parts.whole + parts.frac.padEnd(digits, "0"));
  return minor > MAX_MINOR ? null : minor;
}

/** Minor units to the plain decimal a machine reads: "1234.50". */
export function minorToDecimal(minor: bigint, currency: CurrencyCode): string {
  const { digits } = CURRENCIES[currency];
  const negative = minor < ZERO;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  return `${negative ? "-" : ""}${whole}${digits ? "." + frac : ""}`;
}

/** For the screen: grouped thousands, the currency's own decimals, and its name. "1,234.50 دولار" */
export function formatMoney(minor: bigint, currency: CurrencyCode, withName = true): string {
  const plain = minorToDecimal(minor, currency);
  const negative = plain.startsWith("-");
  const [whole, frac] = plain.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${negative ? "-" : ""}${grouped}${frac ? "." + frac : ""}`;
  return withName ? `${text} ${CURRENCIES[currency].nameAr}` : text;
}

/** A rate, pounds per dollar, to millionths; null when it is not a plain number, has more than six decimals, or is absurd. */
export function parseRate(raw: string): bigint | null {
  const parts = splitDecimal(raw);
  if (!parts || parts.frac.length > 6) return null;
  const micro = BigInt(parts.whole + parts.frac.padEnd(6, "0"));
  return micro < RATE_MIN || micro > RATE_MAX ? null : micro;
}

/** A rate in millionths back to text, trailing zeros trimmed: 1000000000n → "1000", 2450500000n → "2450.5". */
export function formatRate(micro: bigint): string {
  const s = micro.toString().padStart(7, "0");
  const whole = s.slice(0, s.length - 6);
  const frac = s.slice(s.length - 6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * Minor units of a foreign currency to the unit of measure, at a rate (pounds per dollar, in
 * millionths), half-up. Exactly `ledger_to_base` in the database: integers only, no float anywhere.
 */
export function toBase(minor: bigint, rateMicro: bigint, fromDigits = 2, baseDigits = 2): bigint {
  if (minor < ZERO) throw new RangeError("negative amount");
  if (rateMicro <= ZERO) throw new RangeError("rate must be positive");
  const scale = baseDigits - fromDigits;
  const twoMillion = TWO * RATE_SCALE;
  if (scale >= 0) {
    return (minor * TEN ** BigInt(scale) * twoMillion + rateMicro) / (TWO * rateMicro);
  }
  const down = TEN ** BigInt(-scale);
  return (minor * twoMillion + rateMicro * down) / (TWO * rateMicro * down);
}

export const sumMinor = (xs: readonly bigint[]): bigint => xs.reduce((a, b) => a + b, ZERO);

/**
 * Splits a total in proportion to weights without losing or inventing a unit: each share is rounded
 * down, then the units left over go one each to the shares with the biggest remainders (ties to the
 * earlier share). The shares always add up to the total. Weights are taken to a millionth.
 *
 * This is what the stage budgets needed: seven shares of a season's budget that rounded one by one
 * summed to the budget in only a third of the cases tried.
 */
export function allocate(total: bigint, weights: readonly number[]): bigint[] {
  if (weights.length === 0) throw new RangeError("no shares to split into");
  return allocateBig(
    total,
    weights.map((x) => {
      if (!Number.isFinite(x) || x < 0) throw new RangeError("weights must be finite and not negative");
      return BigInt(Math.round(x * 1_000_000));
    }),
  );
}

/**
 * The same split with whole-number weights, for weights that are themselves amounts (the costs each
 * party paid, shares in basis points): no float is involved anywhere, so it is exact at any size.
 */
export function allocateBig(total: bigint, w: readonly bigint[]): bigint[] {
  if (w.length === 0) throw new RangeError("no shares to split into");
  if (w.some((x) => x < ZERO)) throw new RangeError("weights must not be negative");
  const sumW = sumMinor(w);
  if (sumW <= ZERO) throw new RangeError("at least one weight must be positive");

  const negative = total < ZERO;
  const t = negative ? -total : total;
  const shares = w.map((x) => (t * x) / sumW);
  let left = t - sumMinor(shares);

  const order = w
    .map((x, i) => ({ i, rem: (t * x) % sumW }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (let k = 0; left > ZERO; k++, left -= ONE) shares[order[k].i] += ONE;

  return negative ? shares.map((s) => -s) : shares;
}

/** Equal shares of a total, the leftover units going to the first shares. */
export const splitEvenly = (total: bigint, parts: number): bigint[] => allocate(total, Array.from({ length: parts }, () => 1));

/** A figure for a JSON line: a safe integer, or an error — never a silently rounded float. */
export function toWire(minor: bigint): number {
  const n = Number(minor);
  if (!Number.isSafeInteger(n)) throw new RangeError("amount too large for a line");
  return n;
}
