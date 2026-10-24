import { insideSudan } from "@/lib/rainMap";

/**
 * موقع الأرض: داخل السودان، وخط العرض أوّلاً (BUG-13 وMAP-3، البند ١٦٢).
 *
 * كان الخادم يقبل أيّ رقمين بين ±٩٠ و±١٨٠، فتُسجَّل أرضٌ «في السودان» إحداثيّاتها في المحيط، أو برقمين
 * معكوسين (٣٢ ثمّ ١٥ بدل ١٥ ثمّ ٣٢). وعلى الموقع تقوم الأمطار والماء والتربة وأقرب سوق ومراجعة الإدارة.
 */

export type LocationProblem = "incomplete" | "range" | "outside_sudan" | "swapped";

/** ≈ 11 km: the border polygon is a drawn line, and a farm on the border is still Sudan's. */
const TOLERANCE_DEG = 0.1;

export function nearSudan(lat: number, lng: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (insideSudan([lng + dx * TOLERANCE_DEG, lat + dy * TOLERANCE_DEG])) return true;
    }
  }
  return false;
}

/** null when the pair is usable: both given, finite, in range and in (or on the edge of) Sudan. */
export function locationProblem(lat: number | null, lng: number | null): LocationProblem | null {
  if (lat === null && lng === null) return null;
  if (lat === null || lng === null) return "incomplete";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "range";
  if (nearSudan(lat, lng)) return null;
  // Longitude typed first: a latitude of 32 is not in Sudan, but 32 as a longitude is.
  if (Math.abs(lng) <= 90 && Math.abs(lat) <= 180 && nearSudan(lng, lat)) return "swapped";
  return "outside_sudan";
}

/**
 * Two coordinates out of what a person pastes: «15.6, 32.5», «15.6 32.5», a Google Maps link
 * («…@15.6,32.5,…» or «…?q=15.6,32.5»), digits in Arabic-Indic form. Latitude first, as everywhere
 * on the web; null when there are not two numbers.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const ascii = text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/،/g, ",");
  const link = /[@=](-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(ascii);
  const pair = link ?? /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(ascii);
  if (!pair) return null;
  const lat = Number(pair[1]);
  const lng = Number(pair[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function locationMessage(problem: LocationProblem, t: (ar: string, en: string) => string): string {
  switch (problem) {
    case "incomplete":
      return t("أدخل خطّ العرض وخطّ الطول معاً، أو اتركهما فارغين.", "Enter both latitude and longitude, or leave both empty.");
    case "range":
      return t("الإحداثيّات خارج النطاق الممكن.", "The coordinates are out of range.");
    case "swapped":
      return t(
        "يبدو أنّك عكستَ الرقمين: خطّ العرض يأتي أوّلاً (نحو ١٥ في الخرطوم)، ثمّ خطّ الطول (نحو ٣٢).",
        "It looks like the two numbers are swapped: latitude comes first (about 15 at Khartoum), then longitude (about 32).",
      );
    default:
      return t(
        "هذا الموقع خارج السودان. اضغط «حدّد موقعي» وأنت في الأرض، أو اختر نقطةً على الخريطة.",
        "That location is outside Sudan. Press “Use my location” while you are on the land, or pick a point on the map.",
      );
  }
}
