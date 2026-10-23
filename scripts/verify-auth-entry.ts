/**
 * The one sign-in screen (backlog 142): one box reads a number or an email,
 * and the return address after signing in is a path on this site only.
 *
 *   npx tsx scripts/verify-auth-entry.ts
 *
 * The owner: «الدخول والتسجيل شاشةٌ واحدة، أمّا برقم جوال أو إيميل». The box
 * has to read what people actually type — a Sudanese number with or without
 * its zero, a Saudi number pasted as +966…, Arabic-Indic digits, an email in
 * capitals — into the same account the old two forms made, or the owner's own
 * account (+966 0508357833) stops opening.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readIdentifier, safeNext, loginTo } from "../src/lib/authEntry";
import { phoneToEmail } from "../src/lib/phoneIdentity";
import { nearLands } from "../src/lib/landNeighbours";

const root = join(__dirname, "..");
let failed = 0;
const check = (ok: boolean, label: string, why = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${why}`}`);
  if (!ok) failed++;
};
const address = (typed: string, dial: string) => {
  const r = readIdentifier(typed, dial);
  return r.ok ? r.address : `refused: ${r.message}`;
};

console.log("One box for a number or an email");
const owner = phoneToEmail("966508357833");
check(address("0508357833", "966") === owner, "the owner's number with Saudi chosen", address("0508357833", "966"));
check(address("+966 50 835 7833", "249") === owner, "and pasted as +966 with Sudan still chosen", address("+966 50 835 7833", "249"));
check(address("00966508357833", "249") === owner, "and as 00966", address("00966508357833", "249"));
check(address("٠٥٠٨٣٥٧٨٣٣", "966") === owner, "and in Arabic-Indic digits", address("٠٥٠٨٣٥٧٨٣٣", "966"));
const sudan = phoneToEmail("249912345678");
check(address("0912345678", "249") === sudan, "a Sudanese number with its zero", address("0912345678", "249"));
check(address("912345678", "249") === sudan, "and without it", address("912345678", "249"));
check(address("  Name@Gmail.COM ", "249") === "name@gmail.com", "an email in capitals, with spaces", address("  Name@Gmail.COM ", "249"));
check(!readIdentifier("name@gmail", "249").ok, "an email without its domain ending is refused");
check(!readIdentifier("09123", "249").ok, "a number too short is refused");
check(!readIdentifier("+7 912 345 6789", "249").ok, "a country code not on the list is refused, not guessed");
check(!readIdentifier("", "249").ok, "an empty box is refused");

console.log("\nWhere to go after signing in");
check(safeNext("/lands/new") === "/lands/new", "a path on the site");
check(safeNext("//evil.example/x") === null, "not another site written as //");
check(safeNext("https://evil.example") === null, "nor a full address");
check(safeNext("/\\evil.example") === null, "nor /\\");
check(safeNext("/login?next=/lands") === null, "nor the sign-in screen itself");
check(loginTo("/lands/new") === "/login?next=%2Flands%2Fnew", "loginTo writes the return path");

console.log("\n«سجّل أرضك» goes to the land form, not to sign-up");
const home = readFileSync(join(root, "src/app/page.tsx"), "utf8");
const rain = readFileSync(join(root, "src/app/rain/page.tsx"), "utf8");
check(!/href[=:]\s*["{]?\s*"\/signup"/.test(home), "the home page has no link to /signup", "a link still points there");
check(!/href="\/signup"/.test(rain), "nor the rain map");
const newLand = readFileSync(join(root, "src/app/lands/new/page.tsx"), "utf8");
check(newLand.includes('redirect(loginTo("/lands/new"))'), "and the land form signs a visitor in and comes back");

console.log("\nLands near another owner's (the review page's rule)");
const a = { id: "a", owner_id: "o1", name: "الجموعية", latitude: 15.301, longitude: 32.5, feddans: 180 };
const b = { id: "b", owner_id: "o2", name: "أرض سلمى", latitude: 15.3024, longitude: 32.5, feddans: 10 };
const c = { id: "c", owner_id: "o2", name: "بعيدة", latitude: 14.8, longitude: 32.5, feddans: 10 };
const d = { id: "d", owner_id: "o1", name: "الجموعية ٢", latitude: 15.303, longitude: 32.5, feddans: 5 };
const near = nearLands(b, [a, b, c, d]).map((n) => n.land.id);
check(JSON.stringify(near) === JSON.stringify(["d", "a"]), "Salma's land is near both of his (67 m, 156 m), nearest first, and not her own far one", near.join(","));
check(nearLands(a, [a, d]).length === 0, "his own second plot beside his first is not a dispute");

console.log("");
if (failed) {
  console.log(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — one box, one screen, and back to where you were going");
