/**
 * أمراض الماشية من الفاو (EMPRES-i): ما يقرؤه القارئ هو ما كتبته الفاو، والولاية
 * لا تُخمَّن، والمسافة من الأرض محسوبة.
 *
 * FAO's query endpoint answered CSV with these columns on 20 October 2026; the
 * rows below are copied from that answer (Sudan, and Libya next door).
 */
import { countryName, diseaseName, groupEvents, parseDiseaseEvents, stateOfLocality, watchPlaces } from "../src/lib/animalDisease";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const csv = [
  "global_id,disease,lat,lon,locality,country,event_date,species_overview_list,diagnosis_status,diagnosis_source",
  'UNFAO-LEG-414677,East Coast fever,13.8491,35.0731,164572AL GADAREF,Sudan,2025-05-10,Domestic - Cattle,Confirmed,WOAH (former OIE)',
  'UNFAO-LEG-392790,Influenza - Equine,11.3425,25.482,"144909 ASALAM LOCALITY & BILAIL LOCALITY ",Sudan,2024-03-31,Domestic - Equidae,Confirmed,WOAH (former OIE)',
  "X-1,Foot and mouth disease,32.9,13.2,TRIPOLI,Libya,2026-09-19,Domestic - Cattle,Confirmed,WOAH (former OIE)",
  "X-2,Peste des petits ruminants,,,KUFRA,Libya,2026-06-30,Domestic - Sheep,Confirmed,WOAH (former OIE)",
  "X-3,Anthrax,4.8,31.6,JUBA,South Sudan,not-a-date,Domestic - Cattle,Confirmed,",
].join("\n");
const events = parseDiseaseEvents(csv);

ok(events.length === 4, "a row without a date is dropped, the rest kept");
ok(events[0].state === "القضارف", "«164572AL GADAREF» is Gedaref");
ok(events[1].state === null, "a locality that names no state stays without one — not guessed");
ok(events[2].state === null, "a state is only looked for in Sudan");
ok(events[3].lat === null && events[3].lng === null, "an event without coordinates keeps no position");
ok(stateOfLocality("WAD MEDANI, AL JAZIRA") === "الجزيرة" && stateOfLocality("Nyala town") === "جنوب دارفور", "other spellings: Wad Medani and Nyala");

const groups = groupEvents(events);
ok(groups[0].country === "Sudan" && groups.length === 4, "one line per country and disease, Sudan first");
ok(groups.find((g) => g.disease === "East Coast fever")!.states.join() === "القضارف", "and the Sudanese states named in it");

const watch = watchPlaces(
  [
    { name: "أرض القضارف", state: "القضارف", latitude: 14.05, longitude: 35.4 },
    { name: "أرض الخرطوم", state: "الخرطوم", latitude: null, longitude: null },
  ],
  events,
);
ok(watch[0].inState.length === 1 && watch[0].inState[0].disease === "East Coast fever", "the Gedaref land is warned of its state's event");
ok(watch[0].nearest !== null && watch[0].nearest.disease === "East Coast fever" && watch[0].nearest.km < 50, "and its nearest event is that one, a few dozen km away");
ok(watch[1].inState.length === 0 && watch[1].nearest === null, "a land without coordinates gets no distance, and no event in its state is none");

ok(diseaseName("Foot and mouth disease", "ar") === "الحمّى القلاعيّة" && diseaseName("Peste des petits ruminants", "ar") === "طاعون المجترّات الصغيرة", "the two diseases the owner named, in Arabic");
ok(diseaseName("Something New", "ar") === "Something New" && countryName("Libya", "ar") === "ليبيا", "an unknown disease keeps FAO's word; countries in Arabic");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
