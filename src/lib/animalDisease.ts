import { tr, type Locale } from "@/lib/i18n";
import { SUDAN_STATES } from "@/lib/nafir";
import { distanceKm, parseCsv } from "@/lib/locust";

/**
 * Livestock diseases reported in Sudan and next door (backlog 115: «تنبيه
 * بأمراض مثل الحمّى القلاعيّة وطاعون المجترّات الصغيرة في ولايته»).
 *
 * From FAO's EMPRES-i, read through FAO's public query endpoint — the same
 * table its Global Animal Disease Information System shows, and it carries
 * the events Sudan reports to WOAH (diagnosis_source «WOAH (former OIE)»).
 *
 * Licence: CC BY-NC-SA 4.0 — non-commercial. The owner confirmed on 20 October
 * 2026 that Sudagri is in a free trial and charges nothing; before any fee is
 * taken, FAO's permission is needed (the letter is in backlog 115). WAHIS
 * itself is not read: its terms forbid automated extraction without WOAH's
 * written permission.
 */

export const EMPRES_URL = "https://data.apps.fao.org/catalog/dataset/major-diseases-by-date-empres-i";
export const EMPRES_LICENCE = "CC BY-NC-SA 4.0";

/** Sudan and the seven countries on its borders, in EMPRES-i's spelling. */
export const NEIGHBOURS = ["Sudan", "South Sudan", "Egypt", "Libya", "Chad", "Central African Republic", "Ethiopia", "Eritrea"] as const;

const ENDPOINT = "https://api.data.apps.fao.org/api/v2/bigquery?query=";
const VIEW = "`fao-empresi.unfao_empresi_data_products.vw_hih_data_catalog_main_diseases_public`";

export const EVENTS_SQL = `SELECT global_id, disease, lat, lon, locality, country, IFNULL(observation_date, report_date) AS event_date, species_overview_list, diagnosis_status, diagnosis_source FROM ${VIEW} WHERE country IN (${NEIGHBOURS.map((c) => `'${c}'`).join(",")}) AND IFNULL(observation_date, report_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) ORDER BY event_date DESC LIMIT 500`;

export interface DiseaseEvent {
  id: string;
  disease: string;
  lat: number | null;
  lng: number | null;
  locality: string;
  country: string;
  date: string;
  species: string;
  status: string;
  source: string;
  /** The Sudanese state named in the locality, when one is. */
  state: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * EMPRES-i writes places in English, often with a code in front
 * ("164572AL GADAREF"). Each state's spellings as they occur; a locality that
 * names none stays without a state rather than being guessed.
 */
const STATE_SPELLINGS: Record<(typeof SUDAN_STATES)[number], string[]> = {
  "الخرطوم": ["KHARTOUM", "OMDURMAN", "BAHRI"],
  "الجزيرة": ["GEZIRA", "GEZERA", "JAZIRAH", "AL JAZIRA", "WAD MADANI", "WAD MEDANI"],
  "سنار": ["SENNAR", "SINNAR", "SINJA", "SINGA"],
  "النيل الأزرق": ["BLUE NILE", "DAMAZIN", "ROSEIRES"],
  "النيل الأبيض": ["WHITE NILE", "KOSTI", "RABAK"],
  "القضارف": ["GEDAREF", "GADAREF", "GADARIF", "GEDARIF", "QADARIF", "AL QADARIF"],
  "كسلا": ["KASSALA"],
  "البحر الأحمر": ["RED SEA", "PORT SUDAN"],
  "نهر النيل": ["RIVER NILE", "NILE STATE", "ATBARA", "ED DAMER", "SHENDI"],
  "الشمالية": ["NORTHERN STATE", "DONGOLA"],
  "شمال كردفان": ["NORTH KORDOFAN", "EL OBEID", "AL UBAYYID"],
  "جنوب كردفان": ["SOUTH KORDOFAN", "KADUGLI"],
  "غرب كردفان": ["WEST KORDOFAN", "EL FULA", "ALFULA"],
  "شمال دارفور": ["NORTH DARFUR", "EL FASHER", "AL FASHIR"],
  "جنوب دارفور": ["SOUTH DARFUR", "NYALA"],
  "شرق دارفور": ["EAST DARFUR", "ED DAEIN", "EDDAEIN"],
  "غرب دارفور": ["WEST DARFUR", "GENEINA"],
  "وسط دارفور": ["CENTRAL DARFUR", "ZALINGEI", "ZALINGI"],
};

export function stateOfLocality(locality: string): string | null {
  const text = ` ${locality.toUpperCase().replace(/[^A-Z]+/g, " ")} `;
  for (const [state, names] of Object.entries(STATE_SPELLINGS)) {
    if (names.some((n) => text.includes(` ${n} `) || text.includes(n.replace(/ /g, "")))) return state;
  }
  return null;
}

export function parseDiseaseEvents(text: string): DiseaseEvent[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const out: DiseaseEvent[] = [];
  for (const r of body) {
    const row = Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()]));
    if (!row.disease || !row.country || !ISO_DAY.test(row.event_date ?? "")) continue;
    const lat = row.lat === "" ? NaN : Number(row.lat);
    const lng = row.lon === "" ? NaN : Number(row.lon);
    const located = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    out.push({
      id: row.global_id ?? "",
      disease: row.disease,
      lat: located ? lat : null,
      lng: located ? lng : null,
      locality: row.locality ?? "",
      country: row.country,
      date: row.event_date,
      species: row.species_overview_list ?? "",
      status: row.diagnosis_status ?? "",
      source: row.diagnosis_source ?? "",
      state: row.country === "Sudan" ? stateOfLocality(row.locality ?? "") : null,
    });
  }
  return out;
}

