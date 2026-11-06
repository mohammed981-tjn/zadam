/**
 * «أراضيّ» و«القطعان» في التطبيق (البند ٢٠٣): the routes the phone app reads them through, held to the website.
 *
 *   npx tsx scripts/verify-app-lands-herds.ts
 *
 * - Every route under /api/app/lands/** and /api/app/herds/** acts as the person signed into the app
 *   (clientFromBearer), refuses with 401 and the Arabic sentence without a session, and holds no server key.
 * - The land card and its water read only the caller's own land: a land's exact place is its owner's and the
 *   administrator's, and the policies also return a farmer's lands to their agent and every land to the administrator.
 * - Every write is the website's own step (src/lib/landOwnerSteps.ts, src/lib/herdSteps.ts), called by the website's
 *   server actions too; the app's routes write nothing directly.
 * - The existing «حدّد أرضك» POST is unchanged in what it saves; the app calls the routes that exist; and the new
 *   screens paint nothing red or orange.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..");
let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const read = (p: string) => readFileSync(join(root, p), "utf8");
const count = (s: string, re: RegExp) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? []).length;

function routes(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...routes(relative(root, p)));
    else if (name === "route.ts") out.push(relative(root, p));
  }
  return out;
}

const LANDS_NEW = [
  "src/app/api/app/lands/mine/route.ts",
  "src/app/api/app/lands/[id]/route.ts",
  "src/app/api/app/lands/[id]/water/route.ts",
  "src/app/api/app/lands/[id]/documents/route.ts",
];
const HERDS = ["src/app/api/app/herds/route.ts", "src/app/api/app/herds/[id]/route.ts"];

console.log("The routes exist");
for (const r of [...LANDS_NEW, ...HERDS]) ok(existsSync(join(root, r)), r);

console.log("\nEach handler is the signed-in person, and holds no server key");
const all = [...routes("src/app/api/app/lands"), ...routes("src/app/api/app/herds")];
ok(all.length >= LANDS_NEW.length + HERDS.length + 1, `${all.length} route files under /api/app/lands and /api/app/herds`);
for (const r of all) {
  const src = read(r);
  const handlers = count(src, /export async function (GET|POST|PUT|PATCH|DELETE)\(/);
  const bearer = count(src, /const auth = await clientFromBearer\(req\);\n\s*if \(!auth\) return NextResponse\.json\((\{ error: "انتهت جلستك\. ادخل من جديد\." \}|SESSION_OVER), \{ status: 401 \}\);/);
  ok(handlers > 0 && bearer === handlers, `${r}: ${handlers} handler(s), each opens with clientFromBearer and a 401`);
  if (src.includes("SESSION_OVER")) ok(/const SESSION_OVER = \{ error: "انتهت جلستك\. ادخل من جديد\." \}/.test(src), `${r}: the 401 says «انتهت جلستك. ادخل من جديد.»`);
  ok(!/createAdminClient|SERVICE_ROLE|supabase\/admin|createClient\(/.test(src), `${r}: no service-role key, no admin client, no client of its own`);
}

console.log("\nThe shared steps hold no server key of their own");
for (const lib of ["src/lib/landOwnerSteps.ts", "src/lib/herdSteps.ts", "src/lib/appLandView.ts"]) {
  const src = read(lib);
  ok(!/createAdminClient|SERVICE_ROLE|supabase\/admin|from "@\/lib\/supabase\/server"|cookies\(/.test(src), `${lib}: takes the caller's client; no admin client, no cookie session`);
}
// The one server-key step on the way is the soil reading at the land's own point, registered as caller 8 in
// src/lib/supabase/admin.ts; it is the website's own (setInvestorConsent and setLandConsent called it before).
ok(/import \{ recordSoilEstimate \} from "@\/lib\/landSoil"/.test(read("src/lib/landOwnerSteps.ts")), "the soil reading is the website's registered one (lib/landSoil)");

console.log("\nOnly the caller's own lands and herds");
for (const r of LANDS_NEW) {
  const src = read(r);
  const reads = count(src, /\.from\("lands"\)/g);
  const own = count(src, /\.from\("lands"\)[\s\S]{0,160}?\.eq\("owner_id", user\.id\)/g);
  ok(reads > 0 && own === reads, `${r}: every read of lands (${reads}) is filtered to owner_id = the caller`);
}
for (const r of HERDS) {
  const src = read(r);
  const reads = count(src, /\.from\("herds"\)/g);
  const own = count(src, /\.from\("herds"\)[\s\S]{0,160}?\.eq\("owner_id", user\.id\)/g);
  ok(reads > 0 && own === reads, `${r}: every read of herds (${reads}) is filtered to owner_id = the caller`);
  const lands = count(src, /\.from\("lands"\)/g);
  const ownLands = count(src, /\.from\("lands"\)[\s\S]{0,160}?\.eq\("owner_id", user\.id\)/g);
  ok(lands === ownLands, `${r}: any land it reads is the caller's own`);
}
const card = read("src/app/api/app/lands/[id]/route.ts");
ok(/if \(!row\) return NextResponse\.json\(NOT_YOURS, \{ status: 404 \}\)/.test(card), "the card answers someone else's land as not found");
ok(/if \(!mine\) return NextResponse\.json\(NOT_YOURS, \{ status: 404 \}\)/.test(card), "a step on someone else's land is refused before anything is sent on");
ok(/phone: r\.status === "accepted" \? r\.investor_phone : null/.test(card), "an investor's phone only once accepted, as the website");
const mine = read("src/app/api/app/lands/mine/route.ts");
ok(!/\blatitude:|\blongitude:|\bboundary:/.test(mine), "the list sends no land's place");
const herdsList = read("src/app/api/app/herds/route.ts");
ok(!/\b(latitude|longitude): (?!number)/.test(herdsList), "the herds page uses the lands' places for distances and sends none");

console.log("\nWrites are the website's own steps");
const steps = (r: string, lib: string, names: string[]) => {
  const src = read(r);
  for (const n of names) ok(new RegExp(`\\b${n}\\(`).test(src) && src.includes(`from "${lib}"`), `${r} calls ${n} from ${lib}`);
};
steps("src/app/api/app/lands/[id]/route.ts", "@/lib/landOwnerSteps", [
  "setLandInvestorConsent",
  "decideLandInvestorInterest",
  "setLandPartnerConsent",
  "decideLandPartnerInterest",
  "addLandTestStep",
  "deleteLandTestStep",
]);
steps("src/app/api/app/lands/[id]/documents/route.ts", "@/lib/landOwnerSteps", ["addLandDocumentStep"]);
steps("src/app/lands/documents/actions.ts", "@/lib/landOwnerSteps", ["addLandDocumentStep"]);
ok(!/from\("land_documents"\)\s*\.insert/.test(read("src/app/lands/documents/actions.ts")), "the website's document action no longer writes the row on its own");
{
  const lib = read("src/lib/landOwnerSteps.ts");
  const core = /export async function addLandDocumentStep\([\s\S]*?\n\}\n/.exec(lib)?.[0] ?? "";
  for (const [needle, what] of [
    ["LAND_DOCUMENT_KEYS.includes(args.kind)", "only the website's document kinds (lib/landDocuments)"],
    ["args.storagePath.startsWith(`${userId}/`)", "only a file in the uploader's own folder"],
    ["evidenceFileExists(supabase, args.storagePath)", "only a file that is there"],
    ['.eq("storage_path", args.storagePath)', "the same file sent twice is the document already recorded"],
    ['from("land_documents").insert(', "the same insert, under row-level security"],
    ["dbMessage(error.message, locale)", "the database's refusals in words"],
    ["created_by: userId", "the document is the uploader's"],
  ] as const) {
    ok(core.includes(needle), `addLandDocumentStep: ${what}`);
  }
  const docs = read("src/app/api/app/lands/[id]/documents/route.ts");
  ok(docs.indexOf('.eq("owner_id", user.id)') > 0 && docs.indexOf('.eq("owner_id", user.id)') < docs.indexOf("uploadAppPhoto("), "the documents route checks the land is the caller's before it stores a photo");
  ok(/uploadAppPhoto\(supabase, user\.id, "lands", body\.photo\)/.test(docs), "a photo goes where the website's upload puts it (<user>/lands), stripped of its EXIF (lib/appPhoto)");
  ok(/ownPdfPath\(user\.id, "lands", body\.storage_path\)/.test(docs), "a PDF is accepted only from the caller's own lands folder (the website accepts PDF)");
  ok(/if \(!r\.ok\) \{\s*await discardAppPhoto\(supabase, storagePath\);/.test(docs), "a file the database refused is removed again");
  ok(read("src/components/EvidenceUpload.tsx").includes('"application/pdf": "pdf"') && /folder="lands"/.test(read("src/components/LandDocuments.tsx")), "the website's land upload is the evidence bucket's lands folder, PDF included");
}
steps("src/app/api/app/herds/route.ts", "@/lib/herdSteps", ["createHerdWithPlan"]);
steps("src/app/api/app/herds/[id]/route.ts", "@/lib/herdSteps", [
  "completeHerdStageStep",
  "setHerdBudgetStep",
  "addHerdHealthRecord",
  "addHerdTagRange",
  "loadHerdReadiness",
]);
steps("src/app/invest/actions.ts", "@/lib/landOwnerSteps", ["decideLandInvestorInterest"]);
// Opening a land to investors is one shared step (src/lib/investSteps.ts): the website, the invest route and the land
// card all reach it — the land card through setLandInvestorConsent, which delegates to it.
steps("src/app/invest/actions.ts", "@/lib/investSteps", ["setInvestorConsent"]);
ok(/await setInvestorConsent\(supabase, userId, input/.test(read("src/lib/landOwnerSteps.ts")), "setLandInvestorConsent delegates to investSteps' setInvestorConsent");
ok(read("src/lib/investSteps.ts").includes('rpc("land_set_investor_consent"'), "src/lib/investSteps.ts calls the database's land_set_investor_consent");
steps("src/app/partners/actions.ts", "@/lib/landOwnerSteps", ["setLandPartnerConsent", "decideLandPartnerInterest"]);
steps("src/app/lands/actions.ts", "@/lib/landOwnerSteps", ["addLandTestStep", "deleteLandTestStep"]);
steps("src/app/herds/actions.ts", "@/lib/herdSteps", [
  "createHerdWithPlan",
  "completeHerdStageStep",
  "setHerdBudgetStep",
  "addHerdHealthRecord",
  "addHerdTagRange",
]);
steps("src/app/herds/[id]/page.tsx", "@/lib/herdSteps", ["loadHerdReadiness"]);
// The reads the website's /lands page makes through functions; nothing else is called directly.
const READ_RPCS = new Set(["land_investor_requests", "land_inspection_list", "land_investor_profiles"]);
for (const r of all.filter((r) => r !== "src/app/api/app/lands/route.ts")) {
  const src = read(r);
  const rpcs = [...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  ok(
    !/\.(insert|update|upsert|delete)\(/.test(src) && rpcs.every((f) => READ_RPCS.has(f)),
    `${r}: writes nothing directly — every write is a shared step${rpcs.length ? ` (reads: ${rpcs.join(", ")})` : ""}`,
  );
}
for (const [lib, rpcs] of [
  ["src/lib/landOwnerSteps.ts", ["land_investor_decide", "land_set_partner_consent", "land_interest_decide"]],
  ["src/lib/herdSteps.ts", ["herd_health_add", "herd_tags_add_range"]],
] as const) {
  const src = read(lib);
  for (const f of rpcs) ok(src.includes(`rpc("${f}"`), `${lib} calls the database's ${f}`);
}

console.log("\nThe existing «حدّد أرضك» POST is as it was");
const post = read("src/app/api/app/lands/route.ts");
ok(/export async function POST\(req: Request\)/.test(post) && !/export async function GET/.test(post), "POST /api/app/lands is still the one handler there");
ok(/verification: "submitted",\s*\n\s*listed: false,/.test(post), "it still saves the land submitted and unlisted");
ok(/landInputProblem\(input/.test(post), "and checks it with the website's landInputProblem");

console.log("\nThe app calls these routes, and paints nothing red or orange");
const landsDart = read("mobile/lib/lands.dart");
const herdsDart = read("mobile/lib/herds.dart");
for (const p of ["'/api/app/lands/mine'", "'/api/app/lands/$id'", "'/api/app/lands/$id/water'", "'/api/app/lands/$id/documents'"]) ok(landsDart.includes(p), `mobile/lib/lands.dart calls ${p}`);
ok(/attach\('lands', file\)/.test(landsDart), "a land's document leaves the phone for the lands folder, as the website's");
ok(!read("mobile/lib/screens/lands_screen.dart").includes("ارفع المستندات من الموقع"), "the land card no longer sends the owner to the website for documents");
for (const p of ["'/api/app/herds'", "'/api/app/herds/$id'", "'/api/app/herds/$id?to=$destination'"]) ok(herdsDart.includes(p), `mobile/lib/herds.dart calls ${p}`);
ok(/accountController/.test(landsDart) && /accountController/.test(herdsDart), "both through the app's signed-in account (AccountController.call)");
for (const f of [
  "mobile/lib/lands.dart",
  "mobile/lib/herds.dart",
  "mobile/lib/evidence.dart",
  "mobile/lib/screens/lands_screen.dart",
  "mobile/lib/screens/herds_screen.dart",
  "mobile/lib/screens/evidence_sheet.dart",
]) {
  const src = read(f);
  // Colours come from theme.dart (beige and green; its «error» is the dark gold): no named red or orange, and no
  // colour literal of its own that could be one.
  ok(!/Colors\.(red|orange|deepOrange|pink)|Color\(0x/.test(src), `${f}: no red, no orange, no colour outside the theme`);
}
ok(/const LandsScreen\(\{super\.key, this\.api\}\)/.test(read("mobile/lib/screens/lands_screen.dart")), "LandsScreen takes no required argument");
ok(/const HerdsScreen\(\{super\.key, this\.api\}\)/.test(read("mobile/lib/screens/herds_screen.dart")), "HerdsScreen takes no required argument");
ok(/LandMapScreen\(\)/.test(read("mobile/lib/screens/lands_screen.dart")), "the lands list opens the existing LandMapScreen to add a land");

if (fail) {
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
