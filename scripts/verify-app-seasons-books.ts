/**
 * The app's seasons and books (backlog 203): every route under /api/app/seasons and /api/app/books acts as the
 * signed-in person, holds no elevated key, and writes only through the same function the website's action calls —
 * so the phone cannot write what the website would refuse, nor be refused in other words.
 *
 *   npx tsx scripts/verify-app-seasons-books.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function routes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === "route.ts" ? [p] : [];
  });
}

/** The body of an exported handler, from its signature to the next export (or the end). */
function handler(src: string, method: "GET" | "POST"): string | null {
  const start = src.search(new RegExp(`export async function ${method}\\(`));
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

const ELEVATED = /SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|service_role|createAdminClient|createServiceClient|@\/lib\/supabase\/admin|supabase\/admin["']/;
const SESSION_EXPIRED = `{ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 }`;

// ── 1. Every route: the bearer session first, a 401 without it, and no elevated key ──────────────────────────────────

const expected = [
  "src/app/api/app/seasons/route.ts",
  "src/app/api/app/seasons/[id]/route.ts",
  "src/app/api/app/seasons/[id]/entries/route.ts",
  "src/app/api/app/seasons/[id]/stages/route.ts",
  "src/app/api/app/seasons/[id]/evidence/route.ts",
  "src/app/api/app/books/route.ts",
  "src/app/api/app/books/links/route.ts",
  "src/app/api/app/books/assets/route.ts",
];
const found = [...routes("src/app/api/app/seasons"), ...routes("src/app/api/app/books")];
for (const p of expected) ok(found.includes(p), `the route exists: ${p}`);

for (const p of found) {
  const src = read(p);
  ok(/import \{ clientFromBearer \} from "@\/lib\/supabase\/bearer";/.test(src), `${p}: reads the app's session from its bearer token`);
  ok(!ELEVATED.test(src), `${p}: holds no service-role key and no admin client`);
  ok(!/@\/lib\/supabase\/server/.test(src), `${p}: does not reach for the website's cookie client`);
  for (const m of ["GET", "POST"] as const) {
    const body = handler(src, m);
    if (body === null) continue;
    const lines = body.split("\n").map((l) => l.trim());
    ok(lines[1] === "const auth = await clientFromBearer(req);", `${p} ${m}: begins with \`const auth = await clientFromBearer(req)\``);
    ok(lines[2] === `if (!auth) return NextResponse.json(${SESSION_EXPIRED});`, `${p} ${m}: answers 401 «انتهت جلستك» with no session`);
    if (m === "GET") {
      ok(!/\.(insert|update|upsert|delete)\(/.test(body), `${p} GET: reads only`);
    } else {
      // A write is the shared function's, never a table or a database function called from the route itself.
      ok(!/\.from\(|\.rpc\(/.test(body), `${p} POST: writes nothing directly — only through the shared function`);
    }
  }
}

// ── 2. The shared functions: the website's action and the app's route call the same one ─────────────────────────────

const shared: { lib: string; fns: string[]; route: string; action: string; banned: RegExp; what: string }[] = [
  {
    lib: "src/lib/seasonWrites.ts",
    fns: ["recordLedgerEntry"],
    route: "src/app/api/app/seasons/[id]/entries/route.ts",
    action: "src/app/seasons/actions.ts",
    banned: /from\("ledger_entries"\)\s*\.insert/,
    what: "a ledger entry",
  },
  {
    lib: "src/lib/seasonWrites.ts",
    fns: ["signOffStage"],
    route: "src/app/api/app/seasons/[id]/stages/route.ts",
    action: "src/app/seasons/actions.ts",
    banned: /from\("season_stages"\)\s*\.update/,
    what: "signing off a stage",
  },
  {
    lib: "src/lib/seasonWrites.ts",
    fns: ["addStageEvidence"],
    route: "src/app/api/app/seasons/[id]/evidence/route.ts",
    action: "src/app/seasons/actions.ts",
    banned: /from\("stage_evidence"\)\s*\.insert/,
    what: "a stage's evidence",
  },
  {
    lib: "src/lib/ledgerLinkWrites.ts",
    fns: ["answerLink"],
    route: "src/app/api/app/books/links/route.ts",
    action: "src/app/books/actions.ts",
    banned: /rpc\("ledger_link_(confirm|reject|cancel|reversal_request|reversal_accept|reversal_reject|reversal_withdraw)"/,
    what: "an answer to a partner's entry",
  },
  {
    lib: "src/lib/fixedAssetWrites.ts",
    fns: ["addFixedAsset", "depreciateFarmAssets", "disposeFixedAsset"],
    route: "src/app/api/app/books/assets/route.ts",
    action: "src/app/books/assets/actions.ts",
    banned: /rpc\("ledger_(asset_add|asset_depreciate|asset_dispose|open_book)"/,
    what: "a fixed asset",
  },
];

for (const s of shared) {
  const lib = read(s.lib);
  const route = read(s.route);
  const action = read(s.action);
  ok(!ELEVATED.test(lib), `${s.lib}: holds no service-role key`);
  ok(/supabase: SupabaseClient/.test(lib), `${s.lib}: takes the caller's own client`);
  ok(!/next\/headers|cookies\(\)|redirect\(|revalidatePath\(/.test(lib), `${s.lib}: is bound to no cookie, redirect or cache`);
  for (const fn of s.fns) {
    ok(new RegExp(`export async function ${fn}\\(`).test(lib), `${s.lib} exports ${fn}`);
    ok(new RegExp(`\\b${fn}\\(`).test(route), `the app's route writes ${s.what} through ${fn}`);
    ok(new RegExp(`\\b${fn}\\(`).test(action), `the website's action writes ${s.what} through ${fn}`);
  }
  ok(!s.banned.test(action), `the website's action no longer writes ${s.what} on its own`);
  ok(!s.banned.test(route), `the app's route does not write ${s.what} on its own`);
}

// The ledger entry keeps every check the website's form had.
const writes = read("src/lib/seasonWrites.ts");
for (const [needle, what] of [
  ["parseLedgerEntryInput(", "the amount, currency, rate and payer are read as the website reads them"],
  ["ledgerEntryDate(", "a late entry keeps its day only on the website's terms"],
  ['.eq("season_id", seasonId)', "a stage from another season is refused"],
  ["dbMessage(error.message, locale)", "the ledger's own refusals come back in words"],
  ["created_by: userId", "the entry is the writer's"],
] as const) {
  ok(writes.includes(needle), `recordLedgerEntry: ${what}`);
}

// A stage's evidence keeps every check the website's action had, and the app's file lands where the website's does.
const evidenceCore = /export async function addStageEvidence\([\s\S]*?\n\}\n/.exec(writes)?.[0] ?? "";
for (const [needle, what] of [
  ["STAGE_EVIDENCE_KINDS.includes(args.kind)", "only the kinds the website's action accepts"],
  ["args.storagePath.startsWith(`${userId}/`)", "only a file in the writer's own folder"],
  ["evidenceFileExists(supabase, args.storagePath)", "only a file that is there"],
  ['.eq("storage_path", args.storagePath)', "the same file sent twice is the evidence already recorded"],
  ["sanitisePhotoMetadata(args.metadata)", "the capture time and place are kept only as the website keeps them"],
  ['from("stage_evidence").insert(', "the same insert, under row-level security"],
  ["dbMessage(error.message, locale)", "the database's refusals come back in words"],
  ["created_by: userId", "the evidence is the writer's"],
] as const) {
  ok(evidenceCore.includes(needle), `addStageEvidence: ${what}`);
}
ok(/"photo", "invoice", "inspection", "note"/.test(writes), "addStageEvidence accepts the website's four kinds");
const evidenceRoute = read("src/app/api/app/seasons/[id]/evidence/route.ts");
const orderOf = (needle: string) => evidenceRoute.indexOf(needle);
ok(orderOf("isStageOfSeason(supabase, stageId, id)") > 0 && orderOf("isStageOfSeason(") < orderOf("uploadAppPhoto("), "the app's route asks that the stage is this season's before it stores a photo");
ok(/uploadAppPhoto\(supabase, user\.id, "stages", body\.photo\)/.test(evidenceRoute), "a photo goes where the website's upload puts it (<user>/stages), stripped of its EXIF (lib/appPhoto)");
ok(/ownPdfPath\(user\.id, "stages", body\.storage_path\)/.test(evidenceRoute), "a PDF is accepted only from the caller's own stages folder");
ok(/if \(!r\.ok\) \{\s*await discardAppPhoto\(supabase, storagePath\);/.test(evidenceRoute), "a file the database refused is removed again");
ok(/attach\('stages', file\)/.test(read("mobile/lib/seasons.dart")) && /\/evidence'/.test(read("mobile/lib/seasons.dart")), "the app sends a stage's evidence to its route, from the stages folder");
ok(!read("mobile/lib/screens/season_screen.dart").includes("ارفع دليلاً (من الموقع)"), "the season page no longer sends the farmer to the website for evidence");
ok(/storage\/v1\/object\/evidence\/\$path/.test(read("mobile/lib/evidence.dart")) && /'\$user\/\$folder\//.test(read("mobile/lib/evidence.dart")), "the app's PDF goes to the evidence bucket under the person's own id, as the browser's");
ok(/evidenceMaxBytes = 10 \* 1024 \* 1024/.test(read("mobile/lib/evidence.dart")) && /MAX_BYTES = 10 \* 1024 \* 1024/.test(read("src/components/EvidenceUpload.tsx")), "the app holds a file to the website's ten megabytes");
const webKinds = [...read("src/components/StageEvidence.tsx").matchAll(/value: "(\w+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
const appKinds = /const stageEvidenceKinds = <\(String, String\)>\[([\s\S]*?)\];/.exec(read("mobile/lib/seasons.dart"))?.[1] ?? "";
ok(webKinds.length === 3 && webKinds.every(([k, l]) => appKinds.includes(`('${k}', '${l}')`)), "the app offers the website's stage evidence kinds, in its words");

// ── 3. The reads go through the website's own loaders ────────────────────────────────────────────────────────────

const books = read("src/app/api/app/books/route.ts");
for (const fn of ["parseReportParams(", "pickBook(", "loadReport(", "loadLinks("]) {
  ok(books.includes(fn), `/api/app/books reads with the page's ${fn.slice(0, -1)}`);
}
const season = read("src/app/api/app/seasons/[id]/route.ts");
for (const fn of ["summariseLedger(", "budgetVsActual(", "disbursementDecision(", "revalueOpenPounds(", "standingCropValue("]) {
  ok(season.includes(fn), `/api/app/seasons/[id] works its figures out with the page's ${fn.slice(0, -1)}`);
}

// ── 4. The app follows the website: its routes, its steps, its outbox rules, its items ──────────────────────────────

const dartSeasons = read("mobile/lib/seasons.dart");
const dartBooks = read("mobile/lib/books.dart");
const dartBooksScreen = read("mobile/lib/screens/books_screen.dart");
ok(/'\/api\/app\/seasons'/.test(dartSeasons) && /\/entries'/.test(dartSeasons) && /\/stages'/.test(dartSeasons), "the app calls the seasons routes");
ok(/\/api\/app\/books\?/.test(dartBooks) && /'\/api\/app\/books\/links'/.test(dartBooks) && /'\/api\/app\/books\/assets'/.test(dartBooks), "the app calls the books routes");
ok(/accountController/.test(dartSeasons) && /\.call\('(GET|POST)'/.test(dartSeasons) && /\.call\('(GET|POST)'/.test(dartBooks), "the app calls them through the account's one signed-in request");

const answersBlock = /export const LINK_ANSWERS = \[([\s\S]*?)\] as const;/.exec(read("src/lib/ledgerLinkWrites.ts"))?.[1] ?? "";
const linkAnswers = [...answersBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
ok(linkAnswers.length === 7, "the website's seven answers to a partner's entry are listed");
for (const a of linkAnswers) ok(dartBooksScreen.includes(`'${a}'`), `the app offers the website's step «${a}»`);

const outbox = read("src/lib/outbox.ts");
const num = (re: RegExp, src: string) => Number(re.exec(src)?.[1]?.replace(/_/g, ""));
ok(num(/MAX_ITEMS = (\d+)/, outbox) === num(/maxItems = (\d+)/, dartSeasons), "the app keeps as many entries at most as the website (MAX_ITEMS)");
ok(num(/MAX_AGE_MS = (\d+) \*/, outbox) === num(/maxAge = Duration\(days: (\d+)\)/, dartSeasons), "and for as many days (MAX_AGE_MS)");
ok(num(/MAX_VALUE_CHARS = ([\d_]+)/, outbox) === num(/maxValueChars = (\d+)/, dartSeasons), "and no longer a field (MAX_VALUE_CHARS)");
ok(num(/DUPLICATE_WINDOW_MS = ([\d_]+)/, outbox) === num(/duplicateWindow = Duration\(minutes: (\d+)\)/, dartSeasons) * 60_000, "and the same double-tap window");
ok(/'ledger:\$seasonId'/.test(dartSeasons) && /'ledger:unassigned'/.test(dartSeasons), "the app keys a kept entry by its season, as the website does");
ok(/putIfAbsent\('entry_date'/.test(dartSeasons), "a kept entry carries the day it was written");

// The idempotency key (20261106060000_ledger_client_key.sql): the same field on both sides, given before the first
// attempt, carried by the insert, and a resend refused by the key's index read as the same success.
ok(/CLIENT_KEY_FIELD = "client_key"/.test(outbox) && /const clientKeyField = 'client_key';/.test(dartSeasons), "the app and the website name the entry's key alike (client_key)");
ok(/clientKeyField: outbox\.newKey\(\)/.test(dartSeasons), "the app gives an entry its key before the first attempt, and keeps it with that key");
ok(/stampClientKey\(formData\)/.test(read("src/components/OfflineForm.tsx")) && /clientKey\s*\n/.test(read("src/app/seasons/[id]/page.tsx")), "the season page's form gives an entry its key before the first attempt");
ok(/clientKey: true/.test(read("src/app/seasons/offline/BlankLedgerForm.tsx")), "and so does the blank form, when it keeps one");
ok(/client_key: str\(formData, "client_key"\)/.test(read("src/app/seasons/actions.ts")), "the website's action passes the key on");
ok(/client_key: text\("client_key", \d+\)/.test(read("src/app/api/app/seasons/[id]/entries/route.ts")), "and so does the app's route");
ok(/client_key: clientKey/.test(writes) && /isAlreadySaved\(error\)\) return \{ ok: true, already: true \}/.test(writes), "recordLedgerEntry inserts the key, and reads a resend as «already saved»");
const keyMigration = read("supabase/migrations/20261106060000_ledger_client_key.sql");
ok(keyMigration.includes(`create unique index if not exists ledger_entries_season_client_key`) && /\(season_id, client_key\)\s*\n\s*where client_key is not null/.test(keyMigration), "the key's index is per season, and only for entries that have a key");
ok(new RegExp(`CLIENT_KEY_INDEX = "ledger_entries_season_client_key"`).test(writes), "the server names the same index the migration makes");
ok(!/create policy|drop policy|alter policy/i.test(keyMigration), "the key's migration adds, drops and changes no policy");

const labels = Object.fromEntries([...read("src/lib/season.ts").matchAll(/^\s+(\w+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]));
const dartCategories = [...dartSeasons.matchAll(/\('(\w+)', '([^']+)'\),/g)].map((m) => [m[1], m[2]] as const);
for (const key of ["seeds", "fertiliser", "pesticide", "labour", "irrigation", "transport", "other", "revenue"]) {
  ok(dartCategories.some(([k, l]) => k === key && l === labels[key]), `the app's item «${labels[key]}» is the website's (${key})`);
}

// The owner's standing rule for the app: no red and no orange.
for (const p of [
  "mobile/lib/seasons.dart",
  "mobile/lib/books.dart",
  "mobile/lib/evidence.dart",
  "mobile/lib/screens/seasons_screen.dart",
  "mobile/lib/screens/season_screen.dart",
  "mobile/lib/screens/books_screen.dart",
  "mobile/lib/screens/evidence_sheet.dart",
]) {
  const src = read(p);
  ok(src.length > 0, `${p} exists`);
  ok(!/Colors\.(red|orange|deepOrange|redAccent|orangeAccent|pink)/.test(src) && !/Color\(0x[Ff]{2}[Ff][0-9A-Fa-f]{5}\)/.test(src), `${p}: no red, no orange`);
}

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
