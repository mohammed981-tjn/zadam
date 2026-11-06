/**
 * The phone app's contracts and investment (backlog 203): the routes under /api/app/contracts and /api/app/invest act
 * as the signed-in person and hold no elevated key, and every step they take is the very step the website's buttons
 * take — the same shared function, the same database function — so the contract guards (risk notice acknowledged,
 * area and land checks, signer identity, the version and fingerprint signed) apply identically. And the app's screens
 * offer the website's buttons, in the website's words.
 *
 *   npx tsx scripts/verify-app-contracts-invest.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const read = (p: string) => readFileSync(p, "utf8");

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routes(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const ELEVATED = /createAdminClient|SERVICE_ROLE|service_role|SUPABASE_SERVICE/;
const all = [...routes("src/app/api/app/contracts"), ...routes("src/app/api/app/invest")];
ok(all.length >= 12, `the app's contract and investment routes are there (${all.length})`);

// ── every route: the caller's own session, and nothing elevated ──────────────
for (const file of all) {
  const src = read(file);
  const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(([\s\S]*?)(?=\nexport async function |\n\/\*\*|$)/g)];
  ok(handlers.length > 0, `${file}: has a handler`);
  for (const [, method, body] of handlers) {
    const first = body.search(/\.(rpc|from)\(/);
    const auth = body.indexOf("clientFromBearer(req)");
    ok(auth >= 0 && (first < 0 || auth < first), `${file} ${method}: opens with clientFromBearer(req), before any read or write`);
    const optional = /const sent = Boolean\(req\.headers\.get\("authorization"\)\)/.test(body);
    if (optional) {
      // A page open to a visitor: a sent session that is refused is refused, never quietly read as a visitor.
      ok(/if \(sent && !auth\) return NextResponse\.json\(\{ error: "انتهت جلستك\. ادخل من جديد\." \}, \{ status: 401 \}\)/.test(body),
        `${file} ${method}: a refused session is a 401, not a visitor`);
      ok(/auth\?\.supabase \?\? createPublicClient\(\)/.test(body), `${file} ${method}: a visitor reads with the anon key (RLS as for anyone)`);
    } else {
      ok(/if \(!auth\) return NextResponse\.json\(\{ error: "انتهت جلستك\. ادخل من جديد\." \}, \{ status: 401 \}\)/.test(body),
        `${file} ${method}: 401 «انتهت جلستك. ادخل من جديد.» without a session`);
    }
  }
  ok(!ELEVATED.test(src), `${file}: no service-role key, no admin client`);
  ok(!/createClient\(\)|@\/lib\/supabase\/server/.test(src), `${file}: no cookie client`);
}

// The shared pieces the routes lean on hold nothing elevated either. investSteps reaches the soil reading the
// website's setInvestorConsent and the app's land route already use (recordSoilEstimate → land_set_soil_estimate,
// which checks the actor owns the land); it is named here so a second path cannot slip in unnoticed.
for (const lib of ["src/lib/contractSteps.ts", "src/lib/investSteps.ts", "src/lib/appRoute.ts", "src/lib/appInvest.ts"]) {
  ok(!ELEVATED.test(read(lib)), `${lib}: no service-role key, no admin client`);
}
const investSteps = read("src/lib/investSteps.ts");
ok((investSteps.match(/recordSoilEstimate\(/g) ?? []).length === 1, "investSteps: the one server-side soil reading, as on the website");

// ── the same step, on the website and in the app ─────────────────────────────
const steps = read("src/lib/contractSteps.ts");
const web = {
  contract: read("src/app/contracts/actions.ts"),
  forward: read("src/app/market/forward/actions.ts"),
  agreement: read("src/app/invest/agreements/actions.ts"),
  invest: read("src/app/invest/actions.ts"),
  inspection: read("src/app/invest/inspections/actions.ts"),
};
const app = {
  service: read("src/app/api/app/contracts/service/[id]/route.ts"),
  forward: read("src/app/api/app/contracts/forward/[id]/route.ts"),
  sign: read("src/app/api/app/contracts/agreements/[id]/sign/route.ts"),
  interest: read("src/app/api/app/invest/interest/route.ts"),
  consent: read("src/app/api/app/invest/consent/route.ts"),
  inspection: read("src/app/api/app/invest/inspection/route.ts"),
};

// Partnership agreement: one function signs, and both callers call it.
ok(/export async function signPartnershipAgreement[\s\S]*?\.rpc\("partnership_agreement_sign"/.test(steps), "contractSteps: signPartnershipAgreement calls partnership_agreement_sign");
ok(/export async function signAgreement[\s\S]*?signPartnershipAgreement\(/.test(web.agreement), "the website's signAgreement signs through signPartnershipAgreement");
ok(/signPartnershipAgreement\(\s*auth\.supabase/.test(app.sign), "the app's sign route signs through signPartnershipAgreement, as the caller");
ok(/agree: text\(body, "agree"/.test(app.sign) && /fullName: text\(body, "full_name"/.test(app.sign), "the app sends the confirmation and the typed full name, checked server-side");
ok(/version: num\(body, "version"\)/.test(app.sign) && /hash: text\(body, "hash"/.test(app.sign), "the app signs the version and fingerprint it was shown");
ok(/if \(input\.agree !== "yes"\)/.test(steps), "contractSteps: no signature without «قرأتُ العقد كاملاً وأوافق»");
ok(/fullName\.length < 5/.test(steps), "contractSteps: the full name, as on the website (five letters at least)");
ok(/userAgent: req\.headers\.get\("user-agent"\)/.test(app.sign), "the app's user agent is read from the request, as the website reads it");

// The signature's shape: the pad's, the table's, the shared check's.
const migration = read("supabase/migrations/20261021230000_partnership_agreements.sql");
ok(/signature ~ '\^\[ML0-9 \.-\]\+\$'/.test(migration), "the table checks the signature's shape");
ok(steps.includes("/^[ML0-9 .-]{20,30000}$/"), "contractSteps checks the same shape and length");
const pad = read("src/components/invest/SignaturePad.tsx");
const dart = read("mobile/lib/contracts.dart");
ok(/const W = 600;/.test(pad) && /const H = 200;/.test(pad), "the website's pad draws in 600×200");
ok(/static const width = 600;/.test(dart) && /static const height = 200;/.test(dart), "the app's pad draws in the same 600×200");
ok(/points >= 8/.test(pad) && /static const readyFrom = 8;/.test(dart), "both call a signature ready from eight line points");

// Forward contracts: one map from a step to its function.
ok(/sign: \(\) => supabase\.rpc\("forward_contract_answer", \{ p_id: id, p_sign: true \}\)/.test(steps), "contractSteps: «أوقّع العقد» is forward_contract_answer(p_sign => true)");
ok(/forwardContractStep\(/.test(web.forward) && !/forward_contract_answer/.test(web.forward), "the website's forwardStep takes the shared step, and keeps no copy of the map");
ok(/forwardStep\(\s*auth\.supabase/.test(app.forward), "the app's forward route takes the shared step, as the caller");

// Service contracts: one update, judged by the trigger.
ok(/\.from\("service_contracts"\)\.update\(\{ status \}\)[\s\S]*?\.select\("id"\)/.test(steps), "contractSteps: the status update checks a row changed");
ok(/moveServiceContract\(/.test(web.contract) && !/from\("service_contracts"\)\s*\.update/.test(web.contract), "the website's setContractStatus moves through moveServiceContract");
ok(/moveServiceContract\(auth\.supabase/.test(app.service), "the app's service route moves through moveServiceContract, as the caller");

// Investment: the risk notice, the land's consent, the inspection.
ok(/if \(input\.riskAck !== "yes"\)/.test(investSteps) && /p_risk_ack: true/.test(investSteps), "investSteps: no partnership request without the risk notice acknowledged");
ok(/expressInterestStep\(/.test(web.invest) && !/investor_express_interest/.test(web.invest), "the website's request goes through the shared step");
ok(/expressInvestorInterest\(\s*auth\.supabase/.test(app.interest) && /riskAck: text\(body, "risk_ack"/.test(app.interest), "the app's request goes through it too, with the acknowledgement sent");
ok(/setInvestorConsentStep\(/.test(web.invest) && !/land_set_investor_consent/.test(web.invest), "the website's «اعرض أرضي» goes through the shared step");
ok(/setInvestorConsent\(\s*auth\.supabase,\s*auth\.user\.id/.test(app.consent), "the app's «اعرض أرضي» goes through it, as the caller");
ok(/requestLandInspection\(/.test(web.inspection) && /requestLandInspection\(\s*auth\.supabase/.test(app.inspection), "the inspection request is one step for both");

// No route reaches a contract function except through the shared steps.
for (const file of all) {
  const src = read(file);
  for (const fn of ["partnership_agreement_sign", "forward_contract_answer", "investor_express_interest", "land_set_investor_consent", "land_inspection_request"]) {
    if (src.includes(`"${fn}"`)) ok(false, `${file}: calls ${fn} directly instead of the shared step`);
  }
}

// ── the app asks only for routes that exist ──────────────────────────────────
const appFiles = ["mobile/lib/contracts.dart", "mobile/lib/invest.dart"].map(read).join("\n");
const asked = [...appFiles.matchAll(/'(\/api\/app\/(?:contracts|invest)[^']*)'/g)].map((m) => m[1]);
ok(asked.length >= 10, `the app's clients name their routes (${asked.length})`);
for (const p of asked) {
  const dir = p
    .replace(/\$\{[^}]+\}|\$[a-zA-Z]+/g, "[x]")
    .split("/")
    .filter(Boolean)
    .map((seg) => (seg === "[x]" ? null : seg));
  const found = all.some((file) => {
    const segs = file.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "").split("/");
    return segs.length === dir.length && segs.every((s, i) => (dir[i] === null ? /^\[.+\]$/.test(s) : s === dir[i]));
  });
  ok(found, `the app's ${p} has a route`);
}
ok(/accountController\.call/.test(appFiles), "the app's clients use the shared signed-in request");
ok(!/accountController\.(?!call\b|value\b)[a-zA-Z]+\(/.test(appFiles), "and no other account method");

// ── the app's buttons are the website's ──────────────────────────────────────
const contractPage = read("src/app/contracts/[id]/page.tsx");
const moves = contractPage.slice(contractPage.indexOf("function contractMoves"), contractPage.indexOf("const NEXT"));
const moveLabels = [...moves.matchAll(/label: t\("([^"]+)"/g)].map((m) => m[1]);
ok(moveLabels.length >= 10, `the website's contract steps are read (${moveLabels.length})`);
for (const l of moveLabels) ok(dart.includes(`'${l}'`), `the app offers the website's step «${l}»`);
const nextLabels = [...contractPage.matchAll(/status: "\w+", label: "([^"]+)", labelEn/g)].map((m) => m[1]);
for (const l of nextLabels) ok(dart.includes(`'${l}'`), `the app names the phase step «${l}» as the website`);
const forwardPage = read("src/app/market/forward/[id]/page.tsx");
for (const l of ["أوقّع العقد", "أعتذر", "اسحب الاقتراح", "أؤكّد التسليم", "أقبل الإلغاء", "أرفض، والعقد قائم"]) {
  ok(forwardPage.includes(`"${l}"`) && dart.includes(`'${l}'`), `the forward step «${l}» is the website's`);
}
const agreementPage = read("src/app/invest/agreements/[id]/page.tsx");
const detail = read("mobile/lib/screens/contract_detail_screen.dart");
const agreeLine = "قرأتُ العقد كاملاً وأوافق على بنوده، وأعلم أنّ سوداقري تحفظه وتشهد عليه ولا تمسك مالاً ولا تضمن ربحاً.";
ok(agreementPage.includes(agreeLine) && detail.includes(agreeLine), "the app's confirmation is the website's sentence, word for word");
ok(/!signed && a\.me !== "admin"/.test(agreementPage) && /!signed && me != 'admin' && mine == null/.test(dart), "the signing form shows to the same readers");

// ── the colours: beige and green, no red, no orange ───────────────────────────
for (const f of [
  "mobile/lib/screens/contracts_screen.dart",
  "mobile/lib/screens/contract_detail_screen.dart",
  "mobile/lib/screens/invest_screen.dart",
  "mobile/lib/screens/invest_detail_screen.dart",
  "mobile/lib/screens/deal_ui.dart",
]) {
  const src = read(f);
  ok(!/Colors\.(red|orange|deepOrange|redAccent|orangeAccent|pink)|Color\(0x[0-9A-Fa-f]{8}\)/.test(src), `${f}: theme colours only — no red, no orange`);
}

if (fail) {
  console.log(`${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
