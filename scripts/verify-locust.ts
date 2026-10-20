/**
 * رصد الجراد من الفاو: ما يقرؤه القارئ هو ما كتبته الفاو، ولا يُسقط شيئاً بصمت.
 *
 * FAO's query endpoint answers CSV. These checks pin the parser on the shape it
 * returned on 20 October 2026 (category,n,last_date and location_name first for
 * the places), on quoted fields, and on what is refused rather than shown.
 */
import { isGregarious, locustDay, locustLabel, parseCsv, parseLocustCounts, parseLocustPlaces } from "../src/lib/locust";

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

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
