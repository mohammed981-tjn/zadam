/**
 * Turning what a Sudanese visitor types into a number the auth system accepts.
 *
 * Supabase stores phone identifiers in E.164 — country code and national number
 * with no plus, no spaces, no separators. What people actually type is a local
 * number with a leading zero, often with spaces or dashes, sometimes with Arabic
 * digits from an Arabic keyboard. Handing that to the API gives a rejection the
 * visitor cannot act on, so it is normalised here and the failure cases are
 * named in words they can do something about.
 *
 * The leading zero is the case that matters most. A Sudanese mobile is written
 * 0912345678 locally, and its international form drops that zero: 249912345678.
 * Someone who types their number the way they have written it their whole life
 * would otherwise be told their number is invalid.
 */

export interface Country {
  code: string;
  /** Country calling code, no plus. */
  dial: string;
  name: string;
  /** Expected length of the national number after any trunk zero is removed. */
  nationalDigits: number[];
}

/**
 * Sudan first, then the countries where Sudanese diaspora most commonly hold a
 * number. Kept short on purpose: a list of two hundred countries is harder to
 * use than one of nine when almost every visitor wants the first entry.
 */
export const COUNTRIES: Country[] = [
  { code: "SD", dial: "249", name: "السودان", nationalDigits: [9] },
  { code: "EG", dial: "20", name: "مصر", nationalDigits: [10] },
  { code: "SA", dial: "966", name: "السعودية", nationalDigits: [9] },
  { code: "AE", dial: "971", name: "الإمارات", nationalDigits: [9] },
  { code: "QA", dial: "974", name: "قطر", nationalDigits: [8] },
  { code: "KW", dial: "965", name: "الكويت", nationalDigits: [8] },
  { code: "TR", dial: "90", name: "تركيا", nationalDigits: [10] },
  { code: "GB", dial: "44", name: "بريطانيا", nationalDigits: [10] },
  { code: "US", dial: "1", name: "أمريكا وكندا", nationalDigits: [10] },
];

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic and Persian digits map to their ASCII equivalents. */
export function toWesternDigits(input: string): string {
  return [...input]
    .map((ch) => {
      const arabic = ARABIC_DIGITS.indexOf(ch);
      if (arabic >= 0) return String(arabic);
      const persian = PERSIAN_DIGITS.indexOf(ch);
      if (persian >= 0) return String(persian);
      return ch;
    })
    .join("");
}

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; message: string };

/**
 * Combines a dial code and a typed national number into an E.164 identifier.
 *
 * Rejects rather than guesses when the length is wrong: a number one digit
 * short is a typo, and silently accepting it would create an account whose
 * owner can never be reached and never log in again if they forget which digits
 * they mistyped.
 */
export function toE164(dial: string, typed: string): PhoneResult {
  const cleanDial = toWesternDigits(dial).replace(/\D/g, "");
  const country = COUNTRIES.find((c) => c.dial === cleanDial);
  if (!country) {
    return { ok: false, message: "اختر مفتاح الدولة من القائمة." };
  }

  let national = toWesternDigits(typed).replace(/\D/g, "");

  if (national.length === 0) {
    return { ok: false, message: "أدخل رقم جوالك." };
  }

  // A visitor may paste the full international form into the national field,
  // or type the country code again after selecting it.
  if (national.startsWith(cleanDial) && national.length > country.nationalDigits[0]) {
    national = national.slice(cleanDial.length);
  }

  // The trunk zero: written locally, dropped internationally.
  if (national.startsWith("0")) national = national.slice(1);

  if (!country.nationalDigits.includes(national.length)) {
    const expected = country.nationalDigits.join(" أو ");
    return {
      ok: false,
      message: `رقم ${country.name} يتكوّن من ${expected} أرقام بعد مفتاح الدولة، وأنت أدخلت ${national.length}.`,
    };
  }

  return {
    ok: true,
    e164: `${cleanDial}${national}`,
    display: `+${cleanDial} ${national}`,
  };
}
