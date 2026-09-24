/**
 * The /nafir pages and the database must agree on every closed list: a state
 * the form offers but the check refuses is a form that always fails, and a
 * kind the database allows but the page cannot label renders as a raw key.
 * This reads the migration and compares.
 */
import { readFileSync } from "node:fs";
import {
  FAZA_CAUSES,
  FAZA_NEEDS,
  JUDIYYA_KINDS,
  NAFIR_KINDS,
  PULSE_QUESTIONS,
  SUDAN_STATES,
  ageAr,
  currentPeriod,
  tomorrowIso,
} from "../src/lib/nafir";

const sql = readFileSync("supabase/migrations/20260925090000_nafir_values_at_work.sql", "utf8");
let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const list = (re: RegExp) => [...(sql.match(re)?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

console.log("\nالقوائم المغلقة:");
ok(same([...SUDAN_STATES], list(/select s = any \(array\[([\s\S]*?)\]\)/)), "الولايات الثماني عشرة نفسها في الصفحة والقاعدة");
ok(SUDAN_STATES.length === 18, "ثماني عشرة ولاية");
ok(same(Object.keys(NAFIR_KINDS), list(/kind\s+text not null check \(kind in \(([^)]*)\)\),\n\s+title\s+text not null check \(length\(btrim\(title\)\) between 5 and 120\),\n\s+description/)), "أنواع النفير");
ok(same(Object.keys(FAZA_CAUSES), list(/cause\s+text not null check \(cause in \(([^)]*)\)\)/)), "أسباب الفزعة");
ok(same(Object.keys(FAZA_NEEDS), list(/needs <@ array\[([^\]]*)\]/)), "أنواع العون");
ok(!Object.keys(FAZA_NEEDS).includes("cash"), "ولا مال بينها");
{
  const j = readFileSync("supabase/migrations/20260925120000_judiyya.sql", "utf8");
  const kinds = [...(j.match(/kind\s+text not null check \(kind in \(([^)]*)\)\)/)?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
  ok(same(Object.keys(JUDIYYA_KINDS), kinds), "أنواع نزاعات الجودية");
}
ok(PULSE_QUESTIONS.every((q) => sql.includes(`${q.key}  `) || sql.includes(`${q.key} `)), "أعمدة نبض الثقة موجودة");

console.log("\nالأزمنة:");
const d = (iso: string) => new Date(iso).getTime();
ok(currentPeriod(new Date("2026-09-24T10:00:00Z")) === "2026-Q3", "سبتمبر في الربع الثالث");
ok(currentPeriod(new Date("2026-01-01T00:00:00Z")) === "2026-Q1", "يناير في الأوّل");
ok(ageAr("2026-09-24T08:00:00Z", d("2026-09-24T20:00:00Z")) === "اليوم", "اليوم");
ok(ageAr("2026-09-10T08:00:00Z", d("2026-09-24T20:00:00Z")).includes("يوماً"), "وأكثر من عشرة أيام بالتمييز المنصوب");
ok(tomorrowIso(d("2026-09-24T20:00:00Z")) === "2026-09-25", "والغد بعد اليوم");

if (fail) {
  console.error(`\n${fail} فشل`);
  process.exit(1);
}
console.log("\nكلّها ناجحة");
