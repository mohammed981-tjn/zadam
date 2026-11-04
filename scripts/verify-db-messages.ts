/**
 * رسائل القاعدة الخام لا تصل القارئ (SEC-12، البند ١٦٣): ما كتبته المنصّة بالعربيّة يمرّ كما هو
 * (ويُترجم للإنجليزيّ)، وما كتبه Postgres وPostgREST بنفسيهما — أسماء الجداول والقيود والسياسات —
 * يُستبدل بجملةٍ ثابتة.
 *
 *   npx tsx scripts/verify-db-messages.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dbMessage, isPlatformMessage } from "../src/lib/dbMessages";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
console.warn = () => {}; // the withheld text goes to the server log; keep the output clean

const mine = "لا يمكن نشر مشروع قبل اعتماد المراجعة";
ok(dbMessage(mine, "ar") === mine, "an Arabic refusal of the platform passes in Arabic");
ok(dbMessage(mine, "en") === "A project cannot be published before its review is approved", "and is translated for English readers");
ok(isPlatformMessage("سجّل الدخول أولاً"), "«سجّل الدخول أولاً» is the platform's own");
ok(dbMessage("", "ar") === "", "an empty message stays empty (the caller has its own default)");

const raw = [
  'new row violates row-level security policy for table "investments"',
  'duplicate key value violates unique constraint "profiles_phone_key"',
  'permission denied for table role_changes',
  'null value in column "owner_id" of relation "lands" violates not-null constraint',
  'invalid input syntax for type uuid: "x"',
  'function public.nothing(integer) does not exist',
  'JWT expired',
  'not authorized',
  'Key (name)=(سوداقري) already exists. duplicate key value violates unique constraint "x"',
];
for (const m of raw) {
  const ar = dbMessage(m, "ar");
  const en = dbMessage(m, "en");
  ok(ar !== m && !/[a-z_]{4,}/i.test(ar) && ar.includes("تعذّر"), `withheld (ar): ${m.slice(0, 48)}…`);
  ok(en !== m && en.startsWith("The request could not"), `withheld (en): ${m.slice(0, 48)}…`);
}

ok(dbMessage("القيد غير متوازن: المدين 12.50 والدائن 10 دولار", "en") === "The entry does not balance: debit 12.50 and credit 10 dollars",
   "the most specific wording wins: a shorter one does not swallow the word after its last value");

// Every refusal the migrations raise in Arabic has its English (backlog 94): an English reader of a new feature must
// not meet the database's Arabic. A `%` is a value Postgres fills in; the English keeps as many.
const raised = new Map<string, string>();
for (const f of readdirSync("supabase/migrations").sort()) {
  const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
  for (const m of sql.matchAll(/raise\s+exception\s+'((?:[^']|'')*)'/gi)) {
    const msg = m[1].replace(/''/g, "'");
    if (/[\u0600-\u06FF]/.test(msg) && !raised.has(msg)) raised.set(msg, f);
  }
}
// A value Postgres would fill in stands as «Ж», which no English text holds by chance.
const filled = (msg: string) => msg.replace(/%/g, "Ж");
const untranslated = [...raised].filter(([msg]) => /[\u0600-\u06FF]/.test(dbMessage(filled(msg), "en")));
for (const [msg, f] of untranslated.slice(0, 20)) console.log(`        no English: ${f}: ${msg}`);
ok(untranslated.length === 0, `every Arabic refusal in the migrations has its English (${raised.size - untranslated.length} of ${raised.size})`);
const placeholders = [...raised.keys()].filter((msg) => {
  const en = dbMessage(filled(msg), "en");
  // Withheld (it names an engine setting, raised only while a migration runs): no reader meets it.
  if (en.startsWith("The request could not")) return false;
  return (en.match(/Ж/g) ?? []).length !== (msg.match(/%/g) ?? []).length;
});
ok(placeholders.length === 0, `and carries each value Postgres fills in${placeholders.length ? `: ${placeholders.slice(0, 3).join(" | ")}` : ""}`);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
