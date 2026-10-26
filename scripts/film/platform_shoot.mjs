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
// The address shown in the film: the live site's, even when the pictures are taken from a local copy.
const HOST = process.env.FILM_HOST || SITE.replace(/^https?:\/\//, "");
const W = 1280, H = 720;
// FILM_LANG=en: the English cut (the owner, 26 October: «ترجم»). The site is read in English (its «lang» cookie, the
// ع / EN switch) and the words drawn over it are English, left to right.
const EN = process.env.FILM_LANG === "en";
const inEnglish = async (ctx) => { if (EN) await ctx.addCookies([{ name: "lang", value: "en", url: SITE }]); };
mkdirSync(work, { recursive: true });

const scenes = JSON.parse(readFileSync(`${film}/scenes.json`, "utf-8"));
const logo = "data:image/webp;base64," + readFileSync("public/sudagri-logo.webp").toString("base64");

// In Actions, the runner's own Chrome (FILM_CHROME, film-platform.yml); elsewhere Playwright's.
const browser = await chromium.launch(process.env.FILM_CHROME ? { executablePath: process.env.FILM_CHROME } : {});

// ── the pages ────────────────────────────────────────────────────────────────
const site = await browser.newContext({ viewport: { width: W, height: H }, locale: EN ? "en" : "ar", colorScheme: "light" });
await inEnglish(site);
// The splash plays once per visitor; the film starts after it.
await site.addInitScript(() => {
  try { for (const v of ["v3", "v4"]) localStorage.setItem(`sudagri:splash:${v}`, "1"); } catch {}
});
const meta = {};
async function shoot(page, list) {
  for (const s of list) {
    // A copy with no network draws no map; FILM_STILLS puts the site's own still of Sudan in its place.
    const path = process.env.FILM_STILLS && s.still ? s.still : s.path;
    await page.goto(SITE + path, { waitUntil: process.env.FILM_WAIT_UNTIL || "networkidle", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(s.wait ?? 3500); // maps draw their tiles after the network settles
    // What is fixed to the screen would sit in one place on a page the film scrolls through, so the whole-page
    // picture leaves it out: the side menu of a wide screen, the assistant's button, and the badge `next dev` adds.
    await page
      .addStyleTag({
        content:
          "nextjs-portal,aside.fixed,[class*='z-[100]']{display:none!important}" +
          "@media (min-width:1024px){body{padding-inline-start:0!important}}",
      })
      .catch(() => {});
    const y0 = s.anchor
      ? await page.evaluate((a) => {
          // `#id` names a section; anything else, the start of a heading's words.
          const el = a.startsWith("#")
            ? document.getElementById(a.slice(1))
            : [...document.querySelectorAll("h1,h2,h3,h4,dt,strong")].find((e) => e.textContent.trim().startsWith(a));
          return el ? Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - 90)) : 0;
        }, s.anchor)
      : 0;
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: `${work}/shot-${s.id}.jpg`, fullPage: true, type: "jpeg", quality: 90 });
    meta[s.id] = { height, y0, url: page.url() };
    console.log("shot", s.id, s.path, height, y0, page.url());
  }
}
await shoot(await site.newPage(), scenes.filter((s) => s.path && !s.auth));
await site.close();

// ── the pages behind a sign-in (أراضيّ، مواسمي، قطيعي) ─────────────────────────
// Through the film's test account and nobody else's: a number from the block Britain keeps for drama
// (07700 900000–900999, Ofcom), so it is no one's phone, and a password the workflow derives from a secret it already
// holds, so it is written nowhere. The first run makes the account; what is in it is test data only. Without the
// password these scenes are left out of the film rather than shown as a sign-in page.
const DEMO_PHONE = process.env.FILM_DEMO_PHONE || "7700900123";
const DEMO_PASSWORD = process.env.FILM_DEMO_PASSWORD;
const behind = scenes.filter((s) => s.path && s.auth);
if (behind.length && DEMO_PASSWORD) {
  const inside = await browser.newContext({ viewport: { width: W, height: H }, locale: EN ? "en" : "ar", colorScheme: "light" });
  await inEnglish(inside);
  await inside.addInitScript(() => {
    try { for (const v of ["v3", "v4"]) localStorage.setItem(`sudagri:splash:${v}`, "1"); } catch {}
  });
  const page = await inside.newPage();
  const signIn = async () => {
    await page.goto(SITE + "/login", { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await page.selectOption('select[name="dial_code"]', "44");
    await page.fill('input[name="ident"]', DEMO_PHONE);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    return !new URL(page.url()).pathname.startsWith("/login");
  };
  let inNow = await signIn();
  if (!inNow && (await page.locator('input[name="full_name"]').count())) {
    // No account yet: the screen has turned to «create»; the same number and password make it.
    await page.fill('input[name="full_name"]', EN ? "Film test account" : "حسابٌ تجريبيّ للفيلم");
    await page.check('input[name="role"][value="farmer"]');
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
    inNow = !new URL(page.url()).pathname.startsWith("/login");
  }
  console.log(inNow ? "signed in as the film's test account" : "could not sign in; the signed-in scenes are left out");
  if (inNow) await shoot(page, behind);
  await inside.close();
}


// ── the words ────────────────────────────────────────────────────────────────
// Tajawal from Google Fonts, or — where they cannot be reached — from the CSS `next dev` wrote for the site's own
// copy (FILM_FONT_CSS), its files inlined.
const fontCss = process.env.FILM_FONT_CSS;
const FONT = fontCss
  ? `<style>${readFileSync(fontCss, "utf-8").replace(/url\("\.\.\/media\/([^"]+)"\)/g, (_, f) =>
      `url(data:font/woff2;base64,${readFileSync(join(fontCss, "../../media", f)).toString("base64")})`)}</style>`
  : `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;900&display=block" rel="stylesheet">`;
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
    `<div style="position:absolute;${EN ? "left" : "right"}:40px;bottom:40px;max-width:760px;padding:18px 28px 16px;border-radius:18px;
       background:rgba(10,45,34,.88);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);border-${EN ? "left" : "right"}:8px solid #f28c28;direction:${EN ? "ltr" : "rtl"}">
       <div style="font-size:44px;font-weight:900;line-height:1.25">${EN ? s.title_en || s.title : s.title}</div>
       <div style="font-size:22px;font-weight:500;opacity:.8;direction:ltr;text-align:${EN ? "left" : "right"};margin-top:4px">${where}</div>
     </div>`,
    `${work}/cap-${s.id}.png`, true);
}

const ground = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
  background:radial-gradient(circle at 50% 40%,#16523f 0%,#0a2d22 70%);color:#fff;text-align:center`;
await draw(
  `<div style="${ground}"><img src="${logo}" style="width:300px"><div style="font-size:64px;font-weight:900">${EN ? "Sudagri" : "سوداقري"}</div>
   <div style="font-size:34px;font-weight:500;opacity:.9">${EN ? "For investors: a tour of the whole platform" : "للمستثمر: جولةٌ في المنصّة كلّها"}</div></div>`,
  `${work}/intro.png`, false);
await draw(
  `<div style="${ground}"><img src="${logo}" style="width:300px"><div style="font-size:46px;font-weight:700">${EN ? "Sign up today, for free" : "سجّل اليوم مجّاناً"}</div>
   <div style="font-size:36px;font-weight:500;color:#f6b26b;direction:ltr">${HOST}</div></div>`,
  `${work}/outro.png`, false);
await browser.close();
writeFileSync(`${work}/shots.json`, JSON.stringify(meta, null, 1));
console.log("drawn into", resolve(work));
