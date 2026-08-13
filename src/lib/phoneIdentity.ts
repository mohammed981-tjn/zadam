/**
 * Signing in by phone number without an SMS provider.
 *
 * Supabase's own phone provider cannot be turned on from the dashboard without
 * Twilio credentials — the form refuses to save with the SMS fields empty — and
 * every other provider in that list wants a third-party account too. Twilio also
 * cannot be relied on for Sudan: delivery there is subject to sanctions and
 * carrier restrictions that have to be confirmed with the provider rather than
 * assumed. So the platform cannot get phone sign-in from the provider list today
 * at any price, and waiting for one would mean going back to the email flow a
 * visitor already reported as a phishing attempt.
 *
 * What it can do is treat the number as the identifier it already is. The phone
 * is folded into an internal address and the account is created through the
 * email/password flow, which needs no provider at all. The user types their
 * number and a password, and never sees the address this produces.
 *
 * The domain is `.invalid`, which RFC 2606 reserves precisely so it can never
 * resolve. That matters more than it looks: if email confirmations are ever
 * switched back on, a confirmation for a number would be posted to whoever owns
 * the domain we picked. Under `.invalid` there is no such owner and can never
 * be one, so the failure mode is a bounce rather than a stranger receiving a
 * message about one of our users.
 *
 * Two things this deliberately does not claim. It is not verification — the
 * number is still what the user typed, and nothing may present it as confirmed.
 * And it is not a replacement for real phone auth: when an SMS route exists,
 * signup switches to it and these accounts are migrated by their stored number,
 * which is why the real E.164 value is written to the profile rather than left
 * to be parsed back out of the address.
 */

/** Reserved by RFC 2606 as permanently unresolvable. Never send mail here. */
const PHONE_DOMAIN = "phone.invalid";

/**
 * The internal address for an E.164 number.
 *
 * Prefixed with a letter because a local part that is all digits is what some
 * validators reject, and the prefix costs nothing.
 */
export function phoneToEmail(e164: string): string {
  return `p${e164.replace(/\D/g, "")}@${PHONE_DOMAIN}`;
}

/** True for an address this module minted, used to keep messages honest. */
export function isPhoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PHONE_DOMAIN}`);
}

/** The number back out of an internal address, for display and migration. */
export function emailToPhone(email: string): string | null {
  if (!isPhoneEmail(email)) return null;
  const digits = email.slice(1, email.indexOf("@")).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
