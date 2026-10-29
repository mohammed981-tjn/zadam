import { STATIONS } from "./agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "./risk";
import { locationMessage, locationProblem } from "./landLocation";

/**
 * تسجيل الأرض: ما يُفحص قبل أن تُكتب، للموقع ولتطبيق الجوّال معاً (البند ١٣٤).
 *
 * The website's form and the app's «حدّد أرضك» both end in the same row, so they are checked by the same code:
 * a farmer must not be able to save from the phone what the website would refuse.
 *
 * The app sends the land's boundary, walked with the phone's GPS or tapped on the map, rather than a typed area.
 * The area and the centre are worked out here from the corners, not taken from the phone, so the feddans on the
 * land's page are what the boundary encloses.
 */

export const TENURES = ["owned", "leased", "communal", "unspecified"] as const;

/** One feddan is 4,200.83 m² (the Egyptian–Sudanese feddan the platform uses throughout). */
export const M2_PER_FEDDAN = 4200.83;

export interface LandInput {
  name: string;
  state: string;
  feddans: number;
  stationKey: string;
  waterSource: string;
  tenure: string;
  latitude: number | null;
  longitude: number | null;
}

type T = (ar: string, en: string) => string;

/** The reason a land cannot be saved as given, in the reader's language; null when it can. */
export function landInputProblem(input: LandInput, t: T): string | null {
  if (!input.name || !input.state) {
    return t("اسم الأرض والولاية مطلوبان.", "The land name and state are required.");
  }
  if (!Number.isFinite(input.feddans) || input.feddans <= 0) {
    return t("أدخل مساحة صحيحة بالفدان.", "Enter a valid area in feddans.");
  }
  if (!STATIONS.some((s) => s.key === input.stationKey)) {
    return t("منطقة مناخية غير معروفة.", "Unknown climate zone.");
  }
  if (!(input.waterSource in WATER_SOURCE_LABEL)) {
    return t("مصدر مياه غير معروف.", "Unknown water source.");
  }
  if (!(TENURES as readonly string[]).includes(input.tenure)) {
    return t("نوع حيازة غير معروف.", "Unknown tenure type.");
  }
  const problem = locationProblem(input.latitude, input.longitude);
  return problem ? locationMessage(problem, t) : null;
}

export const isWaterSource = (v: string): v is WaterSource => v in WATER_SOURCE_LABEL;

/** The climate station nearest a point (great-circle distance). */
export function nearestStation(lat: number, lng: number): string {
  const rad = Math.PI / 180;
  let best = STATIONS[0].key;
  let bestD = Infinity;
  for (const s of STATIONS) {
    const dLat = (s.latitude - lat) * rad;
    const dLng = (s.longitude - lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(s.latitude * rad) * Math.sin(dLng / 2) ** 2;
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    if (d < bestD) {
      bestD = d;
      best = s.key;
    }
  }
  return best;
}

export type Corner = { lat: number; lng: number };

/** Most corners a boundary may have: a walk records one every few metres, and the app thins it before sending. */
export const MAX_CORNERS = 500;

export interface Boundary {
  /** Area enclosed, m². */
  m2: number;
  feddans: number;
  /** The centre of the enclosed area. */
  centre: Corner;
}

/**
 * The area and centre of a field from its corners, in order around the edge.
 *
 * The corners are laid on a flat plane around their mean (an equirectangular projection), where the shoelace
 * formula applies. Over a field — even a scheme of thousands of feddans, a few kilometres across — the error of
 * that flattening is far below a GPS's own few metres. Null when the corners do not enclose an area: fewer than
 * three, a value outside the world, too many, or a line or a figure that crosses itself to nothing.
 */
export function boundaryOf(corners: Corner[]): Boundary | null {
  if (!Array.isArray(corners) || corners.length < 3 || corners.length > MAX_CORNERS) return null;
  if (!corners.every((c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180)) {
    return null;
  }
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const lat0 = corners.reduce((s, c) => s + c.lat, 0) / corners.length;
  const lng0 = corners.reduce((s, c) => s + c.lng, 0) / corners.length;
  const k = Math.cos(lat0 * rad);
  const xy = corners.map((c) => ({ x: (c.lng - lng0) * rad * R * k, y: (c.lat - lat0) * rad * R }));

  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const m2 = Math.abs(twice) / 2;
  if (m2 < 1) return null;
  cx /= 3 * twice;
  cy /= 3 * twice;
  return {
    m2,
    feddans: m2 / M2_PER_FEDDAN,
    centre: { lat: lat0 + cy / R / rad, lng: lng0 + cx / (R * k) / rad },
  };
}
