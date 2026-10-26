// Draws the cards of the investors' film that explain the partnership
// (backlog 143) and keeps each as a clip and a still:
//
//     node scripts/film/cards.mjs film/investors [fonts-dir]
//
// Each card is cards.html, drawn by Chromium one frame at a time (window.seek)
// and encoded by ffmpeg into film/<name>/clips/<id>.mp4, with its last frame as
// film/<name>/frames/<frame>. Its elements come in as the narrator says the
// words they stand for: the line (tts/fusha/<line>.wav) is cut into phrases at
// its punctuation, each phrase is given a share of the speech by its letters,
// and each start is moved to the end of the pause nearest it, as ffmpeg's
// silencedetect hears them. So the cards are drawn after the narration is
// spoken; drawn before, they fall back to an even pace.
//
// fonts-dir holds Tajawal's woff2 files as `next build` writes them (the
// Arabic 400/500/700/900 subsets); without it the page asks Google Fonts.
//
// It runs in a session, not in Actions: Playwright and Chromium are there. The
// clip it makes has a still beside it, so animate.py never moves a card
// (it skips `card` shots in any case).

import { createRequire } from "node:module";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // NODE_PATH reaches a global install

const film = (process.argv[2] || "film/investors").replace(/\/$/, "");
const fontsDir = process.argv[3];
const W = 1280, H = 720, FPS = 24;
const LEAD = 0.35, BREATH = 0.8; // as in assemble.py: a line starts LEAD into its shot

// Which phrase of the line brings in each cue of the card (cards.html data-cue).
const CARDS = {
  // «فكرة سوداقري بسيطة: صاحب الأرض بأرضه، والمستثمر بماله… وإن شئتما، شركةٌ
  // زراعيّة تدير الموسم. والمنصّة تجمعكم، وتوثّق، وتشهد.» — the company comes in
  // at «وإن شئتما», the band at «والمنصّة تجمعكم».
  "card-a": { section: "a", cues: [0, 1, 2, 3, 5, 6, 7] },
  "card-models": { section: "m", cues: [0, 1, 2, 3, 4] },
  "card-b": { section: "b", cues: [0, 1, 2] },
};

const shots = JSON.parse(readFileSync(`${film}/shots.json`, "utf8"));
// FILM_LANG=en draws the English cut's cards (the owner, 26 October: «ترجم»): cards-en.html, timed to Kokoro's lines in
// tts/en, into clips/<id>-en.mp4 and frames/en-<frame>. assemble.py takes them with the same FILM_LANG.
const EN = process.env.FILM_LANG === "en";
const lines = Object.fromEntries(
  JSON.parse(readFileSync(EN ? "tts/lines-en.json" : "tts/lines.json", "utf8")).map((l) => [l.id, l.text]),
);

const letters = (s) => s.replace(/[ً-ْٰـ]/g, "").replace(/[^\p{L}]/gu, "").length;

function duration(path) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString());
}

function pauses(path) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", path, "-af", "silencedetect=noise=-34dB:d=0.12", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const out = [];
  let start = null;
  for (const m of r.stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === "start") start = parseFloat(m[2]);
    else out.push([start ?? 0, parseFloat(m[2])]);
  }
  if (start !== null && (out.length === 0 || out[out.length - 1][0] !== start)) out.push([start, Infinity]);
  return out;
}

/** When each phrase of a line begins, in seconds into its wav. */
function phraseStarts(text, wav) {
  const phrases = text.split(EN ? /[:,;…!.?]+/ : /[:،…!.؟]+/).map((p) => p.trim()).filter(Boolean);
  const weights = phrases.map(letters);
  const PAUSE = 3; // a pause at punctuation is worth about three letters
  if (!wav) {
    const rate = 12; // letters a second, the narrator's usual pace
    let t = 0;
    return { phrases, starts: weights.map((w) => ((t += w / rate + PAUSE / rate), t - w / rate - PAUSE / rate)), length: t };
  }
  const length = duration(wav);
  const gaps = pauses(wav);
  const s0 = gaps.length && gaps[0][0] <= 0.05 ? gaps[0][1] : 0;
  const last = gaps[gaps.length - 1];
  const s1 = last && last[1] >= length - 0.05 ? last[0] : length;
  const total = weights.reduce((a, b) => a + b, 0) + PAUSE * (phrases.length - 1);
  const inner = gaps.filter(([a, b]) => a > s0 + 0.05 && b < s1 - 0.05);
  const starts = [];
  let acc = 0;
  for (let i = 0; i < phrases.length; i++) {
    let t = s0 + ((s1 - s0) * acc) / total;
    if (i > 0) {
      const near = inner
        .map(([, end]) => end)
        .filter((end) => Math.abs(end - t) < 0.8 && end > starts[i - 1] + 0.2)
        .sort((x, y) => Math.abs(x - t) - Math.abs(y - t))[0];
      if (near !== undefined) t = near;
    }
    starts.push(t);
    acc += weights[i] + PAUSE;
  }
  return { phrases, starts, length, gaps: inner.length };
}

