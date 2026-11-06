import type { Land } from "@/types/database";
import { boundaryOf } from "@/lib/landInput";

/**
 * The phone app's view of a land (backlog 203): the website's words for the same states, so «أراضيّ» in the app and
 * on the website say the same thing.
 */

/** As src/app/lands/page.tsx labels a land's review. */
export const VERIFICATION_AR: Record<Land["verification"], string> = {
  unverified: "غير محقّقة",
  submitted: "قيد المراجعة",
  verified: "محقّقة",
  rejected: "مرفوضة",
};

/** As src/components/LandForm.tsx names the tenure. */
export const TENURE_AR: Record<Land["tenure"], string> = {
  owned: "ملك",
  leased: "إيجار أو حكر",
  communal: "أرض مشاع أو قبلية",
  unspecified: "غير محدّد",
};

/** The corners as drawn in the app, when there are enough of them, and the feddans they enclose to two places. */
export function drawnBoundary(land: Pick<Land, "boundary">): { corners: [number, number][]; feddans: number | null } | null {
  const drawn = land.boundary && land.boundary.length >= 3 ? land.boundary : null;
  if (!drawn) return null;
  const shape = boundaryOf(drawn.map(([lat, lng]) => ({ lat, lng })));
  return { corners: drawn, feddans: shape ? Math.round(shape.feddans * 100) / 100 : null };
}
