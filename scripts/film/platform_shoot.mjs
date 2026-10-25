// Photographs the live site for the film that walks through the platform
// (backlog 199), and draws the words that go over the pictures:
//
//     node scripts/film/platform_shoot.mjs film/platform work/
//
// For every scene in scenes.json with a `path`, the page is opened on the live
// site as a signed-out visitor sees it and photographed whole, 1280 wide. If the
// scene names an `anchor`, the film starts at the first heading with those
// words instead of the top. Into work/:
//   shot-<id>.jpg   the whole page
//   cap-<id>.png    the scene's title and address, 1280×720, clear but for the band
//   intro.png, outro.png   the opening and closing cards
//   shots.json      the page's height and where the film starts on it
//
// Arabic is drawn here, by Chromium, because ffmpeg's text filter does not join
// Arabic letters. It runs in Actions (film-platform.yml), where Playwright,
// Chromium and Google Fonts can be reached.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const film = (process.argv[2] || "film/platform").replace(/\/$/, "");
const work = (process.argv[3] || "work").replace(/\/$/, "");
const SITE = process.env.FILM_SITE || "https://zadam-khaki.vercel.app";
const HOST = SITE.replace(/^https?:\/\//, "");
const W = 1280, H = 720;
mkdirSync(work, { recursive: true });

const scenes = JSON.parse(readFileSync(`${film}/scenes.json`, "utf-8"));
const logo = "data:image/webp;base64," + readFileSync("public/sudagri-logo.webp").toString("base64");

const browser = await chromium.launch();

// ── the pages ────────────────────────────────────────────────────────────────
const site = await browser.newContext({ viewport: { width: W, height: H }, locale: "ar", colorScheme: "light" });
// The splash plays once per visitor; the film starts after it.
await site.addInitScript(() => {
  try { for (const v of ["v3", "v4"]) localStorage.setItem(`sudagri:splash:${v}`, "1"); } catch {}
});
const page = await site.newPage();
const meta = {};
for (const s of scenes.filter((s) => s.path)) {
  await page.goto(SITE + s.path, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(s.wait ?? 3500); // maps draw their tiles after the network settles
  const y0 = s.anchor
    ? await page.evaluate((a) => {
        const el = [...document.querySelectorAll("h1,h2,h3,h4,dt,strong")].find((e) => e.textContent.trim().startsWith(a));
        return el ? Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - 90)) : 0;
      }, s.anchor)
    : 0;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: `${work}/shot-${s.id}.jpg`, fullPage: true, type: "jpeg", quality: 90 });
  meta[s.id] = { height, y0, url: page.url() };
  console.log("shot", s.id, s.path, height, y0, page.url());
}
await site.close();

// ── the words ────────────────────────────────────────────────────────────────
const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;900&display=block" rel="stylesheet">`;
const base = `*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Tajawal,sans-serif;direction:rtl}`;

const ink = await browser.newContext({ viewport: { width: W, height: H } });
const card = await ink.newPage();
async function draw(html, path, clear) {
  await card.setContent(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${FONT}<style>${base}</style></head><body>${html}</body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await card.waitForTimeout(300);
  await card.screenshot({ path, omitBackground: clear });
}

for (const s of scenes.filter((s) => s.path)) {
  const where = HOST + (s.path === "/" ? "" : s.path);
  await draw(
    `<div style="position:absolute;right:40px;bottom:40px;max-width:760px;padding:18px 28px 16px;border-radius:18px;
       background:rgba(10,45,34,.88);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);border-right:8px solid #f28c28">
       <div style="font-size:44px;font-weight:900;line-height:1.25">${s.title}</div>
       <div style="font-size:22px;font-weight:500;opacity:.8;direction:ltr;text-align:right;margin-top:4px">${where}</div>
     </div>`,
    `${work}/cap-${s.id}.png`, true);
}

const ground = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
  background:radial-gradient(circle at 50% 40%,#16523f 0%,#0a2d22 70%);color:#fff;text-align:center`;
await draw(
  `<div style="${ground}"><img src="${logo}" style="width:300px"><div style="font-size:64px;font-weight:900">سوداقري</div>
   <div style="font-size:34px;font-weight:500;opacity:.9">للمستثمر: جولةٌ في المنصّة كلّها</div></div>`,
  `${work}/intro.png`, false);
await draw(
  `<div style="${ground}"><img src="${logo}" style="width:300px"><div style="font-size:46px;font-weight:700">سجّل اليوم مجّاناً</div>
   <div style="font-size:36px;font-weight:500;color:#f6b26b;direction:ltr">${HOST}</div></div>`,
  `${work}/outro.png`, false);
await browser.close();
writeFileSync(`${work}/shots.json`, JSON.stringify(meta, null, 1));
console.log("drawn into", resolve(work));
