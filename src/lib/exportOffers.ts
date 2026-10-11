/**
 * عرضُ التصدير — ما يُحسب قبل أن يصل القاعدة.
 *
 * WHY THE ARITHMETIC LIVES HERE AND IS TESTED
 *
 * `export_offers` carries a check constraint the screen cannot see:
 *
 *     value_minor = round(quantity * unit_price_minor)
 *
 * PostgreSQL evaluates that in `numeric` — exact decimal arithmetic. JavaScript
 * would evaluate the same expression in binary floating point, where 0.1 + 0.2
 * is not 0.3 and 8.15 * 100 is 814.9999999999999. The two disagree on ordinary
 * commercial numbers, and when they do the database refuses the insert with a
 * constraint name the farmer cannot act on: the offer simply will not save, and
 * nothing on screen explains why.
 *
 * So the total is computed here in integers, never in floats, and checked
 * against worked examples. The quantity column holds four decimal places, so
 * scaling by 10,000 makes every quantity a whole number, and BigInt keeps the
 * product exact however large the consignment.
 */

import type { Locale } from "@/lib/i18n";

export type OfferStatus =
  | "draft"
  | "submitted"
  | "published"
  | "rejected"
  | "withdrawn";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "مسوّدة",
  submitted: "بانتظار المراجعة",
  published: "منشور",
  rejected: "مُعاد للإصلاح",
  withdrawn: "مسحوب",
};

export const OFFER_STATUS_LABEL_EN: Record<OfferStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  published: "Published",
  rejected: "Returned for fixes",
  withdrawn: "Withdrawn",
};

export function offerStatusLabel(status: OfferStatus, locale: Locale = "ar"): string {
  return (locale === "en" ? OFFER_STATUS_LABEL_EN : OFFER_STATUS_LABEL)[status];
}

/**
 * What the farmer is told each state means for them — which is not the same as
 * what the state is called. "rejected" names the reviewer's act; the farmer
 * needs to know that the offer came back and what to do with it.
 */
export const OFFER_STATUS_HELP: Record<OfferStatus, string> = {
  draft: "لم يُرسل بعد. لك أن تعدّله كما تشاء.",
  submitted: "وصل المراجعة. لك سحبُه ما دام لم يُبَتّ فيه.",
  published: "يراه المشترون الآن.",
  rejected: "عاد إليك بسببٍ مكتوب. أصلحه وأعد الإرسال.",
  withdrawn: "سحبتَه. لم يعد معروضاً.",
};

export const OFFER_STATUS_HELP_EN: Record<OfferStatus, string> = {
  draft: "Not sent yet. You can change it as you like.",
  submitted: "It has reached review. You can withdraw it until a decision is made.",
  published: "Buyers can see it now.",
  rejected: "It came back to you with a written reason. Fix it and send it again.",
  withdrawn: "You withdrew it. It is no longer offered.",
};

export function offerStatusHelp(status: OfferStatus, locale: Locale = "ar"): string {
  return (locale === "en" ? OFFER_STATUS_HELP_EN : OFFER_STATUS_HELP)[status];
}

/**
 * English names for the seeded reference rows, keyed by their `code`. The
 * tables carry Arabic only; a row added later from the admin board has no
 * entry here and is shown in Arabic as stored.
 */
const REFERENCE_NAME_EN: Record<string, string> = {
  // export_commodities
  gum_arabic: "Gum arabic",
  live_sheep: "Live sheep",
  sesame: "Sesame",
  sorghum: "Sorghum",
  hibiscus: "Hibiscus (karkadeh)",
  groundnut: "Groundnuts",
  // export_destinations
  EU: "European Union",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  CN: "China",
  TR: "Turkey",
  // export_uom
  kg: "kilogram",
  ton: "tonne",
  head: "head",
  sack: "sack",
  // export_document_types
  phytosanitary: "Phytosanitary certificate",
  veterinary: "Veterinary certificate",
  origin_rex: "Statement of origin (Registered Exporter)",
  eudr_dds: "Due-diligence statement — Deforestation Regulation",
  saber_coc: "Certificate of conformity (SABER)",
  lab_report: "Laboratory report",
  packing_list: "Packing list",
  invoice: "Commercial invoice",
};

const REFERENCE_NOTE_EN: Record<string, string> = {
  phytosanitary: "For grains and seeds",
  veterinary: "For live animals and meat",
  origin_rex: "Replaced the government certificate of origin in the European Union",
  eudr_dds: "Covers small buyers from 30 June 2027",
  saber_coc: "Mandatory for every import into Saudi Arabia since 2018; obtained by the importer",
  lab_report: "Aflatoxin and salmonella",
};

/** A seeded document type's note in the reader's language. */
export function referenceNote(
  code: string | null | undefined,
  noteAr: string | null,
  locale: Locale = "ar",
): string | null {
  if (locale !== "en" || !code || !noteAr) return noteAr;
  return REFERENCE_NOTE_EN[code] ?? noteAr;
}

/** A reference row's name in the reader's language, falling back to the stored Arabic. */
export function referenceName(
  code: string | null | undefined,
  nameAr: string,
  locale: Locale = "ar",
): string {
  if (locale !== "en" || !code) return nameAr;
  return REFERENCE_NAME_EN[code] ?? nameAr;
}

