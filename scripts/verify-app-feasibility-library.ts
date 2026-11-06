/**
 * دراسة الجدوى والخطّة، والمكتبة والدراسات، في تطبيق الهاتف (البند ٢٠٣).
 *
 *   npx tsx scripts/verify-app-feasibility-library.ts
 *
 * Holds the phone app's routes under /api/app/{feasibility,plan,library} to the rules the app talks to the server
 * by: a per-user route starts from the phone's session (`clientFromBearer`) and answers 401 without one; no route
 * holds the service key; the study the app shows is computed by the same functions the website's page calls, on the
 * same cleaned inputs; the website's actions and the app's routes share one core for every write; and the readers
 * of the guide and the canal study read the page as rendered, not a copy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_CROPS, STATIONS, IRRIGATION_EFFICIENCY } from "../src/lib/agronomy";
import type { CropMarket } from "../src/lib/cropBenchmark";
import { CROP_INPUTS } from "../src/lib/cropInputs";
import { phasedFeasibility } from "../src/lib/feasibility";
import { defaultSettings, summariseRisks } from "../src/lib/farmRisks";
import { feasibilityOptions, feasibilityReport, riskSettingsFrom } from "../src/lib/feasibilityReport";
import { irrigationAdvice } from "../src/lib/irrigationAdvice";
import { publishedCostsFor } from "../src/lib/publishedCropCosts";
import { blocksFromHtml, pageBlocks, readableRegions } from "../src/lib/pageBlocks";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// ── 1. The routes: the phone's session for per-user ones, never the service key ─────────────────────────────────
console.log("── the routes");
const routes = ["src/app/api/app/feasibility", "src/app/api/app/plan", "src/app/api/app/library"].flatMap(walk).filter((p) => p.endsWith("route.ts"));
ok(routes.length >= 7, `the app's feasibility, plan and library routes are there (${routes.length})`);
for (const r of routes) {
  const src = read(r);
  ok(!/SERVICE_ROLE|service_role|createAdminClient|supabase\/admin/.test(src), `${r}: holds no service key`);
}
const PER_USER = [
  "src/app/api/app/plan/route.ts",
  "src/app/api/app/feasibility/project/route.ts",
  "src/app/api/app/library/mine/route.ts",
];
const SESSION_FIRST = /export async function (GET|POST)\(req: Request[^)]*\) \{\n  const auth = await clientFromBearer\(req\);\n  if \(!auth\) return NextResponse\.json\(\{ error: "انتهت جلستك\. ادخل من جديد\." \}, \{ status: 401 \}\);/;
for (const r of PER_USER) {
  const src = read(r);
  ok(SESSION_FIRST.test(src), `${r}: starts from clientFromBearer and answers 401 without a session`);
  ok(!/createClient\(|createPublicClient\(/.test(src), `${r}: reads and writes only as the signed-in person`);
}
// A public read may use the public client; when the study personalises (lands near a locust sighting) it is with the
// phone's session, never another key.
const study = read("src/app/api/app/feasibility/route.ts");
ok(/clientFromBearer\(req\)/.test(study) && /createPublicClient\(\)/.test(study), "the study route: public reference, the phone's own session for its lands");
for (const r of ["src/app/api/app/library/route.ts", "src/app/api/app/library/[id]/route.ts"]) {
  ok(/createPublicClient\(\)/.test(read(r)) && !/cookies|supabase\/server/.test(read(r)), `${r}: a public read with the public client`);
}

// ── 2. The study: the website's functions, not a copy ───────────────────────────────────────────────────────────
console.log("── the study is the website's");
const web = read("src/components/FeasibilityStudy.tsx");
const risksWeb = read("src/components/FeasibilityRisks.tsx");
const lib = read("src/lib/feasibilityReport.ts");
ok(/import \{ feasibilityOptions, feasibilityReport \} from "@\/lib\/feasibilityReport"/.test(study), "the route answers with feasibilityReport");
ok(/feasibilityReport\(body,/.test(study), "and nothing else computes the study there");
for (const [fn, from, page] of [
  ["phasedFeasibility", "./feasibility", web],
  ["irrigationAdvice", "./irrigationAdvice", web],
  ["estimateCostPerFeddan", "./inputPrices", web],
  ["publishedCostsFor", "./publishedCropCosts", web],
  ["summariseRisks", "./farmRisks", risksWeb],
] as const) {
  ok(new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from "${from.replace(".", "\\.")}"`).test(lib) && lib.includes(`${fn}(`), `feasibilityReport calls ${fn}`);
  ok(page.includes(`${fn}(`), `… the function the website's page calls`);
}
const dart = read("mobile/lib/feasibility.dart");
ok(dart.includes("/api/app/feasibility"), "the app asks /api/app/feasibility for the study");
ok(!/0\.4201|budgetShare|breakEven\w*\s*=\s*\(|\* 1000 \//.test(dart), "and does none of the study's arithmetic in Dart");

// The numbers: the route's report equals the page's own call on the page's own cleaning of the inputs.
const market: CropMarket = {
  cropKey: "sorghum",
  faostatItem: "Sorghum",
  sudanKgPerHa: 700,
  nearestPeerKgPerHa: 5500,
  peerMedianKgPerHa: 1500,
  usdPerTonne: 300,
  priceBasis: "sudan_export",
  year: 2023,
};
const ctx = { markets: { sorghum: market }, sdgPerUsd: 2500, sdgPerUsdParallel: 3500, locust: null };
const asWeb = (feddans: number, cost: number, tariff: number, m: CropMarket) =>
  phasedFeasibility({
    crop: ALL_CROPS.find((c) => c.key === "sorghum")!,
    station: STATIONS.find((s) => s.key === "kassala")!,
    plantingMonth: 6,
    method: "sprinkler",
    feddans: Number.isFinite(feddans) && feddans > 0 ? feddans : 1,
    costPerFeddan: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    usdPerCubicMetre: Number.isFinite(tariff) && tariff > 0 ? tariff : 0,
    market: m,
  })!;
const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);
for (const [feddans, cost, tariff, price] of [
  [40, 150, 0.02, ""],
  [0, -5, -1, ""],
  [12.5, 90, 0, "420"],
  [7, 0, 0, "abc"],
] as const) {
  const r = feasibilityReport(
    { crop: "sorghum", station: "kassala", plantingMonth: 6, method: "sprinkler", feddans, costPerFeddan: cost, waterTariff: tariff, manualPrice: price },
    ctx,
  )!;
  const typed = Number(price);
  const m = price.trim() !== "" && Number.isFinite(typed) && typed > 0 ? { ...market, usdPerTonne: typed, priceBasis: "manual" as const } : market;
  const w = asWeb(feddans, cost, tariff, m);
  const same =
    close(r.totals.totalCost, w.totalCost) &&
    close(r.totals.marginAtNational, w.marginAtNational) &&
    close(r.totals.revenueAtPeer, w.revenueAtPeer) &&
    close(r.breakEvenKgPerHa, w.breakEvenKgPerHa) &&
    r.lastSafeExit === w.lastSafeExit &&
    r.phases.length === w.phases.length &&
    r.phases.every((p, i) => close(p.breakEvenKgPerHa, w.phases[i].breakEvenKgPerHa) && p.verdict === w.phases[i].verdict);
  ok(same, `${feddans} feddan at $${cost}, tariff ${tariff}, price «${price}»: the app's study equals the page's`);
  const adv = irrigationAdvice("sorghum", "sprinkler", w.feddans, w.water.m3PerFeddan * IRRIGATION_EFFICIENCY.sprinkler);
  ok(r.advice.recommended === adv.recommended && close(r.advice.savingM3PerFeddan, adv.savingM3PerFeddan), "… and so does the irrigation advice");
}
ok(feasibilityReport({ feddans: 0 }, ctx)!.input.feddans === 1, "an area of nothing counts as one feddan, as on the page");
ok(feasibilityReport({ crop: "nonsense", station: "nowhere" }, ctx)!.input.crop === "sorghum", "an unknown crop opens on sorghum, as on the page");
ok(feasibilityReport({}, { ...ctx, markets: null })!.referenceUnavailable === true, "an unreadable reference is said, not shown as «no price»");

// The risks: the same summary as the page, with pest control off the margin first.
{
  const settings = riskSettingsFrom([{ key: "pests", everyYears: 3 }, { key: "theft", applies: true, everyYears: 4, lossPct: 5 }]);
  const r = feasibilityReport({ crop: "sorghum", feddans: 20, costPerFeddan: 100, sprays: 2, sprayUsd: 6, risks: settings }, ctx)!;
  const direct = summariseRisks(settings, r.totals.revenueAtNational, r.totals.marginAtNational! - 2 * 6 * 20);
  ok(close(r.risks.marginAfterUsd, direct.marginAfterUsd) && close(r.risks.expectedTotalUsd, direct.expectedTotalUsd), "the risks: the page's summariseRisks, after pest control");
  ok(r.risks.protectionUsd === 240, "pest control is sprays × the spray × the area");
  ok(JSON.stringify(riskSettingsFrom(undefined)) === JSON.stringify(defaultSettings()), "no settings sent: the sources' figures, as the page opens");
  ok(riskSettingsFrom([{ key: "made_up", applies: true }]).length === defaultSettings().length, "a risk the page does not know is not counted");
}

// The published costs (item 177): as written, only where the page shows them, never in a sum.
{
  const noInputs = ALL_CROPS.find((c) => !CROP_INPUTS[c.key] && publishedCostsFor(c.key).length > 0)!;
  const r = feasibilityReport({ crop: noInputs.key }, ctx)!;
  const want = publishedCostsFor(noInputs.key);
  ok(r.needs === null && r.published.length === want.length, `${noInputs.key}: no input list, so the published costs are shown (${want.length})`);
  ok(
    r.published.every((p, i) => p.figure === want[i].figure && p.season === want[i].season && p.place === want[i].place.ar && p.source === want[i].source && p.url === want[i].url),
    "… each with its figure as written, its year, its place and its source",
  );
  ok(feasibilityReport({ crop: "sorghum" }, ctx)!.published.length === 0, "a crop with an input list shows the platform's estimate instead, as on the page");
  const twice = feasibilityReport({ crop: noInputs.key, costPerFeddan: 100 }, ctx)!;
  ok(close(twice.totals.fieldCost, 100 * 50), "and the study runs on the cost typed, not on a published figure");
}
ok(feasibilityOptions().crops.length === ALL_CROPS.length, "every crop the page offers is offered in the app");

// ── 3. One core for every write and read, the website's and the app's ──────────────────────────────────────────
console.log("── shared cores");
ok(/createPlanFromStudyCore\(/.test(read("src/app/my-project/actions.ts")), "the website's «حوّلها إلى مشروع» calls createPlanFromStudyCore");
ok(/createPlanFromStudyCore\(/.test(read("src/app/api/app/feasibility/project/route.ts")), "… and so does the app's");
ok(/rpc\("input_plan_create"/.test(read("src/lib/studyProject.ts")) && /itemsFromStudy\(crop, feddans\)/.test(read("src/lib/studyProject.ts")), "the list is input_plan_create, its items built on the server");
ok(/planFromAnswers\(/.test(read("src/app/plan/actions.ts")) && /planFromAnswers\(/.test(read("src/app/api/app/plan/route.ts")), "/plan and the app's plan share planFromAnswers");
ok(/listPublishedResearch\(/.test(read("src/app/library/page.tsx")) && /listPublishedResearch\(/.test(read("src/app/api/app/library/route.ts")), "the library list: one read for both");
ok(/loadPublishedResearch\(/.test(read("src/app/library/[id]/page.tsx")) && /loadPublishedResearch\(/.test(read("src/app/api/app/library/[id]/route.ts")), "a library work: one read for both");
ok(/rpc\("research_mine"\)/.test(read("src/app/api/app/library/mine/route.ts")), "«ما أرسلتُه»: the page's research_mine");
ok(/STUDIES/.test(read("src/app/studies/page.tsx")) && /STUDIES/.test(read("src/app/api/app/library/studies/route.ts")), "the studies list: one list for both");

// Sending research: the app takes the website's own two steps at /api/research, and is credited to its account.
const research = read("src/app/api/research/route.ts");
ok(/checkResearch\(input\)/.test(research), "/api/research still checks every sending with checkResearch");
ok(/clientFromBearer\(req\)/.test(research) && /bearer\?\.user \?\? /.test(research), "/api/research credits the phone's session, else the website's cookie, else no one");
const libDart = read("mobile/lib/library.dart");
ok(libDart.includes("/api/research") && /'step': 'upload'/.test(libDart) && /'step': 'submit'/.test(libDart), "the app sends through /api/research, upload then submit");
ok(/object\/upload\/sign\/research\//.test(libDart) && /application\/pdf/.test(libDart), "the PDF goes to the private bucket by the signed upload link, as the browser's does");
ok(/maxBytes/.test(libDart) && /20 \* 1024 \* 1024/.test(libDart), "with the website's limit (PDF, 20 MB) checked before sending");

// ── 4. The readers: the page as rendered ─────────────────────────────────────────────────────────────────────────
console.log("── reading pages");
const readRoute = read("src/app/api/app/library/read/[slug]/route.ts");
ok(/parseStudy\(md\)/.test(readRoute) && /content\/studies\/exchange-rate-ar\.md/.test(readRoute), "the exchange-rate study: the same file through the same parseStudy");
ok(/pageBlocks\(await res\.text\(\)\)/.test(readRoute) && /"\/arc-canal"/.test(readRoute) && /"\/guide"/.test(readRoute), "the canal study and the guide: the rendered pages, read into blocks");
ok(/summarise\(\)/.test(readRoute), "the canal's headline numbers from summarise(), as the page");

const sample = `<html><head><title>x</title><script>var a="<p>no</p>"</script></head><body>
<nav><a href="/">القائمة</a></nav>
<main class="flex-1"><!--$?--><template id="B:0"></template><p>جارٍ التحميل…</p><!--/$--></main>
<div hidden id="S:0"><main class="mx-auto"><h1>دليل الاستخدام</h1>
<section id="status"><h2>ما يعمل الآن</h2><ul><li class="pill">للمزارع</li></ul>
<p>نصٌّ &amp; أرقام <strong>مهمّة</strong> هنا.</p><svg><text>لا</text></svg>
<a href="https://wa.me/?text=x">شارك على واتساب</a><form><input name="q"><button>أرسل</button></form>
<ol><li><span>1</span><div><p class="font-bold">الخطوة</p><p>شرحها</p></div></li><li>ثانية</li></ol>
<div class="note"><h3>بوابة الصرف</h3><div><p>فقرة داخل ملاحظة</p></div></div>
<table><thead><tr><th>المرحلة</th><th>النسبة</th></tr></thead><tbody><tr><td>التحضير</td><td>15٪</td></tr></tbody></table>
<div aria-hidden="true">زخرفة</div><hr></section></main></div><script>$RC("B:0","S:0")</script></body></html>`;
const blocks = pageBlocks(sample);
const texts = JSON.stringify(blocks);
ok(readableRegions(sample).length === 1 && !texts.includes("جارٍ التحميل"), "a streamed page: the content, not the loading screen");
ok(blocks[0]?.kind === "h1" && blocks[1]?.kind === "section", "the title, then the section heading");
ok(blocks.some((b) => b.kind === "p" && b.text === "نصٌّ & أرقام مهمّة هنا."), "a paragraph keeps its inline words, entities decoded");
ok(!/لا"|شارك على واتساب|أرسل|القائمة|var a|زخرفة/.test(texts), "no drawing, share link, form, menu, script or decoration");
ok(blocks.some((b) => b.kind === "ol" && b.items[0] === "1 · الخطوة · شرحها" && b.items[1] === "ثانية"), "a list item is one item, whatever is inside it");
ok(blocks.some((b) => b.kind === "h3" && b.text === "بوابة الصرف") && blocks.some((b) => b.kind === "p" && b.text === "فقرة داخل ملاحظة"), "a note's heading and its text");
ok(blocks.some((b) => b.kind === "table" && JSON.stringify(b.rows) === JSON.stringify([["المرحلة", "النسبة"], ["التحضير", "15٪"]])), "a table, row by row");
ok(blocks.at(-1)?.kind === "hr", "a rule");
ok(blocksFromHtml("<main><p>أ</p></main>").length === 1 && pageBlocks("<body><main><p>ب</p></main></body>").length === 1, "a page that did not stream: its <main>");

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
