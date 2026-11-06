import type { Locale } from "./i18n";

/**
 * The language the app asked for (backlog 208, owner, 6 November 2026: the app in English as well as Arabic).
 *
 * The app sends `x-sudagri-lang: en` when English is chosen on the phone (mobile/lib/i18n.dart), and nothing when it
 * is in Arabic. A route under /api/app passes this to the same helpers the website calls with the reader's cookie
 * (`dbMessage`, `explain`, the shared steps), so a refusal reaches the phone in the website's English twin. It
 * chooses words only: who may do what is still decided by each route's `clientFromBearer` and the database.
 */
export const APP_LANG_HEADER = "x-sudagri-lang";

export function appLocale(req: Request): Locale {
  return req.headers.get(APP_LANG_HEADER)?.trim().toLowerCase() === "en" ? "en" : "ar";
}
