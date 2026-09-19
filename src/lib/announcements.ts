/**
 * شكلُ الخبر — نوعٌ لا إجراء.
 *
 * In `lib/` rather than beside the action for the reason
 * `scripts/verify-server-module-exports.ts` now enforces: a `"use server"`
 * module may export async functions and nothing else, and a shared shape is
 * not a function. `/lands` returned 500 in production the day that rule was
 * broken.
 */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  link_path: string | null;
  link_label: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** بالتقويم الميلاديّ العربيّ وبتوقيت الخرطوم — لا بتوقيت الخادم. */
export function announcementDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