function fontFaces() {
  if (!fontsDir) return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap">`;
  // The Arabic subset of each weight, named as next build names them.
  const files = { 400: "4b676bcffc00356a", 500: "d54db18e8cd5f74f", 700: "48e6fa8a5baca31f", 900: "80c3108817f102b0" };
  const all = readdirSync(fontsDir);
  return (
    "<style>" +
    Object.entries(files)
      .map(([w, key]) => {
        const f = all.find((n) => n.startsWith(key));
        return f ? `@font-face{font-family:"Tajawal";font-weight:${w};src:url("${pathToFileURL(join(resolve(fontsDir), f))}") format("woff2");}` : "";
      })
      .join("") +
    "</style>"
  );
}

const html = readFileSync(EN ? "scripts/film/cards-en.html" : "scripts/film/cards.html", "utf8").replace("</head>", `${fontFaces()}\n</head>`);
const work = join(tmpdir(), `cards-${process.pid}`);
mkdirSync(work, { recursive: true });
const page_ = join(work, "cards.html");
writeFileSync(page_, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const shot of shots.filter((s) => s.card)) {
  const spec = CARDS[shot.id];
  if (!spec) {
    console.log(`${shot.id}: no drawing for this card`);
    continue;
  }
  const wavPath = `${EN ? "tts/en" : "tts/fusha"}/${shot.line}.wav`;
  const wav = existsSync(wavPath) ? wavPath : null;
  const { phrases, starts, length, gaps } = phraseStarts(lines[shot.line], wav);
  const cues = spec.cues.map((p) => Math.max(0.15, LEAD + (starts[p] ?? starts[starts.length - 1]) - 0.1));
  const dur = Math.max(shot.seconds || 5, LEAD + length + BREATH);
  console.log(`${shot.id}: ${wav ? `timed to ${wavPath} (${length.toFixed(2)} s, ${gaps} pauses)` : "no narration yet — even pace"}`);
  phrases.forEach((p, i) => console.log(`   ${(LEAD + starts[i]).toFixed(2)} s  ${p}`));

  const cfg = { card: spec.section, cues, dur, logo: pathToFileURL(resolve("public/sudagri-logo.webp")).href };
  // The query makes each card a fresh load; a new hash alone would not rerun the page.
  await page.goto(`${pathToFileURL(page_).href}?${shot.id}#${encodeURIComponent(JSON.stringify(cfg))}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  mkdirSync(`${film}/clips`, { recursive: true });
  mkdirSync(`${film}/frames`, { recursive: true });
  const clip = `${film}/clips/${shot.id}${EN ? "-en" : ""}.mp4`;
  const ff = spawn(
    "ffmpeg",
    ["-v", "error", "-y", "-f", "image2pipe", "-c:v", "png", "-framerate", `${FPS}`, "-i", "-",
     "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", clip],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const frames = Math.round(dur * FPS);
  let last;
  for (let k = 0; k < frames; k++) {
    await page.evaluate((t) => window.seek(t), k / FPS);
    last = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(last)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (code) => (code === 0 ? r() : j(new Error(`ffmpeg ${code}`)))));
  const png = join(work, `${shot.id}.png`);
  writeFileSync(png, last);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", "90", `${film}/frames/${EN ? "en-" : ""}${shot.frame}`]);
  console.log(`   → ${clip} (${dur.toFixed(2)} s) and ${film}/frames/${EN ? "en-" : ""}${shot.frame}`);
}

await browser.close();
rmSync(work, { recursive: true, force: true });
