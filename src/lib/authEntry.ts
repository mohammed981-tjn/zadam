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

/**
 * Where to go after signing in, when the visitor came from somewhere.
 *
 * Only a path on this site: "/lands/new", never "//evil.example" or
 * "https://…", which would make the sign-in page a doorway to anywhere.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.length > 300 || /[\r\n]/.test(value)) return null;
  if (value.startsWith("/login") || value.startsWith("/signup")) return null;
  return value;
}

/** The sign-in screen, coming back to `path` afterwards. */
export function loginTo(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
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
