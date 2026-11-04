/**
 * نموذجا التواصل والملاحظات يكتبان من الخادم، والزائر يعود إلى الطلب الجماعي بعد الدخول (البند ١٩٨).
 *
 * The database half of D9 is held by verify-default-access.sh: the public key holds no INSERT on leads or feedback.
 * This holds the other half — the two routes must write with the server's client, or the forms stop working the day
 * the grant is gone. And the «سجّل الدخول» link on a group order must carry the visitor back to that order.
 *
 *   npx tsx scripts/verify-visitor-forms.ts
 */
import { readFileSync } from "node:fs";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const read = (p: string) => readFileSync(p, "utf8");

for (const [file, table] of [
  ["src/app/api/leads/route.ts", "leads"],
  ["src/app/api/feedback/route.ts", "feedback"],
] as const) {
  const src = read(file);
  // The client the insert goes through is the one named just before `.from("<table>")`.
  const m = src.match(new RegExp(`await\\s+(\\w+)\\s*\\.from\\("${table}"\\)\\s*\\.insert`));
  ok(!!m, `${table}: the route inserts the row`);
  if (!m) continue;
  const client = m[1];
  ok(new RegExp(`const\\s+${client}\\s*=\\s*createAdminClient\\(\\)`).test(src), `${table}: through the server's client (createAdminClient), not the visitor's session`);
  ok(new RegExp(`if\\s*\\(!${client}\\)`).test(src), `${table}: and says so when the server key is missing, instead of crashing`);
  ok(/checkRateLimit\(/.test(src), `${table}: after its own per-address limit`);
}

const order = read("src/app/suppliers/orders/[id]/page.tsx");
ok(/href=\{loginTo\(`\/suppliers\/orders\/\$\{o\.id\}`\)\}/.test(order), "the group order's «سجّل الدخول» comes back to the same order");
ok(!/href="\/login"/.test(order), "and no bare /login link is left on it");

if (failed > 0) {
  console.error(`\n${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("\nOK");
