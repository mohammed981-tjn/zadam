/**
 * «الأسعار والسوق» و«التصدير» في التطبيق (البند ٢٠٣): the app's routes act as the person or as a visitor, never with
 * the project's key, and they read the very loaders the website's pages read — so a figure in the app and the same
 * figure on the site cannot disagree.
 *
 *   npx tsx scripts/verify-app-prices-export.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function routesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routesUnder(p);
    return name === "route.ts" ? [p] : [];
  });
}

const PRICES = "src/app/api/app/prices";
const EXPORT = "src/app/api/app/export";
const routes = [...routesUnder(PRICES), ...routesUnder(EXPORT)];
ok(routes.length >= 7, `the app's prices and export routes exist (${routes.length})`);

// ── 1) Per-user routes: every handler starts from the person's own session ─────────────────────────────────────
const PER_USER = [
  `${PRICES}/alerts/route.ts`,
  `${PRICES}/alerts/stop/route.ts`,
  `${EXPORT}/offers/route.ts`,
  `${EXPORT}/offers/move/route.ts`,
];
const EXPIRED = `{ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 }`;
for (const p of PER_USER) {
  const src = read(p);
  ok(src.length > 0, `${p} exists`);
  const handlers = [...src.matchAll(/export async function (GET|POST)\(req: Request[^)]*\) \{\n([\s\S]*?)\n\}/g)];
  ok(handlers.length > 0, `${p}: has handlers`);
  for (const [, method, body] of handlers) {
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    ok(lines[0] === "const auth = await clientFromBearer(req);", `${p} ${method}: starts with clientFromBearer`);
    ok(lines[1] === `if (!auth) return NextResponse.json(${EXPIRED});`, `${p} ${method}: 401 with the expired-session sentence when there is no session`);
  }
  ok(!/createPublicClient|createClient\(|@\/lib\/supabase\/server/.test(src), `${p}: reads and writes only as the person (no public or cookie client)`);
}

// ── 2) Public routes: the visitor's key, as the website's public pages read ───────────────────────────────────
const PUBLIC = [`${PRICES}/route.ts`, `${PRICES}/rates/route.ts`, `${PRICES}/inputs/route.ts`, `${EXPORT}/route.ts`, `${EXPORT}/study/route.ts`];
for (const p of PUBLIC) {
  const src = read(p);
  ok(src.length > 0, `${p} exists`);
  ok(!/clientFromBearer|@\/lib\/supabase\/server/.test(src), `${p}: public — no session needed, none read`);
}
ok(routes.every((p) => PER_USER.includes(p) || PUBLIC.includes(p)), "every route is listed here as per-user or public");

// ── 3) No elevated key anywhere on the path ──────────────────────────────────────────────────────────────────────
const SHARED = ["src/lib/priceBoards.ts", "src/lib/priceAlerts.ts", "src/lib/exportCorridors.ts", "src/lib/exportReadiness.ts"];
const ELEVATED = /SERVICE_ROLE|service_role_key|createAdminClient|@\/lib\/supabase\/admin/;
for (const p of routes) ok(!ELEVATED.test(read(p)), `${p}: no service-role key`);
// priceAlerts.ts is handed an admin client by the daily run (evaluatePriceAlerts) but never makes one itself.
for (const p of SHARED) ok(read(p).length > 0 && !ELEVATED.test(read(p)), `${p}: never makes an elevated client`);

// ── 4) The website and the app read the same loader ────────────────────────────────────────────────────────────
const same: [string, string, string][] = [
  ["loadMarketBoard", "src/app/market/page.tsx", `${PRICES}/route.ts`],
  ["loadRates", "src/app/rates/page.tsx", `${PRICES}/rates/route.ts`],
  ["loadInputBoard", "src/app/market/inputs/page.tsx", `${PRICES}/inputs/route.ts`],
  ["loadPriceAlerts", "src/app/market/alerts/page.tsx", `${PRICES}/alerts/route.ts`],
  ["createPriceAlertFor", "src/app/market/alerts/actions.ts", `${PRICES}/alerts/route.ts`],
  ["stopPriceAlertFor", "src/app/market/alerts/actions.ts", `${PRICES}/alerts/stop/route.ts`],
  ["loadExportChoices", "src/app/export/offers/page.tsx", `${EXPORT}/route.ts`],
  ["loadMyExportOffers", "src/app/export/offers/page.tsx", `${EXPORT}/offers/route.ts`],
  ["createExportOffer", "src/app/export/offers/actions.ts", `${EXPORT}/offers/route.ts`],
  ["moveExportOffer", "src/app/export/offers/actions.ts", `${EXPORT}/offers/move/route.ts`],
  ["fetchReadiness", "src/app/export/offers/[id]/page.tsx", `${EXPORT}/offers/route.ts`],
  ["readinessVerdict", "src/components/ExportReadiness.tsx", `${EXPORT}/offers/route.ts`],
];
const called = (src: string, fn: string) => new RegExp(`\\b${fn}\\(`).test(src) && new RegExp(`import[^;]*\\b${fn}\\b[^;]*from`).test(src);
for (const [fn, site, app] of same) {
  ok(called(read(site), fn) && called(read(app), fn), `${fn}: the website (${site}) and the app (${app}) both call it`);
}

// The study on /export is constants, not a loader: both read every section from the same module.
const studyPage = read("src/app/export/page.tsx");
const studyRoute = read(`${EXPORT}/study/route.ts`);
for (const k of ["HEADLINE", "COMMODITIES", "GATES", "DEADLINES", "LIMITS", "MONEY_KNOT", "REJECTION"]) {
  const fromTrade = (src: string) => new RegExp(`import \\{[^}]*\\b${k}\\b[^}]*\\} from "@/lib/exportTrade"`).test(src);
  ok(fromTrade(studyPage) && fromTrade(studyRoute), `${k}: /export and the app's study read it from src/lib/exportTrade.ts`);
}

// ── 5) Nothing left inline that the loaders now hold — a copy would be a second answer ───────────────────────
const market = read("src/app/market/page.tsx");
ok(!/currentMarketPrices\(|CROP_ORDER = |fetchFewsPrices\(/.test(market), "/market computes nothing the loader holds");
ok(!/fetchCrossRates\(|poundsPer\(/.test(read("src/app/rates/page.tsx")), "/rates computes nothing the loader holds");
ok(!/rpc\("input_price_summary"/.test(read("src/app/market/inputs/page.tsx")), "/market/inputs reads the board only through the loader");
ok(!/rpc\("price_alert_create"|rpc\("price_alert_stop"/.test(read("src/app/market/alerts/actions.ts")), "the alert actions write only through the shared functions");
ok(!/from\("export_offers"\)\s*\.insert|from\("export_offers"\)\s*\.update/.test(read("src/app/export/offers/actions.ts")), "the offer actions write only through the shared functions");
ok(/rpc\("price_alert_create"/.test(read("src/lib/priceAlerts.ts")) && /rpc\("price_alert_stop"/.test(read("src/lib/priceAlerts.ts")), "alerts are written through the database's own functions");
ok(/rpc\("export_corridor_for"/.test(read("src/lib/exportCorridors.ts")), "an offer opens its corridor through export_corridor_for, as the website did");

// ── 6) The phone: signed-in calls go through the account's one helper; public reads carry no key of ours ────────
const prices = read("mobile/lib/prices.dart");
const exp = read("mobile/lib/export.dart");
ok(prices.length > 0 && exp.length > 0, "the app's prices and export clients exist");
ok(/accountController\.call\('GET', '\/api\/app\/prices\/alerts'\)/.test(prices), "the app lists alerts with the person's session");
ok(/accountController\.call\('POST', '\/api\/app\/prices\/alerts'/.test(prices), "the app adds alerts with the person's session");
ok(/accountController\.call\('POST', '\/api\/app\/prices\/alerts\/stop'/.test(prices), "the app stops alerts with the person's session");
ok(/accountController\.call\('GET', '\/api\/app\/export\/offers'\)/.test(exp), "the app reads its offers with the person's session");
ok(/accountController\.call\('POST', '\/api\/app\/export\/offers'/.test(exp), "the app saves an offer with the person's session");
ok(/accountController\.call\('POST', '\/api\/app\/export\/offers\/move'/.test(exp), "the app moves an offer with the person's session");
for (const [name, src] of [["prices.dart", prices], ["export.dart", exp]] as const) {
  ok(!/service_role|SERVICE_ROLE|supabaseAnonKey|rest\/v1/.test(src), `${name}: talks to the website's routes only, with no database key`);
}
for (const m of [...prices.matchAll(/'(\/api\/app\/[a-z/]+)/g), ...exp.matchAll(/'(\/api\/app\/[a-z/]+)/g)]) {
  ok(existsSync(join("src/app", m[1].replace(/^\//, ""), "route.ts")), `the app's path ${m[1]} has a route`);
}

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
