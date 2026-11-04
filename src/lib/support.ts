/**
 * The support line (owner, 3 November 2026: «زرّ واتساب بساعات معلنة»; audit product-maturity-11, web-flows-5).
 *
 * The number and the hours are set by the owner in the deployment's environment, not written in the code:
 *   SUPPORT_WHATSAPP   the WhatsApp number in international form, digits only (e.g. 2499…); a "+" or spaces are dropped
 *   SUPPORT_HOURS_AR   the hours, as the Arabic page shows them (e.g. «من السبت إلى الخميس، ٩ صباحاً – ٥ مساءً»)
 *   SUPPORT_HOURS_EN   the same in English
 * With no number set, nothing is shown: a button that leads nowhere is worse than none.
 */
export interface SupportLine {
  href: string;
  hours: { ar: string | null; en: string | null };
}

export function supportLine(): SupportLine | null {
  const digits = (process.env.SUPPORT_WHATSAPP ?? "").replace(/[^\d]/g, "");
  // An international number is 8 to 15 digits (E.164).
  if (digits.length < 8 || digits.length > 15) return null;
  return {
    href: `https://wa.me/${digits}`,
    hours: {
      ar: process.env.SUPPORT_HOURS_AR?.trim() || null,
      en: process.env.SUPPORT_HOURS_EN?.trim() || null,
    },
  };
}
