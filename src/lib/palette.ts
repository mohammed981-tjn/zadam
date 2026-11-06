/**
 * لوحتا الألوان (المالك، 6 نوفمبر 2026): «ألوان الشعار» و«أخضر الأوراق والذهبيّ».
 *
 * The visitor's choice lives in a cookie, like the language (`lib/i18n.ts`), so the server can put it on `<html
 * data-palette>` and the very first paint is already in the chosen colours, with no flash of the default. The
 * colours themselves are in `globals.css`; nothing here knows them.
 *
 * No server import here: the switch (a client component) reads the same names.
 */
export const PALETTES = ["logo", "leaf"] as const;
export type Palette = (typeof PALETTES)[number];

export const PALETTE_COOKIE = "palette";
/** A year, as the language cookie. */
export const PALETTE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEFAULT_PALETTE: Palette = "logo";

/** Anything that is not a known palette — a missing cookie, an old or forged value — is the default. */
export function toPalette(value: string | null | undefined): Palette {
  return (PALETTES as readonly string[]).includes(value ?? "") ? (value as Palette) : DEFAULT_PALETTE;
}
