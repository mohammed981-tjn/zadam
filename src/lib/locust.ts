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
export async function fetchSudanLocust(): Promise<LocustSummary | null> {
  const [counts, places] = await Promise.all([query(COUNTS_SQL), query(PLACES_SQL)]);
  if (counts === null) return null;
  const parsed = parseLocustCounts(counts);
  if (!parsed.length) return null;
  return { counts: parsed, places: places === null ? [] : parseLocustPlaces(places) };
}
