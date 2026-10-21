import { countryName, diseaseName, type DiseaseEvent } from "@/lib/animalDisease";
import { LOCUST_ALERT_KM, distanceKm, locustDay, locustLabel, type LocustSighting } from "@/lib/locust";

/**
 * التنبيهاتُ الحقليّة (البند ١١٥) — ما يُكتب لصاحب الأرض حين لا يفتح الصفحة.
 *
 * The feasibility study and /herds already show the farmer FAO's locust
 * sightings near their land and the disease events in their state, but only
 * when they open the page. A daily job (/api/field-alerts) runs these against
 * every land and writes a notification for what is new. Here is what counts as
 * new and what the notification says; the job only reads and writes.
 *
 * Each sighting and each event has a key, and the database keeps the keys a
 * person was told about (field_alerts_sent), so the same news never reaches
 * them twice — but a new sighting near the same land does.
 */

/**
 * How far back a disease event still makes an alert. EMPRES-i receives an
 * event weeks after it happens, so a window as short as the locust one would
 * miss most of them; past three months the advice to vaccinate and isolate
 * has outlived the news. A product choice, not a figure from FAO.
 */
export const DISEASE_ALERT_DAYS = 90;

/** Keys older than this cannot match anything the job reads, so it does not load them. */
export const SENT_LOOKBACK_DAYS = DISEASE_ALERT_DAYS + 30;

/** At most this many notifications per run, so a bad answer from FAO cannot flood every inbox. */
export const MAX_ALERTS_PER_RUN = 300;

export interface AlertLand {
  id: string;
  ownerId: string;
  name: string;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type AlertKind = "locust_near" | "animal_disease" | "stage_due";

export interface FieldAlert {
  recipient: string;
  kind: AlertKind;
  /** What this notification tells the person about; written to field_alerts_sent with it. */
  keys: string[];
  title: string;
  body: string;
  link: string;
}

const MAX_KEY = 200;
const clip = (k: string) => k.slice(0, MAX_KEY);

export const locustKey = (landId: string, s: LocustSighting) =>
  clip(`locust:${landId}:${s.date}:${s.lat.toFixed(3)},${s.lng.toFixed(3)}:${s.category}`);

/** Per event, not per land: a person with two lands in one state hears about it once. */
export const diseaseKey = (e: DiseaseEvent) => clip(`disease:${e.id || `${e.disease}|${e.date}|${e.locality}`}`);

/** How the job holds what was already sent: one set for everyone, keyed by person and key. */
export const sentKey = (recipient: string, key: string) => `${recipient}|${key}`;

const km0 = (v: number) => Math.round(v).toLocaleString("en-US");

/** The day `days` before an ISO day, as an ISO day. */
export function isoDaysBefore(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * One notification per land with a new sighting within a day's flight. It
 * names the nearest new one; the others are counted, not listed, because the
 * farmer's question is "how close", and the page has the rest.
 */
export function locustAlerts(lands: AlertLand[], sightings: LocustSighting[], sent: Set<string>): FieldAlert[] {
  const out: FieldAlert[] = [];
  for (const l of lands) {
    if (l.latitude === null || l.longitude === null) continue;
    const fresh = sightings
      .map((s) => ({ ...s, km: distanceKm(l.latitude!, l.longitude!, s.lat, s.lng), key: locustKey(l.id, s) }))
      .filter((s) => s.km <= LOCUST_ALERT_KM && !sent.has(sentKey(l.ownerId, s.key)))
      .sort((a, b) => a.km - b.km || b.date.localeCompare(a.date));
    if (!fresh.length) continue;
    const n = fresh[0];
    const where = n.place ? (n.country && n.country !== "Sudan" ? `${n.place}، ${countryName(n.country, "ar")}` : n.place) : countryName(n.country, "ar");
    const others = fresh.length - 1;
    out.push({
      recipient: l.ownerId,
      kind: "locust_near",
      keys: [...new Set(fresh.map((s) => s.key))],
      title: `جرادٌ على بعد ${km0(n.km)} كم من «${l.name}»`,
      body:
        `وصل إلى الفاو رصدٌ في ${where} يوم ${locustDay(n.date, "ar")}: ${locustLabel(n.category, "ar")}، على بعد ${km0(n.km)} كم من أرضك.` +
        (others > 0 ? ` وعددُ الرصود الجديدة الأخرى في دائرة ${LOCUST_ALERT_KM} كم: ${others}.` : "") +
        ` الفاو: يطير الجراد نهاراً مع الريح حتى ${LOCUST_ALERT_KM} كم في اليوم. بلّغ وقاية النباتات في ولايتك، وتفقّد الحقل صباحاً.`,
      link: "/tools/feasibility",
    });
  }
  return out;
}

/**
 * One notification per person and state with new events in Sudan whose place
 * names that state, in the last DISEASE_ALERT_DAYS. Up to five are named with
 * their dates; the rest are counted.
 */
export function diseaseAlerts(lands: AlertLand[], events: DiseaseEvent[], sent: Set<string>, today: string): FieldAlert[] {
  const since = isoDaysBefore(today, DISEASE_ALERT_DAYS);
  const groups = new Map<string, { owner: string; state: string; lands: string[] }>();
  for (const l of lands) {
    if (!l.state) continue;
    const k = `${l.ownerId}|${l.state}`;
    const g = groups.get(k) ?? { owner: l.ownerId, state: l.state, lands: [] };
    if (!g.lands.includes(l.name)) g.lands.push(l.name);
    groups.set(k, g);
  }

  const out: FieldAlert[] = [];
  for (const g of groups.values()) {
    const fresh = events
      .filter((e) => e.country === "Sudan" && e.state === g.state && e.date >= since && e.date <= today)
      .map((e) => ({ ...e, key: diseaseKey(e) }))
      .filter((e) => !sent.has(sentKey(g.owner, e.key)))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!fresh.length) continue;
    const names = [...new Set(fresh.map((e) => e.disease))];
    const shown = fresh.slice(0, 5).map((e) => `${diseaseName(e.disease, "ar")} (${locustDay(e.date, "ar")})`);
    const rest = fresh.length - shown.length;
    out.push({
      recipient: g.owner,
      kind: "animal_disease",
      keys: [...new Set(fresh.map((e) => e.key))],
      title: names.length === 1 ? `${diseaseName(names[0], "ar")} في ولاية ${g.state}` : `أمراضُ ماشيةٍ مُبلَّغٌ عنها في ولاية ${g.state}`,
      body:
        `وصل إلى الفاو عن ولاية ${g.state}: ${shown.join("، ")}` +
        (rest > 0 ? `، وغيرُها: ${rest}` : "") +
        `. أرضك هناك: ${g.lands.map((n) => `«${n}»`).join("، ")}.` +
        ` اتّصل بالطبيب البيطريّ في محليّتك أو بوزارة الثروة الحيوانيّة في الولاية عن التطعيم وعزل القطيع.` +
        ` المصدر: الفاو، نظام EMPRES-i.`,
      link: "/herds",
    });
  }
  return out;
}
