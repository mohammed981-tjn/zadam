// يصوّر شاشات التطبيق في المحاكي (scripts/app-preview.sh). يفشل إن رمت الصفحة خطأً أو بقيت فارغة.
//
// أوّلاً الشريط السفليّ كلّه (1-home … 5-account)، ثمّ (البند ٢٠٢) محادثةٌ قصيرة مع المساعد، والقائمة الجانبيّة،
// وكلّ قسمٍ من لوحة الرئيسيّة يُفتح ثمّ يُرجع منه. الأقسام تُلمس بشجرة الإتاحة (semantics) لا بالإحداثيّات،
// فلا ينكسر التصوير إن تغيّر ترتيب اللوحة؛ وإن لم يوجد زرٌّ باسمه فشل التصوير باسمه.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? ""] }))); }
const [url, out] = process.argv.slice(2);
const TABS = ["home", "water", "assistant", "knowledge", "account"]; // الشريط السفليّ من اليمين
// Home-board sections opened by name, each saved as its own picture.
const SECTIONS = [
  // The website's sections, each on its own screen in the app (item 203).
  ["المواسم", "seasons"],
  ["أراضيّ", "lands"],
  ["الدفتر", "books"],
  ["القطعان", "herds"],
  ["دراسة الجدوى", "feasibility"],
  ["الخرائط", "maps"],
  ["الأسعار", "prices"],
  ["التصدير", "export"],
  ["العقود", "contracts"],
  ["الاستثمار", "invest"],
  ["الموردون", "suppliers"],
  ["الوكيل", "agent"],
  ["المكتبة", "library"],
  ["الأخبار", "news"],
  ["الأفلام", "films"],
  ["توقّع الأمطار", "rain"],
  ["النفير", "nafir"],
  ["الخدمات", "services"],
  ["التعدين", "mining"],
];
const errors = [];
const missing = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push((e.message.split("\n")[0] || "Error") + (process.env.PREVIEW_DEBUG ? "\n" + (e.stack ?? "") : "")));
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(6000);
const width = 390;
const tab = async (i) => {
  // Five equal slots, right to left (RTL), on the bar at the bottom.
  const x = Math.round(width - (i + 0.5) * (width / TABS.length));
  await page.mouse.click(x, 812);
  await page.waitForTimeout(1500);
};
for (let i = 0; i < TABS.length; i++) {
  await tab(i);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${i + 1}-${TABS[i]}.png` });
}

// A question to the assistant: the farmer's bubble, then the answer (or, with no keys, the error bubble).
await tab(2);
await page.mouse.click(250, 738);
await page.waitForTimeout(400);
await page.keyboard.type("كم يحتاج القمح من الماء في الجزيرة؟");
await page.keyboard.press("Enter");
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/6-assistant-chat.png` });

// From here on, buttons are found by their names in the accessibility tree.
await page.evaluate(() => document.querySelector("flt-semantics-placeholder")?.click());
await page.waitForTimeout(1500);
const button = (name) => page.locator("flt-semantics[role=button]", { hasText: new RegExp("^" + name) }).first();
const tap = async (name) => {
  const b = button(name);
  if (!(await b.count())) { missing.push(name); return false; }
  // Flutter draws to a canvas; its accessibility nodes take the tap as a DOM click.
  await b.dispatchEvent("click");
  await page.waitForTimeout(2500);
  return true;
};
const back = async () => {
  // Material's back button in Arabic is «رجوع»; it has no text, only a tooltip.
  const b = page.locator("flt-semantics[role=button][aria-label='رجوع'], flt-semantics[role=button]:has-text('رجوع')").first();
  if (await b.count()) await b.dispatchEvent("click"); else await page.goBack();
  await page.waitForTimeout(1500);
};

await tab(0);
if (await tap("فتح قائمة التنقل")) {
  await page.screenshot({ path: `${out}/7-menu.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
}
let n = 8;
// The board is three groups long and Flutter only builds what is on screen: a tall window builds every tile, then
// the picture is taken at the phone's height.
for (const [name, file] of SECTIONS) {
  await tab(0);
  await page.setViewportSize({ width: 390, height: 3200 });
  await page.waitForTimeout(1200);
  const found = await tap(name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  if (found) {
    await page.screenshot({ path: `${out}/${n}-${file}.png` });
    await back();
  }
  n++;
}

await browser.close();
const fatal = errors.filter((m) => !/Failed to fetch|NetworkError|ClientException/i.test(m));
console.log(`صُوّرت ${TABS.length + 2 + SECTIONS.length - missing.length} شاشة في ${out}` + (errors.length ? ` · أخطاء الشبكة المتوقّعة بلا مفاتيح: ${errors.length - fatal.length}` : ""));
if (missing.length) console.error("لم يوجد زرٌّ باسم: " + missing.join("، "));
if (fatal.length) console.error("أخطاء في الصفحة:\n" + fatal.join("\n"));
if (fatal.length || missing.length) process.exit(1);
