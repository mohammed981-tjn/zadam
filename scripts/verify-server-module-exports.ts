/**
 * وحدةُ `"use server"` لا تُصدّر إلّا دوالَّ غيرَ متزامنة.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * On 5 September 2026 `/lands` returned 500 in production, for the farmer who
 * had just registered the platform's first plot of land. The cause:
 *
 *     // app/lands/documents/actions.ts
 *     "use server";
 *     export const LAND_DOCUMENT_KINDS = [ ... ];   // ← not a function
 *
 * A `"use server"` module turns every export into a callable server reference.
 * A plain array does not survive that boundary, so the client component that
 * imported it received something that was not an array and `.map` threw.
 *
 * WHY NOTHING CAUGHT IT
 *
 * TypeScript sees a valid array export and a valid array import; the types are
 * correct on both sides. `next build` compiled it without complaint. The only
 * thing that fails is the runtime, and only on the render path that reaches the
 * component — which needed a land to exist, and no land existed for the whole
 * life of the platform until that day. The first plot ever registered was the
 * first render, and it 500'd.
 *
 * WHAT IT CHECKS
 *
 * Every `.ts`/`.tsx` file whose first statement is `"use server"`, for exports
 * that are not functions. Type-only exports are fine: they are erased before
 * anything runs.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk("src");

// أوّلُ سطرٍ فعليّ، لا أيُّ ذكرٍ للنصّ في تعليق.
const isServerModule = (src: string) =>
  /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use server["']/.test(src);

const serverModules = files.filter((f) =>
  isServerModule(readFileSync(f, "utf8")),
);

console.log("=".repeat(74));
console.log('A) "use server" modules export only async functions');
console.log("=".repeat(74));
console.log(`  فُحص ${serverModules.length} وحدة "use server".`);

const offenders: string[] = [];

for (const file of serverModules) {
  const src = readFileSync(file, "utf8");
  for (const line of src.split("\n")) {
    const m = /^export\s+(const|let|var|class|enum)\s+(\w+)/.exec(line.trim());
    // `export type` و`export interface` يُمحيان قبل التشغيل، فلا يعبران حدّاً.
    if (m) offenders.push(`${file} → export ${m[1]} ${m[2]}`);
  }
}

ok(
  offenders.length === 0,
  offenders.length === 0
    ? "لا وحدةَ تُصدّر قيمةً غيرَ دالّة"
    : `وحداتٌ تُصدّر قيماً غيرَ دوالّ:\n      ${offenders.join("\n      ")}`,
);

console.log("\n" + "=".repeat(74));
console.log("B) The rule the failure taught");
console.log("=".repeat(74));
console.log(
  "  قائمةٌ يشاركها إجراءٌ ومكوّنُ عميل تسكن `lib/` — لا ملفَّ الإجراء.\n" +
    "  والخطأُ لا يظهر في تايبسكربت ولا في البناء، بل في أوّل عرضٍ يصل\n" +
    "  المكوّن. و`/lands` انتظرت أوّلَ أرضٍ في عمر المنصّة لتُظهره.",
);

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
