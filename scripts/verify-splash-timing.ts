/**
 * شاشةُ البداية: سقفٌ لا تنقضه شبكة، وأرضيّةٌ لا تنقضها ذاكرةُ المتصفّح.
 *
 *   npx tsx scripts/verify-splash-timing.ts
 *
 * WHY THIS EXISTS
 *
 * The owner opened the platform and reported two things in one sentence: «لم
 * أرى السنبلة الصفرا وشاشة السبلاش ٣ ثواني» — he never saw the yellow sorghum,
 * and the splash lasted three seconds. They were one fault. The first version
 * held for a flat 1400ms counted from the moment it mounted, while a 398 KB PNG
 * was still on the wire; the hold was spent on an empty cream rectangle and the
 * logo arrived, if at all, as it was fading out.
 *
 * Two changes answer that. The picture got smaller and gained a blurred
 * placeholder inlined in the markup, so the screen is never empty. And the
 * timing stopped being a fixed number: it now follows the image.
 *
 * Following the image is the dangerous half. The obvious way to write it —
 * "wait for the load, then hold" — makes the splash *longer* on exactly the
 * connections that were already suffering, which is the failure he reported,
 * made worse. So the end is clamped, and this file holds the clamp to the two
 * promises that make it safe:
 *
 *   • the ceiling is absolute, so no network can trap a visitor behind it;
 *   • the floor is absolute, so a cached image does not make it a flicker.
 *
 * A ceiling asserted only in a comment is not a ceiling.
 */

import { readFileSync } from "node:fs";
import {
  SPLASH_AFTER_LOAD_MS,
  SPLASH_FADE_MS,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
  SPLASH_SLIDES,
  SPLASH_VIDEO_MAX_MS,
  SPLASH_VIDEO_START_MS,
  splashEndsAt,
} from "../src/lib/splash";
import { SLIDES } from "../src/lib/introSlides";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const section = (t: string) =>
  console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

section("أ) السقف — الوعدُ الذي لا تنقضه شبكةٌ مهما بطُؤت");

ok(
  splashEndsAt(null) === SPLASH_MAX_MS,
  `صورةٌ لا تصل أبداً تنتهي عند السقف (${splashEndsAt(null)}ms)`,
);

// المدى الذي اشتكى منه وما هو أسوأ منه بكثير.
for (const loadedAt of [1500, 3000, 10_000, 60_000, Number.MAX_SAFE_INTEGER]) {
  ok(
    splashEndsAt(loadedAt) <= SPLASH_MAX_MS,
    `وصولٌ بعد ${loadedAt}ms لا يتجاوز السقف (${splashEndsAt(loadedAt)}ms)`,
  );
}

section("ب) والسقفُ كلُّه، تلاشياً ومهلةً، أقصرُ ممّا قاسه");

// «٣ ثواني» هو ما قاسه بنفسه. أسوأُ حالةٍ هنا يجب أن تبقى تحتها بوضوح.
const worst = SPLASH_MAX_MS + SPLASH_FADE_MS;
ok(
  worst < 3000,
  `أسوأُ حالةٍ ${worst}ms — أقصرُ من الثلاث ثوانٍ التي قاسها`,
);

section("ج) الأرضيّة — ومضةٌ ليست ترحيباً");

for (const loadedAt of [0, 1, 50, 200]) {
  ok(
    splashEndsAt(loadedAt) >= SPLASH_MIN_MS,
    `صورةٌ من الذاكرة بعد ${loadedAt}ms لا تنزل تحت الأرضيّة (${splashEndsAt(loadedAt)}ms)`,
  );
}

section("د) وبين الحدّين، تتبع الصورةَ فعلاً");

/*
 * الحدّان وحدهما تُرضيهما دالّةٌ ثابتةٌ لا تنظر إلى الصورة أصلاً — وهي الخطأُ
 * الذي حُذف. فلا بدّ من إثبات أنّ ما بينهما يتحرّك.
 */
const mid = SPLASH_MIN_MS; // نقطةٌ تقعُ نتيجتُها داخل المدى لا على حدّه
const later = mid + 200;
ok(
  splashEndsAt(later) > splashEndsAt(mid),
  `وصولٌ أبطأ يعني نهايةً أبعد (${splashEndsAt(mid)}ms → ${splashEndsAt(later)}ms)`,
);
ok(
  splashEndsAt(mid) === mid + SPLASH_AFTER_LOAD_MS,
  `وداخلَ المدى تُمنح المهلةُ كاملةً بعد الوصول (${SPLASH_AFTER_LOAD_MS}ms)`,
);

section("هـ) ورتابةٌ لا تنكسر: أبطأُ أبداً ليست أسرعَ نهاية");