const DISEASE_AR: Record<string, string> = {
  "Foot and mouth disease": "الحمّى القلاعيّة",
  "Peste des petits ruminants": "طاعون المجترّات الصغيرة",
  "Lumpy skin disease": "الجلد العقدي",
  "Rift Valley fever": "حمّى الوادي المتصدّع",
  "Sheep pox and goat pox": "جدري الضأن والماعز",
  "Contagious bovine pleuropneumonia": "ذات الرئة البقري المعدي",
  "East Coast fever": "حمّى الساحل الشرقي",
  Anthrax: "الجمرة الخبيثة",
  "African swine fever": "حمّى الخنازير الأفريقيّة",
  "African horse sickness": "طاعون الخيل الأفريقي",
  "Influenza - Avian": "إنفلونزا الطيور",
  "Influenza - Equine": "إنفلونزا الخيل",
  "Newcastle disease": "مرض نيوكاسل",
  Brucellosis: "البروسيلا (الحمّى المالطيّة)",
  Rabies: "داء الكلب",
  Bluetongue: "اللسان الأزرق",
  "Bovine babesiosis": "البابيزيا البقريّة",
  "Surra (Trypanosoma evansi)": "السُّرّة (المثقّبيات)",
  "Bovine tuberculosis": "السلّ البقري",
  Glanders: "الرعام",
  "MERS-CoV": "متلازمة الشرق الأوسط التنفّسيّة",
};

const COUNTRY_AR: Record<string, string> = {
  Sudan: "السودان",
  "South Sudan": "جنوب السودان",
  Egypt: "مصر",
  Libya: "ليبيا",
  Chad: "تشاد",
  "Central African Republic": "أفريقيا الوسطى",
  Ethiopia: "إثيوبيا",
  Eritrea: "إريتريا",
};

/** FAO's English when a name is not in the list — never a guessed translation. */
export const diseaseName = (d: string, locale: Locale) => (locale === "en" ? d : (DISEASE_AR[d] ?? d));
export const countryName = (c: string, locale: Locale) => (locale === "en" ? c : (COUNTRY_AR[c] ?? c));

export interface DiseaseGroup {
  country: string;
  disease: string;
  count: number;
  lastDate: string;
  states: string[];
}

/** One line per country and disease, Sudan first, newest first within it. */
export function groupEvents(events: DiseaseEvent[]): DiseaseGroup[] {
  const map = new Map<string, DiseaseGroup>();
  for (const e of events) {
    const k = `${e.country}|${e.disease}`;
    const g = map.get(k) ?? { country: e.country, disease: e.disease, count: 0, lastDate: e.date, states: [] };
    g.count++;
    if (e.date > g.lastDate) g.lastDate = e.date;
    if (e.state && !g.states.includes(e.state)) g.states.push(e.state);
    map.set(k, g);
  }
  return [...map.values()].sort(
    (a, b) => Number(b.country === "Sudan") - Number(a.country === "Sudan") || b.lastDate.localeCompare(a.lastDate),
  );
}

export interface PlaceWatch {
  land: string;
  state: string;
  /** Events in Sudan whose locality names this land's state. */
  inState: DiseaseEvent[];
  /** The nearest located event anywhere in the window, with its distance; null without coordinates or events. */
  nearest: (DiseaseEvent & { km: number }) | null;
}

export function watchPlaces(
  lands: { name: string; state: string; latitude: number | null; longitude: number | null }[],
  events: DiseaseEvent[],
): PlaceWatch[] {
  return lands.map((l) => {
    let nearest: (DiseaseEvent & { km: number }) | null = null;
    if (l.latitude !== null && l.longitude !== null) {
      for (const e of events) {
        if (e.lat === null || e.lng === null) continue;
        const km = distanceKm(l.latitude, l.longitude, e.lat, e.lng);
        if (!nearest || km < nearest.km) nearest = { ...e, km };
      }
    }
    return { land: l.name, state: l.state, inState: events.filter((e) => e.state === l.state), nearest };
  });
}

/**
 * Cached for a day: events reach EMPRES-i weeks after they happen, so an hour
 * changes nothing. Null when FAO cannot be reached — the box then says so.
 */
export async function fetchDiseaseEvents(): Promise<DiseaseEvent[] | null> {
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(EVENTS_SQL), { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.error("animal disease: FAO answered", res.status);
      return null;
    }
    return parseDiseaseEvents(await res.text());
  } catch (e) {
    console.error("animal disease: FAO request failed", e);
    return null;
  }
}

export const sourceNote = (locale: Locale) =>
  tr(
    locale,
    `المصدر: الفاو، نظام EMPRES-i (رخصة ${EMPRES_LICENCE}، للاستخدام غير التجاريّ)، ويشمل ما أبلغ به السودان المنظّمةَ العالميّة لصحّة الحيوان.`,
    `Source: FAO EMPRES-i (licence ${EMPRES_LICENCE}, non-commercial use), including what Sudan reported to WOAH.`,
  );
