/**
 * موقع الأرض (BUG-13 وMAP-3، البند ١٦٢): داخل السودان، وعكس الرقمين يُنبَّه إليه، واللصق يُفهم.
 *
 *   npx tsx scripts/verify-land-location.ts
 */
import { locationMessage, locationProblem, parseCoordinates } from "../src/lib/landLocation";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

console.log("داخل السودان:");
const inside: [string, number, number][] = [
  ["الخرطوم", 15.6, 32.5], ["بورتسودان", 19.6, 37.2], ["حلايب", 22.2, 36.6], ["دنقلا", 19.17, 30.48],
  ["وادي حلفا", 21.8, 31.35], ["الجنينة", 13.45, 22.45], ["القضارف", 14.03, 35.38], ["كوستي", 13.17, 32.66],
  ["الدمازين", 11.79, 34.36], ["نيالا", 12.05, 24.88],
];
for (const [name, lat, lng] of inside) ok(locationProblem(lat, lng) === null, `${name} (${lat}, ${lng})`);

console.log("\nخارجه:");
ok(locationProblem(4.85, 31.6) === "outside_sudan", "جوبا (جنوب الحدود) خارج");
ok(locationProblem(30.04, 31.23) === "outside_sudan", "القاهرة خارج");
ok(locationProblem(0, 0) === "outside_sudan", "(٠، ٠) في المحيط خارج");
ok(locationProblem(9.0, 38.7) === "outside_sudan", "أديس أبابا خارج");

console.log("\nالمعكوس والناقص والمستحيل:");
ok(locationProblem(32.5, 15.6) === "swapped", "الخرطوم بالعكس (٣٢٫٥ ثمّ ١٥٫٦): يُنبَّه إلى العكس");
ok(locationProblem(15.6, null) === "incomplete" && locationProblem(null, 32.5) === "incomplete", "رقمٌ واحد: ناقص");
ok(locationProblem(null, null) === null, "لا رقمَ ولا رقم: الموقع اختياريّ عند التسجيل");
ok(locationProblem(95, 32) === "range" && locationProblem(15, 200) === "range" && locationProblem(NaN, 32) === "range", "خارج النطاق الممكن");

console.log("\nاللصق:");
const eq = (text: string, lat: number, lng: number) => {
  const p = parseCoordinates(text);
  return !!p && Math.abs(p.lat - lat) < 1e-9 && Math.abs(p.lng - lng) < 1e-9;
};
ok(eq("15.6, 32.5", 15.6, 32.5), "رقمان بفاصلة");
ok(eq("15.6 32.5", 15.6, 32.5), "رقمان بمسافة");
ok(eq("15.60123;32.50456", 15.60123, 32.50456), "رقمان بفاصلة منقوطة");
ok(eq("https://www.google.com/maps/@15.6012,32.5045,15z", 15.6012, 32.5045), "رابط خرائط جوجل بعد @");
ok(eq("https://maps.google.com/?q=15.6012,32.5045", 15.6012, 32.5045), "ورابطٌ بعد q=");
ok(eq("١٥٫٦، ٣٢٫٥", 15.6, 32.5), "وبالأرقام العربيّة والفاصلة العربيّة");
ok(eq("-15.5, 32", -15.5, 32), "والسالب");
ok(parseCoordinates("بلا أرقام") === null && parseCoordinates("") === null && parseCoordinates("15.6") === null, "ولا رقمَين: لا شيء");

console.log("\nالرسالة:");
const t = (ar: string, _en: string) => ar;
ok(locationMessage("swapped", t).includes("عكستَ"), "رسالة العكس تقول ما حدث");
ok(locationMessage("outside_sudan", t).includes("خارج السودان"), "ورسالة الخارج");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