let monotonic = true;
let previous = splashEndsAt(0);
for (let t = 10; t <= 4000; t += 10) {
  const now = splashEndsAt(t);
  if (now < previous) monotonic = false;
  previous = now;
}
ok(monotonic, "النهايةُ لا تتراجع أبداً كلّما تأخّر الوصول");

section("و) مرحلةُ الفيديو قبل الشعار — لها سقفٌ هي أيضاً");

const CLIP_MS = 8000; // public/video/sudan-farmer.* — ٨ ثوانٍ
ok(SPLASH_VIDEO_MAX_MS >= CLIP_MS, `سقفُ الفيديو (${SPLASH_VIDEO_MAX_MS}ms) لا يقطع المقطع (${CLIP_MS}ms)`);
ok(SPLASH_VIDEO_MAX_MS <= CLIP_MS + 1500, "ولا يزيد عليه إلا قليلاً إن توقّف في منتصفه");
ok(SPLASH_VIDEO_START_MS < 3000, `وفيديو لا يبدأ يُترك بعد ${SPLASH_VIDEO_START_MS}ms إلى الشعار`);
ok(
  SPLASH_VIDEO_START_MS + SPLASH_MAX_MS + SPLASH_FADE_MS < 5000,
  "فشبكةٌ لا تحمل الفيديو لا تُبقي الزائر أكثر من خمس ثوانٍ",
);
section("ز) شاشاتُ التعريف بعد الشعار — ثابتةٌ حتى اللمس (26 أكتوبر)، ومرّةً لأوّل زيارةٍ للرئيسيّة (3 نوفمبر)");

ok(SPLASH_SLIDES >= 3 && SPLASH_SLIDES <= 4, `وعددُها ${SPLASH_SLIDES} — «ثلاث او أربعة»`);
ok(SPLASH_SLIDES === SLIDES.length, `والنصوصُ المكتوبة ${SLIDES.length} بعدد الشاشات`);
const component = readFileSync("src/components/SplashOnce.tsx", "utf8");
ok(/function introWanted\(pathname: string\)/.test(component) && /if \(pathname !== "\/"\) return false;/.test(component),
   "وتظهر في الرئيسيّة وحدها: لا لرابطٍ مباشر ولا لعودةٍ من الدخول (المالك، 3 نوفمبر: «مرّة لأوّل زيارة للرئيسية»)");
ok(/localStorage\.getItem\(SEEN_KEY\)\) return false;/.test(component) && /localStorage\.setItem\(SEEN_KEY, "1"\)/.test(component),
   "ومرّةً واحدة: تتذكّر أنّها رُئيت");
ok(/saveData/.test(component) && /effectiveType === "2g"/.test(component),
   "ولا تظهر لاتّصالٍ طلب توفير البيانات أو بطيءٍ جدّاً");
ok(/wanted\.current \?\?= introWanted\(pathname\);\s*if \(!wanted\.current\) \{\s*window\.dispatchEvent\(new Event\("sudagri:intro-done"\)\);/.test(component),
   "والقرارُ مرّةً لكلّ تحميل، وحين لا تظهر تُعلن ذلك فلا ينتظرها فيلمُ الرئيسيّة");
ok(/delete document\.documentElement\.dataset\.intro;/.test(component),
   "وحين تنتهي تُرفع رايتُها، فلا ينتظرها فيلمٌ يُركَّب بعدها (العودة إلى الرئيسيّة)");
ok(!/showSlide\(i \+ 1\)/.test(component) && /current \+ 1 < SLIDES\.length\) showSlide\(current \+ 1\)/.test(component),
   "ولا تتغيّر الشاشة وحدها: اللمسةُ تأتي بالتالية");
ok(/data-skip/.test(component) && /e\.key === "Escape"\) skip\(\)/.test(component) && /closest\("\[data-skip\]"\)\) skip\(\)/.test(component)
     && /const skip = \(\) => end\(\);/.test(component),
   "و«تخطَّ» أو Escape تُغلق المقدّمة كلّها");
ok(!/classList\.add\("hidden"\)/.test(component),
   "وزرُّ «تخطَّ» ظاهرٌ من أوّل لحظةٍ إلى آخر شاشة (لا يُخفى عند الشاشات)");
ok(/reached >= i && <Image/.test(component),
   "وصورُ الشاشات تُطلب حين تُبلغ شاشتُها، لا الأربعُ معاً");
ok(/role="dialog"/.test(component) && !/aria-hidden\s*\n/.test(component),
   "وهي حوارٌ له اسم، لا مخفيّةٌ عن قارئ الشاشة وفيها زرّ");

section(fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
