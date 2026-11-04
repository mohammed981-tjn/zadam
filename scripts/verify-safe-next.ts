/**
 * العودة بعد الدخول: إلى صفحةٍ في المنصّة دائماً، وإلى الصفحة التي جاء منها الزائر.
 *
 *   npx tsx scripts/verify-safe-next.ts
 *
 * WHY THIS EXISTS
 *
 * The audit of 3 November 2026 (web-client-1 / auth-actions-1, web-flows-8; the owner's question 13, «نسدّ الثغرة
 * ونُصلح العودة») found two faults in one place:
 *
 *   • the return path was checked by its first two characters, and a browser reads more than that: it drops a tab
 *     anywhere in an address and turns "\" into "/". So "/<tab>/evil.example" passed the check and opened another
 *     site — after signing in, from a link that really began with our address. Section أ holds every known way of
 *     dressing another site as a path, read the way a browser reads it.
 *   • about a hundred places sent a visitor to a bare "/login", so the link that brought them was lost. Section ب
 *     holds the code to sending them back: no bare sign-in redirect or link outside a short list, each with its reason.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loginTo, safeNext } from "../src/lib/authEntry";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const section = (t: string) => console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

const SITE = "https://zadam-khaki.vercel.app";
/** Where a browser on our site would actually go, for a path the check let through. */
const lands = (path: string) => new URL(path, SITE).origin;

section("أ) لا شيءَ يخرج من المنصّة، مهما تنكّر");

const HOSTILE: [string, string][] = [
  ["//evil.example", "عنوانٌ بلا بروتوكول"],
  ["///evil.example", "ثلاث شُرَط"],
  ["/\\evil.example", "شرطةٌ مائلةٌ عكسيّة"],
  ["\\/evil.example", "عكسيّةٌ أوّلاً"],
  ["/\t/evil.example", "تبويبٌ بين الشَّرطتين (الثغرة التي وُجدت)"],
  ["/\n/evil.example", "سطرٌ جديد بين الشَّرطتين"],
  ["/\r/evil.example", "رجوعُ عربة"],
  ["/\t\\evil.example", "تبويبٌ وعكسيّة"],
  [" //evil.example", "مسافةٌ قبل الشَّرطتين"],
  ["\t//evil.example", "تبويبٌ قبل الشَّرطتين"],
  ["/\u0000/evil.example", "محرفُ NUL"],
  ["/\u007f/evil.example", "DEL"],
  ["https://evil.example", "عنوانٌ كامل"],
  ["http:evil.example", "بروتوكولٌ بلا شُرَط"],
  ["javascript:alert(1)", "javascript:"],
  ["/" + "a".repeat(400), "أطولُ من ٣٠٠ حرف"],
  ["", "فارغ"],
];
for (const [value, label] of HOSTILE) {
  const out = safeNext(value);
  ok(out === null || lands(out) === SITE, `${label}: ${JSON.stringify(value)} → ${JSON.stringify(out)}`);
}

section("ب) وما هو صفحةٌ في المنصّة يمرّ، كما كُتب أو كما يقرؤه المتصفّح");

const FRIENDLY: [string, string][] = [
  ["/lands/new", "/lands/new"],
  ["/contracts/5b1e?tab=sign", "/contracts/5b1e?tab=sign"],
  ["/market/forward/12#terms", "/market/forward/12#terms"],
  ["  /dashboard  ", "/dashboard"],
  ["/%2F/evil.example", "/%2F/evil.example"], // مُرمَّزةٌ تبقى مساراً عندنا
];
for (const [value, want] of FRIENDLY) {
  const out = safeNext(value);
  ok(out === want && lands(out) === SITE, `${JSON.stringify(value)} → ${JSON.stringify(out)}`);
}
ok(safeNext("/login?next=/x") === null && safeNext("/signup") === null, "ولا يعود إلى شاشة الدخول نفسها (حلقة)");
ok(safeNext("/حقول") !== null && lands(safeNext("/حقول")!) === SITE, "ومسارٌ عربيٌّ يمرّ مُرمَّزاً");
ok(safeNext(decodeURIComponent(new URL(loginTo("/seasons/7?x=1"), SITE).searchParams.get("next")!)) === "/seasons/7?x=1",
   "و loginTo ثمّ قراءةُ next تعيد المسارَ نفسه");

section("ج) شاشةُ الدخول ورابطُ البريد يفحصان بالفحص نفسه");

const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
ok(/import \{[^}]*\bsafeNext\b[^}]*\} from "@\/lib\/authEntry"/.test(callback) && !/function safeNext/.test(callback),
   "رابطُ البريد (auth/callback) يستورد safeNext ولا يكتب فحصاً خاصّاً به");
const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
ok(/safeNext\(/.test(loginPage), "وصفحةُ الدخول تمرّر next عبره");

section("د) الوسيطُ يكتب مسارَ الطلب، فوق ما أرسله الزائر");

const mw = readFileSync("src/lib/supabase/middleware.ts", "utf8");
ok(/headers\.set\(REQUEST_PATH_HEADER,/.test(mw), "يضع مسارَ الطلب بـ set (لا append): ما أرسله الزائر لا يبقى");
ok(!/NextResponse\.next\(\{ request \}\)/.test(mw) && (mw.match(/passOn\(request\)/g) ?? []).length === 2,
   "وفي الموضعين: أوّلَ الطلب وبعد تجديد الجلسة");
const here = readFileSync("src/lib/loginHere.ts", "utf8");
ok(/safeNext\(\(await headers\(\)\)\.get\(REQUEST_PATH_HEADER\)\)/.test(here), "و loginHrefHere يقرؤه عبر safeNext");

section("هـ) لا إرسالَ إلى الدخول بلا مكان العودة، إلّا ما له سبب");

/*
 * Where a bare "/login" is right, and why. Anything else that sends to sign in carries the way back:
 * `redirect(await loginHrefHere())` or `href={await loginHrefHere()}` on the server, `loginTo(path)` with a known
 * path, or the page's own path in the browser.
 */
const BARE_ALLOWED: Record<string, string> = {
  "src/app/login/actions.ts": "شاشةُ الدخول نفسُها: مزوّدٌ غير معروف يعيد إليها، وما من صفحةٍ يُعاد إليها",
  "src/app/reset/page.tsx": "صفحةُ استرجاع كلمة السرّ: من نسيها يدخل بعدها إلى بيته، لا إلى الاسترجاع",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}
const BARE = /redirect\(\s*["'`]\/login["'`]\s*\)|href=["']\/login["']|href=\{\s*["'`]\/login["'`]\s*\}|push\(\s*["'`]\/login["'`]\s*\)|href:\s*["']\/login["']/g;
const offenders: string[] = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  const hits = text.match(BARE);
  if (hits && !(file in BARE_ALLOWED)) offenders.push(`${file} (${hits.length})`);
}
ok(offenders.length === 0, `لا "/login" مجرّداً خارج القائمة${offenders.length ? ": " + offenders.join("، ") : ""}`);
for (const [file, why] of Object.entries(BARE_ALLOWED)) console.log(`        مسموح: ${file} — ${why}`);

section(fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
