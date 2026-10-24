/**
 * رسائل القاعدة الخام لا تصل القارئ (SEC-12، البند ١٦٣): ما كتبته المنصّة بالعربيّة يمرّ كما هو
 * (ويُترجم للإنجليزيّ)، وما كتبه Postgres وPostgREST بنفسيهما — أسماء الجداول والقيود والسياسات —
 * يُستبدل بجملةٍ ثابتة.
 *
 *   npx tsx scripts/verify-db-messages.ts
 */
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

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
