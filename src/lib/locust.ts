import { tr, type Locale } from "@/lib/i18n";

/**
 * What FAO's Desert Locust Information Service holds for Sudan (backlog 113).
 *
 * The locust risk in the feasibility study prices a plague by how often one
 * comes; this says what the survey teams actually reported in the last twelve
 * months. FAO serves its locust table through a public query endpoint
 * (api.data.apps.fao.org, BigQuery, CSV out, no key) — the same table its
 * Locust Hub map reads. Only what reached FAO is counted: a survey that was
 * never made is not a survey that found nothing, and the page says so.
 */

export const LOCUST_HUB_URL = "https://locust-hub-hqfao.hub.arcgis.com/";
export const LOCUST_DATA_URL = "https://data.apps.fao.org/catalog/dataset/desert-locusts-observations";

const ENDPOINT = "https://api.data.apps.fao.org/api/v2/bigquery?query=";
const TABLE = "`fao-maps.fao_locusts.vw_locusts_master`";
const WINDOW = "country_name = 'Sudan' AND start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)";

export const COUNTS_SQL = `SELECT category, COUNT(*) AS n, MAX(start_date) AS last_date FROM ${TABLE} WHERE ${WINDOW} GROUP BY category ORDER BY n DESC`;
export const PLACES_SQL = `SELECT location_name, category, COUNT(*) AS n, MAX(start_date) AS last_date FROM ${TABLE} WHERE ${WINDOW} AND category <> 'NO LOCUST' GROUP BY location_name, category ORDER BY last_date DESC LIMIT 6`;

/**
 * «تنبيه إذا رُصد جراد قرب أرضه» (البند ١١٥). FAO: «Desert Locust fly during
 * the day downwind for up to 150 km in a day» (fao.org/locusts) — so a
 * sighting within a day's flight of the land in the last thirty days is the
 * alert. The box reaches two degrees past Sudan's borders, where a swarm that
 * will cross tomorrow is recorded today.
 */
export const LOCUST_ALERT_KM = 150;
export const LOCUST_ALERT_DAYS = 30;
export const LOCUST_FLIGHT_SOURCE = "https://www.fao.org/locusts/en/";

export const NEARBY_SQL = `SELECT category, lat, lon, start_date AS last_date, location_name, country_name FROM ${TABLE} WHERE category <> 'NO LOCUST' AND start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${LOCUST_ALERT_DAYS} DAY) AND lat BETWEEN 1 AND 25 AND lon BETWEEN 19 AND 41 ORDER BY start_date DESC LIMIT 500`;

export interface LocustSighting {
  category: string;
  lat: number;
  lng: number;
  date: string;
  place: string;
  country: string;
}

export interface LandLocust {
  land: string;
  /** Null when no sighting reached FAO in the window. */
  nearest: (LocustSighting & { km: number }) | null;
}

export function parseLocustSightings(text: string): LocustSighting[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const out: LocustSighting[] = [];
  for (const r of body) {
    const row = Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()]));
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!row.category || !ISO_DAY.test(row.last_date ?? "") || !Number.isFinite(lat) || !Number.isFinite(lng) || row.lat === "" || row.lon === "") continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ category: row.category, lat, lng, date: row.last_date, place: row.location_name ?? "", country: row.country_name ?? "" });
  }
  return out;
}

/** Great-circle distance in km (haversine, mean earth radius 6,371 km). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestSighting(lat: number, lng: number, sightings: LocustSighting[]): (LocustSighting & { km: number }) | null {
  let best: (LocustSighting & { km: number }) | null = null;
  for (const s of sightings) {
    const km = distanceKm(lat, lng, s.lat, s.lng);
    if (!best || km < best.km) best = { ...s, km };
  }
  return best;
}

export interface LocustCount {
  category: string;
  count: number;
  lastDate: string;
}

export interface LocustPlace extends LocustCount {
  place: string;
}

export interface LocustSummary {
  counts: LocustCount[];
  places: LocustPlace[];
  /** Whether a farmer is signed in; the lands below are theirs. */
  signedIn: boolean;
  /** Their lands with coordinates, each with its nearest recent sighting; null when FAO's answer for this part failed. */
  lands: LandLocust[] | null;
}

const LABEL: Record<string, { ar: string; en: string }> = {
  "NO LOCUST": { ar: "مسحٌ لم يجد جراداً", en: "Surveys that found no locusts" },
  ADULT: { ar: "جرادٌ بالغ متفرّق", en: "Scattered adults" },
  HOPPER: { ar: "حوريّات (نطّاط)", en: "Hoppers" },
  BAND: { ar: "أشرطة حوريّات", en: "Hopper bands" },
  SWARM: { ar: "أسراب", en: "Swarms" },
};

/** FAO's own word when the category is one this table does not name. */
export const locustLabel = (category: string, locale: Locale) =>
  LABEL[category] ? tr(locale, LABEL[category].ar, LABEL[category].en) : category;

/** Bands and swarms are the gregarious phase — what a plague is made of. */
export const isGregarious = (category: string) => category === "BAND" || category === "SWARM";

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The same text on the server and in the browser, so the page hydrates cleanly. */
export function locustDay(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return locale === "en" ? `${d} ${EN_MONTHS[m - 1]} ${y}` : `${d} ${AR_MONTHS[m - 1]} ${y}`;
}

/** RFC 4180 enough for FAO's output: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Rows keyed by header; a row without a whole count and a day is dropped. */
function records(text: string): Record<string, string>[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  return body
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])))
    .filter((r) => r.category && /^\d+$/.test(r.n ?? "") && ISO_DAY.test(r.last_date ?? ""));
}

export function parseLocustCounts(text: string): LocustCount[] {
  return records(text).map((r) => ({ category: r.category, count: Number(r.n), lastDate: r.last_date }));
}

export function parseLocustPlaces(text: string): LocustPlace[] {
  return records(text)
    .filter((r) => r.location_name)
    .map((r) => ({ place: r.location_name, category: r.category, count: Number(r.n), lastDate: r.last_date }));
}

async function query(sql: string): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(sql), { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.error("locust: FAO answered", res.status);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error("locust: FAO request failed", e);
    return null;
  }
}

/**
 * Cached for a day: survey teams report daily, the risk does not move by the
 * hour. Null when FAO cannot be reached or answers with nothing readable — the
 * study then simply leaves this box out.
 */
export async function fetchSudanLocust(
  myLands: { name: string; latitude: number | null; longitude: number | null }[] | null = null,
): Promise<LocustSummary | null> {
  const located = (myLands ?? []).filter((l) => l.latitude !== null && l.longitude !== null);
  const [counts, places, nearby] = await Promise.all([
    query(COUNTS_SQL),
    query(PLACES_SQL),
    located.length ? query(NEARBY_SQL) : Promise.resolve(null),
  ]);
  if (counts === null) return null;
  const parsed = parseLocustCounts(counts);
  if (!parsed.length) return null;
  const sightings = nearby === null ? null : parseLocustSightings(nearby);
  return {
    counts: parsed,
    places: places === null ? [] : parseLocustPlaces(places),
    signedIn: myLands !== null,
    lands:
      located.length && sightings === null
        ? null
        : located.map((l) => ({ land: l.name, nearest: nearestSighting(l.latitude!, l.longitude!, sightings ?? []) })),
  };
}
