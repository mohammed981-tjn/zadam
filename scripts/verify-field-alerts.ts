/**
 * التنبيهاتُ الحقليّة: يصل الخبرُ الجديد مرّةً، ولا يصل القديم، ولا يصل ما بَعُد.
 *
 * Pins lib/fieldAlerts on what the daily job decides: a sighting inside a
 * day's flight of the land makes one notification naming the nearest; the
 * same sighting the next day makes none; a disease event in the land's state
 * reaches its owner once, however many lands they have there.
 */
import type { DiseaseEvent } from "../src/lib/animalDisease";
import type { LocustSighting } from "../src/lib/locust";
import {
  DISEASE_ALERT_DAYS,
  diseaseAlerts,
  diseaseKey,
  isoDaysBefore,
  locustAlerts,
  locustKey,
  sentKey,
  type AlertLand,
} from "../src/lib/fieldAlerts";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const A = "a1000000-0000-0000-0000-0000000000a1";
const B = "b2000000-0000-0000-0000-0000000000b2";
// A land at Gedaref town, one in the same state without a place, and one by
// Wad Madani — over 200 km from every sighting below.
const lands: AlertLand[] = [
  { id: "l1", ownerId: A, name: "أرض القضارف", state: "القضارف", latitude: 14.03, longitude: 35.38 },
  { id: "l2", ownerId: A, name: "أرض الفاو", state: "القضارف", latitude: null, longitude: null },
  { id: "l3", ownerId: B, name: "أرض الجزيرة", state: "الجزيرة", latitude: 14.4, longitude: 33.0 },
];

// ── الجراد ─────────────────────────────────────────────────────────────
const near: LocustSighting = { category: "ADULT", lat: 14.5, lng: 35.0, date: "2026-10-15", place: "SHOWAK", country: "Sudan" };
const nearer: LocustSighting = { category: "HOPPER", lat: 14.1, lng: 35.4, date: "2026-10-12", place: "GEDAREF", country: "Sudan" };
const far: LocustSighting = { category: "SWARM", lat: 20.0, lng: 37.0, date: "2026-10-18", place: "TOKAR", country: "Sudan" };

let alerts = locustAlerts(lands, [near, nearer, far], new Set());
ok(alerts.length === 1 && alerts[0].recipient === A && alerts[0].kind === "locust_near", "locust: one alert, for the land within 150 km, to its owner");
ok(alerts[0].title.includes("«أرض القضارف»") && alerts[0].body.includes("GEDAREF"), "locust: it names the land and the nearest sighting");
ok(alerts[0].body.includes("الأخرى في دائرة 150 كم: 1"), "locust: the other new sighting nearby is counted");
ok(alerts[0].keys.length === 2 && !alerts[0].keys.some((k) => k.includes("20.000")), "locust: the swarm by Tokar, far beyond a day's flight, is not in it");
ok(alerts[0].link === "/tools/feasibility", "locust: it opens the study, where the box is");

const sentBoth = new Set(alerts[0].keys.map((k) => sentKey(A, k)));
ok(locustAlerts(lands, [near, nearer, far], sentBoth).length === 0, "locust: the next day, the same sightings send nothing");

const newer: LocustSighting = { ...near, date: "2026-10-19" };
alerts = locustAlerts(lands, [near, nearer, newer], sentBoth);
ok(alerts.length === 1 && alerts[0].keys.length === 1 && alerts[0].keys[0] === locustKey("l1", newer), "locust: a new sighting at the same place is news again");
ok(!alerts[0].body.includes("الأخرى"), "locust: and alone, nothing else is counted");

ok(locustAlerts([{ ...lands[0], ownerId: B }], [nearer], new Set([sentKey(A, locustKey("l1", nearer))])).length === 1,
  "locust: what A was told does not count as told to B");

// ── أمراض الماشية ──────────────────────────────────────────────────────
const today = "2026-10-20";
const ev = (id: string, disease: string, date: string, state: string | null, country = "Sudan"): DiseaseEvent => ({
  id, disease, lat: null, lng: null, locality: "", country, date, species: "", status: "", source: "", state,
});
const events = [
  ev("E1", "Peste des petits ruminants", "2026-09-30", "القضارف"),
  ev("E2", "Foot and mouth disease", "2026-08-01", "القضارف"),
  ev("E3", "Lumpy skin disease", isoDaysBefore(today, DISEASE_ALERT_DAYS + 1), "القضارف"),
  ev("E4", "Anthrax", "2026-10-01", "كسلا"),
  ev("E5", "Foot and mouth disease", "2026-10-02", null, "Ethiopia"),
];

let dis = diseaseAlerts(lands, events, new Set(), today);
const a = dis.find((d) => d.recipient === A);
ok(dis.length === 1 && !!a, "disease: one alert, only for the state with events (B's state has none)");
ok(a!.keys.length === 2 && a!.keys.includes(diseaseKey(events[0])) && a!.keys.includes(diseaseKey(events[1])),
  `disease: events in the last ${DISEASE_ALERT_DAYS} days only — the older one and another state's stay out`);
ok(a!.body.includes("«أرض القضارف»") && a!.body.includes("«أرض الفاو»"), "disease: both of A's lands in the state are named, in one notification");
ok(a!.body.indexOf("طاعون المجترّات الصغيرة") < a!.body.indexOf("الحمّى القلاعيّة"), "disease: newest first");
ok(a!.title.startsWith("أمراضُ ماشيةٍ") && a!.link === "/herds", "disease: two diseases, a plural title, and it opens /herds");
ok(a!.body.includes("EMPRES-i"), "disease: the source is named");

dis = diseaseAlerts(lands, events, new Set([sentKey(A, diseaseKey(events[1]))]), today);
ok(dis.length === 1 && dis[0].keys.length === 1 && dis[0].title === "طاعون المجترّات الصغيرة في ولاية القضارف",
  "disease: what was sent drops out, and one disease names itself in the title");
ok(diseaseAlerts(lands, events, new Set(dis[0].keys.concat(diseaseKey(events[1])).map((k) => sentKey(A, k))), today).length === 0,
  "disease: once all are sent, nothing more");
ok(diseaseAlerts(lands, [ev("E9", "Anthrax", "2026-11-05", "القضارف")], new Set(), today).length === 0,
  "disease: a date after today is not taken as news");

ok(diseaseKey(ev("", "Rabies", "2026-10-01", "القضارف")).startsWith("disease:Rabies|2026-10-01"), "keys: an event without an id is keyed by what it is");
ok(locustKey("l".repeat(300), near).length === 200, "keys: never longer than the column allows");
ok(isoDaysBefore("2026-03-01", 1) === "2026-02-28", "dates: a day before the first of March");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\nfield alerts: all checks passed");
