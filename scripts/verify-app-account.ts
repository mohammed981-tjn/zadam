/**
 * The app's «حسابي» held to the website it signs into (backlog 138).
 *
 *   npx tsx scripts/verify-app-account.ts
 *
 * The app shows its own list of country codes beside the number field, and the
 * website reads the number with its own (src/lib/phone.ts). A code the app
 * offers and the website does not know is a sign-in that fails with «اختر
 * مفتاح الدولة من القائمة» for a reason the person cannot see, so the two
 * lists must be the same list, in the same order — Sudan first.
 *
 * And the routes the app calls must exist where it calls them.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES } from "../src/lib/phone";

const root = join(__dirname, "..");
let failed = 0;
const check = (ok: boolean, label: string, why = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${why}`}`);
  if (!ok) failed++;
};

const dart = readFileSync(join(root, "mobile/lib/account.dart"), "utf8");
const block = /const dialCodes = <\(String, String\)>\[([\s\S]*?)\];/.exec(dart)?.[1] ?? "";
const app = [...block.matchAll(/\('(\d+)',\s*'([^']+)'\)/g)].map((m) => ({ dial: m[1], name: m[2] }));

console.log("Country codes");
check(app.length > 0, "the app's list was found", "dialCodes not found in mobile/lib/account.dart");
check(
  JSON.stringify(app.map((c) => c.dial)) === JSON.stringify(COUNTRIES.map((c) => c.dial)),
  `the app offers the website's ${COUNTRIES.length} codes in its order`,
  `app ${app.map((c) => c.dial).join(",")} vs site ${COUNTRIES.map((c) => c.dial).join(",")}`,
);
for (const c of app) {
  const site = COUNTRIES.find((s) => s.dial === c.dial);
  check(site?.name === c.name, `+${c.dial} is «${c.name}» in both`, `the website calls it «${site?.name}»`);
}

console.log("\nThe routes the app calls");
for (const path of ["/api/app/signin", "/api/app/signup", "/api/app/me", "/api/app/notifications/read"]) {
  check(dart.includes(`'${path}'`), `the app calls ${path}`, "not in mobile/lib/account.dart");
  check(existsSync(join(root, "src/app", path.slice(1), "route.ts")), `src/app${path}/route.ts exists`, "missing");
}

console.log("");
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — the app signs into the website's accounts by the website's rules");
