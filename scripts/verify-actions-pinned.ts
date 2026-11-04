/**
 * أدوات GitHub الخارجيّة مثبّتةٌ بنسخةٍ دقيقة (فحص 3 نوفمبر 2026، ops-8؛ المالك، 4 نوفمبر، السؤال 22: «أثبّتها فقط»).
 *
 *   npx tsx scripts/verify-actions-pinned.ts
 *
 * A tag like `@v4` is whatever its owner points it at tomorrow; a commit is what was read today. Every `uses:` in the
 * workflows names a full commit, with the tag beside it as a comment for whoever updates it.
 */
import { readFileSync, readdirSync } from "node:fs";

let fail = 0;
for (const f of readdirSync(".github/workflows").filter((n) => n.endsWith(".yml"))) {
  const text = readFileSync(`.github/workflows/${f}`, "utf8");
  for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) {
    const ref = m[1];
    if (ref.startsWith("./")) continue;
    if (!/@[0-9a-f]{40}$/.test(ref)) {
      console.log(`  FAIL  ${f}: ${ref} — not pinned to a commit`);
      fail++;
    }
  }
}
console.log(fail === 0 ? "ALL CHECKS PASSED — every action is pinned to a commit" : `${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
