import type { Land } from "@/types/database";
import { tr, type Locale } from "@/lib/i18n";
import { boundaryOf } from "@/lib/landInput";

/**
 * The phone app's view of a land (backlog 203): the website's words for the same states, so «أراضيّ» in the app and
 * on the website say the same thing — in the language the app asked for (backlog 208).
 */

/** As src/app/lands/page.tsx labels a land's review. */
export const verificationLabel = (locale: Locale): Record<Land["verification"], string> => ({
  unverified: tr(locale, "غير محقّقة", "Unverified"),
  submitted: tr(locale, "قيد المراجعة", "Under review"),
  verified: tr(locale, "محقّقة", "Verified"),
  rejected: tr(locale, "مرفوضة", "Rejected"),
});

/** As src/components/LandForm.tsx names the tenure. */
export const tenureLabel = (locale: Locale): Record<Land["tenure"], string> => ({
  owned: tr(locale, "ملك", "Owned"),
  leased: tr(locale, "إيجار أو حكر", "Leased or hikr"),
  communal: tr(locale, "أرض مشاع أو قبلية", "Communal or tribal land"),
  unspecified: tr(locale, "غير محدّد", "Not specified"),
});

/** The corners as drawn in the app, when there are enough of them, and the feddans they enclose to two places. */
export function drawnBoundary(land: Pick<Land, "boundary">): { corners: [number, number][]; feddans: number | null } | null {
  const drawn = land.boundary && land.boundary.length >= 3 ? land.boundary : null;
  if (!drawn) return null;
  const shape = boundaryOf(drawn.map(([lat, lng]) => ({ lat, lng })));
  return { corners: drawn, feddans: shape ? Math.round(shape.feddans * 100) / 100 : null };
}
