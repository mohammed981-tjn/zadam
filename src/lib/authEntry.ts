import type { SupabaseClient } from "@supabase/supabase-js";
import { COUNTRIES, toE164, toWesternDigits } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";
import type { Locale } from "@/lib/i18n";

/**
 * One box for a mobile number or an email (backlog 142).
 *
 * The owner, 23 October: «الدخول والتسجيل شاشةٌ واحدة، أمّا برقم جوال أو
 * إيميل». The sign-in screen used to ask first which of the two, on two
 * separate pages, and then again on the signup page. Now the visitor types
 * what they have, and this decides: an "@" is an email; anything else is a
 * number, read with the country code beside it — or with its own, when it is
 * written in the international form (+966…, 00966…), which is how a Sudanese
 * abroad copies their number out of their phone.
 */

export type Identifier =
  | { ok: true; kind: "email"; address: string; shown: string }
  | { ok: true; kind: "phone"; address: string; e164: string; shown: string }
  | { ok: false; message: string };

/** New accounts and new passwords; signing in with an older, shorter one still works. */
export const MIN_PASSWORD = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function readIdentifier(typed: string, dial: string, locale: Locale = "ar"): Identifier {
  const en = locale === "en";
  const text = typed.trim();

  if (!text) {
    return { ok: false, message: en ? "Enter your mobile number or email." : "اكتب رقم جوالك أو بريدك." };
  }

  if (text.includes("@")) {
    const address = text.toLowerCase();
    if (!EMAIL.test(address)) {
      return { ok: false, message: en ? "This email is not complete." : "البريد غير مكتمل. مثال: name@gmail.com" };
    }
    return { ok: true, kind: "email", address, shown: address };
  }

  // The international form carries its own country code, whatever the list says.
  const western = toWesternDigits(text).replace(/[\s-]/g, "");
  let dialCode = dial;
  let national = western;
  const intl = western.startsWith("+") ? western.slice(1) : western.startsWith("00") ? western.slice(2) : null;
  if (intl !== null) {
    const match = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => intl.startsWith(c.dial));
    if (!match) {
      return {
        ok: false,
        message: en
          ? "This country code is not on the list yet. Choose one from the list and type your number without it."
          : "مفتاح هذه الدولة ليس في القائمة بعد. اختر من القائمة واكتب رقمك بدونه.",
      };
    }
    dialCode = match.dial;
    national = intl.slice(match.dial.length);
  }

  const phone = toE164(dialCode, national, locale);
  if (!phone.ok) return phone;
  return { ok: true, kind: "phone", address: phoneToEmail(phone.e164), e164: phone.e164, shown: phone.display };
}

/** Any origin that is not ours, so that "still here?" can be asked of the browser's own reading of a path. */
const PROBE_ORIGIN = "https://sudagri.invalid";

/**
 * Where to go after signing in, when the visitor came from somewhere.
 *
 * Only a path on this site: "/lands/new", never "//evil.example" or
 * "https://…", which would make the sign-in page a doorway to anywhere.
 *
 * The one check, for the sign-in screen and the emailed links' callback alike (audit 3 November 2026,
 * web-client-1 / auth-actions-1; the owner's question 13). The first version looked at the first two characters, and
 * the browser reads more than that: it drops a tab or a newline anywhere in an address and turns "\" into "/", so
 * "/<tab>/evil.example" passed as a path and opened as "//evil.example" — another site, reached from a link that really
 * began with our address. So control characters and backslashes are refused outright, and what is left is read the
 * way a browser reads it and must still be on this site.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (value.length > 300) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/signup")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The header the proxy puts on every request it passes on: the path and query the visitor asked for, so a page or a
 * server action that sends someone to sign in can say where to bring them back (`loginHrefHere` in @/lib/loginHere;
 * web-flows-8). The proxy sets it over anything the visitor sent, and it is read through `safeNext` like any other
 * return path.
 */
export const REQUEST_PATH_HEADER = "x-sudagri-path";

/** The sign-in screen, coming back to `path` afterwards. */
export function loginTo(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/**
 * The sign-in link for a page in the browser, from its own path (`usePathname()`): back to that page afterwards, or
 * plain on the sign-in and sign-up screens themselves, where there is nothing to come back to.
 */
export function signInFrom(pathname: string | null): string {
  if (!pathname || pathname.startsWith("/login") || pathname.startsWith("/signup")) return "/login";
  return loginTo(pathname);
}

/**
 * An investor's way in from an opportunity: a new account with «أستثمر»
 * already chosen, back to `path` after. Someone with an account signs in from
 * the same screen («لي حساب»), so one link serves both.
 */
export function investorSignupTo(path: string): string {
  return `/signup?as=investor&next=${encodeURIComponent(path)}`;
}

/**
 * Where someone already signed in lands when they open the sign-in screen with
 * nowhere to return to: the farmer at their lands, the investor at their
 * portfolio — as after signing in (homeAfterAuth in app/login/actions.ts).
 */
export async function homeFor(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role === "farmer" ? "/lands" : "/dashboard";
}
