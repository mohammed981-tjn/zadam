// يصوّر شاشات التطبيق في المحاكي (scripts/app-preview.sh). يفشل إن رمت الصفحة خطأً أو بقيت فارغة.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? ""] }))); }
const [url, out] = process.argv.slice(2);
const TABS = ["home", "water", "assistant", "knowledge", "account"]; // الشريط السفليّ من اليمين
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push((e.message.split("\n")[0] || "Error") + (process.env.PREVIEW_DEBUG ? "\n" + (e.stack ?? "") : "")));
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(6000);
const width = 390;
for (let i = 0; i < TABS.length; i++) {
  // Five equal slots, right to left (RTL), on the bar at the bottom.
  const x = Math.round(width - (i + 0.5) * (width / TABS.length));
  await page.mouse.click(x, 812);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${i + 1}-${TABS[i]}.png` });
}
await browser.close();
const fatal = errors.filter((m) => !/Failed to fetch|NetworkError|ClientException/i.test(m));
console.log(`صُوّرت ${TABS.length} شاشات في ${out}` + (errors.length ? ` · أخطاء الشبكة المتوقّعة بلا مفاتيح: ${errors.length - fatal.length}` : ""));
if (fatal.length) {
  console.error("أخطاء في الصفحة:\n" + fatal.join("\n"));
  process.exit(1);
}