/** Four decimal places, matching `quantity numeric(16,4)`. */
export const QUANTITY_SCALE = 4;
// Written BigInt(10) rather than as a `10n` literal: this project targets
// ES2017, where the literal form is a type error. Same value, computed once.
const SCALE_FACTOR = BigInt(10) ** BigInt(QUANTITY_SCALE);

/**
 * The database's rejection reason must be long enough to act on. Mirrors
 * `export_offer_rejected_has_reason`, so the screen refuses before the round
 * trip rather than after it.
 */
export const MIN_REJECTION_REASON = 10;

export interface OfferAmounts {
  /** Quantity scaled to an integer: 7.5 becomes 75000. */
  quantityScaled: bigint;
  /** Unit price in minor units (cents for USD). */
  unitPriceMinor: bigint;
  /** round(quantity × unitPriceMinor), exactly as PostgreSQL computes it. */
  valueMinor: bigint;
}

/**
 * Parses a decimal string without going through Number.
 *
 * `parseFloat("7.5")` is fine; `parseFloat("0.1") * 3` is not, and neither is
 * any later multiplication. Reading the digits directly keeps the value exact
 * from the form field all the way to the column.
 *
 * Returns null for anything that is not a plain non-negative decimal — an empty
 * field, a thousands separator, an exponent, a minus sign. Guessing at those
 * would put a number in a contract that the farmer did not type.
 */
export function parseDecimal(input: string, maxScale: number): bigint | null {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > maxScale) return null;

  const padded = fraction.padEnd(maxScale, "0");
  return BigInt(whole + padded);
}

/**
 * Computes the three money fields the way the constraint will check them.
 *
 * `round` here is half away from zero, matching PostgreSQL's `round(numeric)`.
 * Every value is non-negative — the column constraints see to that — so adding
 * half the divisor before the integer division is the same thing.
 */
export function offerAmounts(
  quantityText: string,
  unitPriceText: string,
  minorPerUnit: number,
): OfferAmounts | null {
  const quantityScaled = parseDecimal(quantityText, QUANTITY_SCALE);
  if (quantityScaled === null || quantityScaled === BigInt(0)) return null;

  const minorDigits = String(minorPerUnit).length - 1;
  const unitPriceMinor = parseDecimal(unitPriceText, minorDigits);
  if (unitPriceMinor === null || unitPriceMinor === BigInt(0)) return null;

  const product = quantityScaled * unitPriceMinor;
  const valueMinor = (product + SCALE_FACTOR / BigInt(2)) / SCALE_FACTOR;

  return { quantityScaled, unitPriceMinor, valueMinor };
}

/** The scaled integer back to the decimal string the column expects. */
export function quantityToString(scaled: bigint): string {
  const whole = scaled / SCALE_FACTOR;
  const fraction = (scaled % SCALE_FACTOR).toString().padStart(QUANTITY_SCALE, "0");
  return `${whole}.${fraction}`;
}

/** Minor units to a readable amount: 2400000 → "24,000.00". */
export function formatMinor(minor: bigint | number, minorPerUnit = 100): string {
  const value = typeof minor === "bigint" ? minor : BigInt(Math.round(minor));
  const per = BigInt(minorPerUnit);
  const digits = String(minorPerUnit).length - 1;
  const whole = value / per;
  const rest = (value % per).toString().padStart(digits, "0");
  return `${whole.toLocaleString("en-US")}.${rest}`;
}

/**
 * A human-readable, collision-resistant reference.
 *
 * Not a sequence: sequences leak how many offers the platform has ever carried,
 * which is a number a young marketplace has no reason to publish to every
 * buyer who reads one reference.
 */
export function offerReference(now = new Date(), random = Math.random): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `EXP-${stamp}-${suffix}`;
}

export interface OriginInput {
  plotRef: string;
  areaHectares: string;
  latitude: string;
  longitude: string;
  boundary: string;
}

/**
 * The deforestation-regulation rule, checked before the round trip.
 *
 * The database enforces it too — that is the boundary and this is not. The
 * point of repeating it is the message: a constraint violation reaches the
 * browser as a constraint name, and a farmer who is told
 * `export_origin_polygon_required_above_four_ha` learns nothing about what to
 * do next.
 */
export function originProblem(
  origin: OriginInput,
  locale: Locale = "ar",
): string | null {
  const en = locale === "en";
  if (!origin.plotRef.trim()) {
    return en ? "The plot's name or number is required." : "اسم القطعة أو رقمها مطلوب.";
  }

  const lat = parseDecimal(origin.latitude.replace(/^-/, ""), 6);
  const lon = parseDecimal(origin.longitude.replace(/^-/, ""), 6);
  if (lat === null || lon === null) {
    return en
      ? "Coordinates are required, as decimal numbers — e.g. 13.183333 and 30.216667."
      : "الإحداثيّة مطلوبة، رقماً عشرياً — مثال: 13.183333 و30.216667.";
  }

  const area = origin.areaHectares.trim()
    ? parseDecimal(origin.areaHectares, 4)
    : null;

  if (area !== null && area >= BigInt(40000) && !origin.boundary.trim()) {
    return en
      ? "The plot is larger than four hectares, and the European regulation requires a full boundary polygon for it, not a single point."
      : "القطعة أكبر من أربعة هكتارات، واللائحة الأوروبية تطلب لها مضلَّع حدودٍ " +
          "كاملاً لا نقطةً واحدة.";
  }

  return null;
}
