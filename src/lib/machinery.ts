/**
 * إيجار الجرّار والحجز الجماعيّ (البند ١٦٨).
 *
 * The database decides (supabase/migrations/20261025220000_machinery_availability_and_group_booking.sql): who may say
 * a provider is available, how old a confirmation may be before no booking opens on it, who joins, who sends, who
 * accepts. This file only words what the pages show, with the same number of days — scripts/verify-machinery.ts reads
 * the migration and fails if the two ever disagree.
 */

import type { Locale } from "@/lib/i18n";

/** How many days a provider's word stays good for a new booking (`machinery_fresh_days()` in the database). */
export const AVAILABILITY_FRESH_DAYS = 14;

export type Availability = "fresh" | "stale" | "off";

/** What a listing says about a mechanisation provider today: available and recently said so, said so long ago, or not available. */
export function availabilityState(
  available: boolean,
  confirmedAt: string | null,
  now: Date = new Date(),
): Availability {
  if (!available || !confirmedAt) return "off";
  const age = now.getTime() - new Date(confirmedAt).getTime();
  return age <= AVAILABILITY_FRESH_DAYS * 86_400_000 ? "fresh" : "stale";
}

/** «آخر تأكيدٍ للتوفّر: …» as a calendar day in Khartoum. */
export function confirmedLabel(confirmedAt: string, locale: Locale): string {
  return new Date(confirmedAt).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Khartoum",
  });
}

export const AVAILABILITY_LABEL: Record<Availability, { ar: string; en: string }> = {
  fresh: { ar: "متوفّر", en: "Available" },
  stale: {
    ar: `لم يؤكّد توفّره منذ أكثر من ${AVAILABILITY_FRESH_DAYS} يوماً — لا يُحجز حتى يؤكّد`,
    en: `Has not confirmed in over ${AVAILABILITY_FRESH_DAYS} days — no booking until they do`,
  },
  off: { ar: "غير متوفّر الآن", en: "Not available now" },
};

export type BookingStatus = "open" | "requested" | "accepted" | "declined" | "cancelled";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, { ar: string; en: string }> = {
  open: { ar: "مفتوح للانضمام", en: "Open to join" },
  requested: { ar: "أُرسل إلى مقدّم الخدمة", en: "Sent to the provider" },
  accepted: { ar: "قُبل — العقود سارية", en: "Accepted — contracts in force" },
  declined: { ar: "اعتذر مقدّم الخدمة", en: "Declined by the provider" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

/** How far a booking is from the provider's minimum, for the bar and the sentence under it. */
export function bookingProgress(total: number, minUnits: number): { pct: number; remaining: number; enough: boolean } {
  const t = Math.max(0, Number(total) || 0);
  const m = Math.max(0, Number(minUnits) || 0);
  if (m === 0) return { pct: 100, remaining: 0, enough: true };
  return { pct: Math.min(100, (t / m) * 100), remaining: Math.max(0, m - t), enough: t >= m };
}

/** One row of `machinery_bookings_list()`. */
export interface BookingRow {
  id: string;
  provider_id: string;
  provider_name: string;
  service_title: string;
  unit: string;
  unit_price: number;
  min_units: number;
  state: string;
  locality: string;
  window_from: string;
  window_to: string;
  status: BookingStatus;
  decline_reason: string | null;
  members: number;
  total: number;
  my_quantity: number | null;
  is_organiser: boolean;
  is_provider: boolean;
  created_at: string;
}
