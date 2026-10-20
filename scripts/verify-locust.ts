/**
 * رصد الجراد من الفاو: ما يقرؤه القارئ هو ما كتبته الفاو، ولا يُسقط شيئاً بصمت.
 *
 * FAO's query endpoint answers CSV. These checks pin the parser on the shape it
 * returned on 20 October 2026 (category,n,last_date and location_name first for
 * the places), on quoted fields, and on what is refused rather than shown.
 */
import { LOCUST_ALERT_KM, distanceKm, isGregarious, locustDay, locustLabel, nearestSighting, parseCsv, parseLocustCounts, parseLocustPlaces, parseLocustSightings } from "../src/lib/locust";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

// As FAO answered for Sudan, the twelve months to 20 October 2026.
const counts = parseLocustCounts("category,n,last_date\r\nNO LOCUST,1551,2026-09-26\r\nADULT,125,2026-07-13\r\nHOPPER,3,2025-11-09\r\n");
ok(counts.length === 3 && counts[0].category === "NO LOCUST" && counts[0].count === 1551 && counts[0].lastDate === "2026-09-26", "counts: FAO's CSV is read as written");
ok(!counts.some((c) => isGregarious(c.category)), "counts: no band or swarm in that answer");

const places = parseLocustPlaces('location_name,category,n,last_date\n"WADI, EAST",ADULT,4,2026-07-13\nKARIMA,HOPPER,1,2025-11-09\n');
ok(places.length === 2 && places[0].place === "WADI, EAST" && places[0].count === 4, "places: a quoted name with a comma stays one field");

ok(parseLocustCounts("category,n,last_date\nADULT,many,2026-07-13\nSWARM,2,13/07/2026\n").length === 0, "counts: a count that is not a whole number or a date not YYYY-MM-DD is dropped");
ok(parseLocustCounts("").length === 0 && parseLocustCounts("category,n,last_date\n").length === 0, "counts: an empty answer is nothing, not a zero");
ok(parseCsv('a,"b ""q"" c",d').flat().join("|") === 'a|b "q" c|d', "csv: doubled quotes inside a field");

ok(locustLabel("SWARM", "ar") === "أسراب" && locustLabel("SWARM", "en") === "Swarms", "labels: both languages");
ok(locustLabel("SOMETHING NEW", "ar") === "SOMETHING NEW", "labels: a category FAO adds later shows in FAO's own word");
ok(isGregarious("BAND") && isGregarious("SWARM") && !isGregarious("ADULT"), "bands and swarms are the gregarious phase");
ok(locustDay("2026-09-26", "ar") === "26 سبتمبر 2026" && locustDay("2026-07-13", "en") === "13 July 2026", "dates: the same text on server and browser");

// Near the land: FAO's sightings as they come, and the nearest one by great-circle distance.
const sightings = parseLocustSightings(
  "category,lat,lon,last_date,location_name,country_name\nADULT,18.958927,32.361322,2026-07-13,SHERRI,Sudan\nSWARM,15.6,36.16,2026-07-10,AROMA,Sudan\nHOPPER,,36.1,2026-07-09,NOWHERE,Sudan\nADULT,95,36.1,2026-07-09,BAD,Sudan\n",
);
ok(sightings.length === 2 && sightings[0].place === "SHERRI" && sightings[0].lng === 32.361322, "sightings: a row without coordinates or outside the globe is dropped");
ok(Math.abs(distanceKm(15, 32, 16, 32) - 111.19) < 0.1, "distance: one degree of latitude is about 111 km");
ok(distanceKm(15.6, 32.5, 15.6, 32.5) === 0, "distance: the same point is zero");
const khartoum = nearestSighting(15.6, 32.53, sightings);
ok(khartoum !== null && khartoum.place === "SHERRI" && khartoum.km > LOCUST_ALERT_KM, "from Khartoum the nearest is Sherri, beyond a day's flight");
const kassala = nearestSighting(15.45, 36.4, sightings);
ok(kassala !== null && kassala.place === "AROMA" && kassala.km <= LOCUST_ALERT_KM, "from Kassala the swarm at Aroma is within a day's flight: the alert");
ok(nearestSighting(15, 32, []) === null, "no sighting is no nearest, not a distance of zero");
ok(LOCUST_ALERT_KM === 150, "the alert distance is FAO's day of flight: 150 km");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
