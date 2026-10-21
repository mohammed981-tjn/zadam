/**
 * Arabic first, English beside it (the owner, 11 October: «كامل النسخة
 * الانجليزية» — the whole site and the films).
 *
 * The language lives in one cookie, not in the URL. Every page here already
 * renders per request (the header reads the session), so a cookie costs no
 * caching, and it keeps every link, shared WhatsApp URL and bookmark the same
 * in both languages — a farmer who forwards a page to an English-speaking
 * investor sends one link, and each reads it in their own language.
 *
 * Pages are translated one at a time. Until a page is, English readers see it
 * in Arabic, laid out right-to-left as written, under a one-line notice — a
 * half-translated page with English chrome around Arabic paragraphs in the
 * wrong direction is worse than an honest "not yet".
 */

export type Locale = "ar" | "en";

export const LOCALE_COOKIE = "lang";

/** A year: the choice is a preference, not a session. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function toLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "ar";
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "en" ? "ltr" : "rtl";
}

/**
 * Routes whose pages are fully in English. A route listed here is matched
 * exactly; one ending in `/*` also covers everything under it.
 */
export const TRANSLATED_ROUTES: readonly string[] = [
  "/",
  // Knowledge, news, guide, feedback, notifications
  "/knowledge",
  "/news",
  "/news/*",
  "/guide",
  "/feedback",
  "/notifications",
  // Accounts, portfolio and projects
  "/login",
  "/signup",
  "/reset",
  "/reset/confirm",
  "/auth/callback/fragment",
  "/dashboard",
  "/plan",
  "/projects",
  "/projects/*",
  "/invest",
  "/invest/*",
  "/opportunities/new",
  "/farmers/*",
  // Contract services, partner companies and export
  "/how-we-work",
  "/partners",
  "/partners/*",
  "/admin/partners",
  "/admin/land-groups",
  "/services",
  "/services/*",
  "/contracts",
  "/contracts/*",
  "/export",
  "/export/*",
  // Nafir
  "/nafir",
  "/nafir/*",
  // Land, seasons and herds
  "/lands",
  "/lands/new",
  "/seasons",
  "/seasons/*",
  "/my-project",
  "/herds",
  "/herds/*",
  // Rain, tools, studies, the Arc Canal and mining
  "/rain",
  "/tools/water",
  "/tools/feasibility",
  "/rates",
  "/tools/new-crops",
  "/suppliers",
  "/suppliers/*",
  "/verify",
  "/admin/suppliers",
  "/studies",
  "/studies/exchange-rate",
  "/arc-canal",
  "/mining",
  "/mining/registry",
  "/mining/gold",
  "/market",
  "/market/offers",
  "/market/offers/new",
  "/mining/registry/*",
];

export function isTranslated(pathname: string): boolean {
  return TRANSLATED_ROUTES.some((r) =>
    r.endsWith("/*")
      ? pathname === r.slice(0, -2) || pathname.startsWith(r.slice(0, -1))
      : pathname === r,
  );
}

/** Pick the string for the reader's language: `tr(locale, "عربي", "English")`. */
export function tr(locale: Locale, ar: string, en: string): string {
  return locale === "en" ? en : ar;
}
