/**
 * مواضيعُ قاعدة المعرفة — قائمةٌ لا إجراء.
 *
 * Moved out of `app/admin/analytics/promote.ts` for the same reason as
 * `LAND_DOCUMENT_KINDS`: that module begins with `"use server"`, and such a
 * module may export async functions and nothing else. A client component
 * importing this array from there receives a server reference, and `.map`
 * throws at render.
 *
 * That fault took `/lands` down in production the day the platform's first plot
 * was registered. This one had not fired yet only because `/admin/analytics`
 * renders `PromoteAnswer` behind an admin gate that had seen less traffic — the
 * bug was identical and waiting.
 */

/** The topics `knowledge_entries` accepts, mirroring its CHECK constraint. */
export const KNOWLEDGE_TOPICS = [
  "agronomy",
  "economics",
  "institutional",
  "livestock",
  "water",
  "soil",
  "pest",
  "variety",
  "technology",
  "general",
] as const;
