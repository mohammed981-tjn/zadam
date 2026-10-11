import { cookies } from "next/headers";
import { LOCALE_COOKIE, toLocale, type Locale } from "./i18n";

/** The reader's language, from the cookie the ع / EN switch sets. */
export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
