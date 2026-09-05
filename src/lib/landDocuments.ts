/**
 * أنواعُ مستندات الأرض — قائمةٌ لا إجراء.
 *
 * WHY THIS LIVES HERE AND NOT BESIDE THE ACTION THAT USES IT
 *
 * It used to be `export const LAND_DOCUMENT_KINDS` inside
 * `app/lands/documents/actions.ts`, which begins with `"use server"`. A
 * `"use server"` module may export **async functions and nothing else**: every
 * export becomes a callable server reference, so a plain array does not survive
 * the boundary. The client component that imported it received something that
 * was not an array, and calling `.map` on it threw.
 *
 * The failure was invisible for as long as the platform had no land. The
 * component renders once per plot, `lands.map` produced nothing while the table
 * was empty, and so the first plot ever registered was also the first render —
 * and `/lands` returned 500 for the farmer who had just registered it, which is
 * the worst possible moment for this page to break.
 *
 * `scripts/verify-server-module-exports.ts` now fails the build on the pattern.
 */
export interface LandDocumentKind {
  value: string;
  label: string;
}

export const LAND_DOCUMENT_KINDS: LandDocumentKind[] = [
  { value: "tenure", label: "إثبات حيازة أو عقد إيجار" },
  { value: "photo", label: "صورة للأرض" },
  { value: "permit", label: "تصريح أو موافقة" },
  { value: "inspection", label: "تقرير معاينة" },
];
