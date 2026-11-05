/**
 * What the service worker may keep (public/sw.js): public pages and the blank offline entry form, never a private page.
 *
 *   npx tsx scripts/verify-sw-pages.ts
 */
import { readFileSync } from "node:fs";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const sw = readFileSync("public/sw.js", "utf8");
const list = sw.match(/const PUBLIC_PAGES = \[([\s\S]*?)\];/);
ok(!!list, "the service worker lists its public pages");
const patterns = [...(list?.[1] ?? "").matchAll(/^\s*\/(.+)\/,\s*$/gm)].map((m) => new RegExp(m[1]));
const kept = (path: string) => patterns.some((re) => re.test(path));

ok(kept("/seasons/offline"), "the blank offline entry form is kept (backlog 184)");
for (const p of ["/seasons", "/seasons/0d4f6c1e-2b7a-4c55-9f0e-1a2b3c4d5e6f", "/seasons/new", "/seasons/offline/x", "/lands", "/dashboard", "/books", "/admin", "/messages"]) {
  ok(!kept(p), `a private page is never kept: ${p}`);
}
ok(/addAll\(\[OFFLINE_URL, "\/seasons\/offline"\]\)/.test(sw), "and it is stored at install, so it opens in the field even if never visited offline");

const page = readFileSync("src/app/seasons/offline/page.tsx", "utf8");
ok(!/createClient|supabase|getUser|from\("/.test(page), "the kept page reads no one's data");
const form = readFileSync("src/app/seasons/offline/BlankLedgerForm.tsx", "utf8");
ok(/offlineNow\(\) \|\| kept\.length === 0/.test(form), "the seasons are asked for only online, and only when an entry waits");

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
