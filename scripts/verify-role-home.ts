/**
 * الرئيسيّة بحسب الدور (البند ٢٠٦) — the rules, held without a database.
 *
 *   npx tsx scripts/verify-role-home.ts
 *
 * - What each role sees and in what order (src/lib/roleHome.ts), from rows a test writes: the farmer's seasons with
 *   their next stage and its budget, the stages waiting for evidence, the lands and their verification, the requests
 *   on them, credit, alerts; the investor's opportunities, requests, agreements to sign, reports and statement; the
 *   shop, the carrier, the agent company, the administrators' list; the current side in full and the other compactly.
 * - The reads are the person's own: `GET /api/app/home` starts with `clientFromBearer` and answers 401 «انتهت جلستك»,
 *   the website reads with the session client, and nothing on either path — or anything it imports — reaches the
 *   server's key. The loader writes nothing and calls only reading functions.
 * - A visitor's home is unchanged: the hero, its two doors and everything under it are still there, and only the
 *   hero is swapped, and only for a signed-in reader.
 * - The app calls the route, opens each card on a screen of its own, orders its groups by side, and its home uses
 *   no red and no orange.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agreementsToSign,
  arrangeHome,
  buildItems,
  emptyRaw,
  holdings,
  localizeHome,
  roleHome,
  stagesWaitingForEvidence,
  type HomeRaw,
  type HomeView,
  type RawSeason,
} from "../src/lib/roleHome";
import type { LinkRow } from "../src/lib/ledgerLinks";

const root = join(__dirname, "..");
let failed = 0;
const ok = (c: boolean, m: string, why = "") => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}${c ? "" : ` — ${why}`}`);
  if (!c) failed++;
};
const read = (p: string) => readFileSync(join(root, p), "utf8");

const ME = "u-me";
const OTHER = "u-other";
const TODAY = "2026-11-06";
const raw = (patch: Partial<HomeRaw> = {}, role: string | null = "farmer"): HomeRaw => ({ ...emptyRaw(ME, role, TODAY), ...patch });
const keys = (v: HomeView, where: "full" | "compact" = "full") => v[where].flatMap((s) => s.items.map((i) => i.key));
const item = (v: HomeView, key: string) => [...v.full, ...v.compact].flatMap((s) => s.items).find((i) => i.key === key);

const season = (id: string, stages: Partial<RawSeason["stages"][number]>[]): RawSeason => ({
  id,
  name: `موسم ${id}`,
  crop_key: "sorghum",
  stages: stages.map((s, i) => ({
    id: `${id}-st${i}`,
    stage_key: "planting",
    stage_order: i + 1,
    planned_start: "2026-10-01",
    budget: 100,
    completed: false,
    ...s,
  })),
});
const link = (p: Partial<LinkRow>): LinkRow => ({
  id: Math.random().toString(36).slice(2),
  kind: "input_finance",
  status: "pending",
  mine: false,
  other_name: "",
  agreement_id: "ag1",
  agreement_ref: null,
  season_id: null,
  amount_minor: 10000,
  principal_minor: 10000,
  currency: "USD",
  fx_rate: null,
  entry_date: "2026-10-01",
  memo: "",
  reject_reason: null,
  created_at: "2026-10-01T00:00:00Z",
  resolved_at: null,
  reversal: null,
  ...p,
});

console.log("A visitor's start, and the side");
{
  const v = roleHome(raw());
  ok(v.side === "farmer" && v.full[0]?.group === "farmer", "a new account is on the farmer's side, shown in full");
  ok(keys(v).includes("farmer:start"), "with nothing yet, the farmer's group says where to start (register land)");
  ok(item(v, "farmer:start")?.href === "/lands/new", "and the card opens /lands/new");
  ok(v.waiting === 0 && v.compact.length === 0, "nothing waits, and no other side is shown");
  const inv = roleHome(raw({}, "investor"));
  ok(inv.side === "investor" && inv.full[0]?.group === "investor", "on the investor's side, the investor's group is in full");
  ok(keys(inv).includes("opportunities"), "and it always shows the opportunities, even with nothing to do");
}

console.log("\nThe farmer: seasons, stages, evidence, budget");
{
  const s1 = season("s1", [{ completed: true }, { stage_key: "establishment", budget: 200 }, {}]);
  const r = raw({
    seasons: [s1],
    spentByStage: { "s1-st1": 100 },
    evidenceByStage: {},
  });
  const v = roleHome(r);
  const card = item(v, "season:s1");
  ok(card?.kind === "status" && card.href === "/seasons/s1", "each running season has a card that opens it");
  ok(/(50|٥٠)٪/.test(card?.detail?.ar ?? "") && /50%/.test(card?.detail?.en ?? ""), "with the next open stage's budget use (100 of 200 = 50%)", card?.detail?.en);
  ok(/المرحلة التالية: /.test(card?.detail?.ar ?? ""), "and the next stage named");
  const ev = item(v, "evidence");
  ok(ev?.kind === "waiting" && ev.count === 1 && ev.href === "/seasons/s1", "the open stage past its start with no evidence waits for evidence");
  ok(stagesWaitingForEvidence({ ...r, evidenceByStage: { "s1-st1": 2 } }).length === 0, "a stage with evidence does not wait");
  const future = season("s2", [{ planned_start: "2026-12-01" }]);
  ok(stagesWaitingForEvidence({ ...r, seasons: [future] }).length === 0, "a stage not yet due does not wait");
  const done = season("s3", [{ completed: true }]);
  ok(/الحصاد/.test(item(roleHome(raw({ seasons: [done] })), "season:s3")?.detail?.ar ?? ""), "a season with every stage signed off says to record the harvest");
  ok(v.full[0].items[0].kind === "waiting", "what waits comes before where things stand");
  const many = roleHome(raw({ seasons: ["a", "b", "c", "d", "e"].map((id) => season(id, [{ planned_start: "2027-01-01" }])) }));
  ok(keys(many).filter((k) => k.startsWith("season:")).length === 3 && item(many, "seasons:more")?.count === 2, "three season cards at most, the rest counted in one");
  const nobudget = roleHome(raw({ seasons: [season("s4", [{ budget: 0, planned_start: "2027-01-01" }])] }));
  ok(/بلا ميزانيّة/.test(item(nobudget, "season:s4")?.detail?.ar ?? ""), "a stage with no planned budget says so instead of dividing by zero");
}

console.log("\nThe farmer: land, requests, credit, alerts, deliveries");
{
  const v = roleHome(
    raw({
      lands: [
        { id: "l1", name: "أ", verification: "verified" },
        { id: "l2", name: "ب", verification: "submitted" },
        { id: "l3", name: "ج", verification: "rejected" },
      ],
      landRequests: 2,
      companyRequests: 1,
      inspections: [{ id: "i1", role: "owner", status: "requested", reported_at: null }],
      agentRequests: 1,
      openCreditBySeason: { s9: 0, s1: 3 },
      firedAlerts: 2,
      fieldAlerts: [{ title: "رصدٌ للجراد على بعد ٤٠ كم من «أ»", link: "https://evil.example/x" }],
      fieldAlertCount: 1,
      deliveriesToMe: 1,
    }),
  );
  const lands = item(v, "lands");
  ok(lands?.count === 3 && /1 موثّقة|١ موثّقة/.test(lands.detail?.ar ?? "") && /to correct/.test(lands.detail?.en ?? ""), "the lands with their verification", lands?.detail?.en);
  ok(item(v, "land-requests")?.count === 4, "investors', companies' and inspection requests on the land are one card (2 + 1 + 1)");
  ok(item(v, "agent-requests")?.href === "/account/agents", "an organisation asking to act for the farmer opens «وكلائي»");
  ok(item(v, "credit")?.count === 3 && item(v, "credit")?.href === "/seasons/s1", "unsettled credit, opening the season that holds it");
  ok(item(v, "price-alerts")?.href === "/market/alerts", "price alerts that fired open /market/alerts");
  const field = item(v, "field-alerts");
  ok(field?.count === 1 && field.href === "/notifications", "a field alert whose link is not the site's own opens /notifications instead");
  ok(field?.detail?.ar.includes("جراد") === true, "and says the notification's own words");
  ok(item(v, "deliveries-to-me")?.href === "/suppliers/deliveries", "a delivery waiting for the farmer's code");
  ok(!keys(v).includes("farmer:start"), "someone with land is not told to start");
  ok(v.waiting === 4 + 1 + 3 + 2 + 1 + 1, "the headline counts everything that waits", String(v.waiting));
}

console.log("\nAgreements and the books");
{
  const ag = (id: string, p: Partial<HomeRaw["agreements"][number]>) => ({
    id,
    model: "sharecrop",
    status: "draft" as const,
    version: 2,
    owner_id: ME,
    investor_id: OTHER,
    manager_company_id: null,
    ...p,
  });
  const agreements = [
    ag("a-own", {}),
    ag("a-inv", { owner_id: OTHER, investor_id: ME }),
    ag("a-signed", {}),
    ag("a-old", {}),
    ag("a-sealed", { status: "signed" }),
    ag("a-mgr", { owner_id: OTHER, model: "managed", manager_company_id: "c1" }),
    ag("a-mgr-wrong", { owner_id: OTHER, model: "sharecrop", manager_company_id: "c1" }),
    ag("a-none", { owner_id: OTHER }),
  ];
  const signatures = [
    { agreement_id: "a-signed", version: 2, role: "owner" },
    { agreement_id: "a-old", version: 1, role: "owner" },
  ];
  const toSign = agreementsToSign({ userId: ME, agreements, signatures, companyIds: ["c1"] });
  const ids = toSign.map((x) => `${x.agreement.id}:${x.me}`).sort();
  ok(
    JSON.stringify(ids) === JSON.stringify(["a-inv:investor", "a-mgr:manager", "a-old:owner", "a-own:owner"]),
    "waiting for a signature: the current version, in the role the person holds, a manager only on a three-party agreement",
    ids.join(", "),
  );
  const v = roleHome(
    raw({
      agreements,
      signatures,
      companyIds: ["c1"],
      company: { id: "c1", name: "شركة", ready: true },
      links: [
        link({ agreement_id: "a-own" }),
        link({ agreement_id: "a-inv" }),
        link({ agreement_id: "a-inv", mine: true }),
        link({ agreement_id: "a-inv", status: "confirmed", reversal: { status: "pending", mine: false } as unknown as LinkRow["reversal"] }),
      ],
    }),
  );
  ok(item(v, "sign:owner")?.count === 2 && item(v, "sign:owner")?.href === "/invest/agreements/a-own", "the owner's agreements in the farmer's group");
  ok(keys(v, "compact").includes("sign:investor"), "the investor's agreement waits compactly while on the farmer's side");
  ok(item(v, "sign:manager")?.count === 1 && v.full.some((s) => s.group === "agent"), "the managing company's in its own group, shown in full");
  ok(item(v, "links:farmer")?.count === 1, "a proposal on the owner's agreement waits in the farmer's book");
  ok(item(v, "links:investor")?.count === 2, "and on the investor's — a proposal and a cancellation to answer — in the investor's (own proposals do not wait)");
  ok(item(v, "links:farmer")?.href === "/books?report=links", "proposals open the books' linked entries");
}

console.log("\nThe investor");
{
  const v = roleHome(
    raw(
      {
        interests: [
          { status: "pending", model: "lease", state: "الجزيرة" },
          { status: "accepted", model: "sharecrop", state: "سنار" },
          { status: "declined", model: "finance", state: "كسلا" },
        ],
        openLands: [
          { mine: false, interest_status: null, models: ["lease"], state: "القضارف" },
          { mine: false, interest_status: null, models: ["finance"], state: "سنار" },
          { mine: false, interest_status: null, models: ["musaqah"], state: "النيل الأبيض" },
          { mine: false, interest_status: "pending", models: ["lease"], state: "الجزيرة" },
          { mine: true, interest_status: null, models: ["lease"], state: "الجزيرة" },
        ],
        inspections: [
          { id: "i-old", role: "investor", status: "reported", reported_at: "2026-09-01" },
          { id: "i-new", role: "investor", status: "reported", reported_at: "2026-10-20" },
          { id: "i-wait", role: "investor", status: "assigned", reported_at: null },
        ],
        agreements: [{ id: "ag1", model: "finance", status: "signed", version: 1, owner_id: OTHER, investor_id: ME, manager_company_id: null }],
        links: [
          link({ status: "confirmed", kind: "input_finance", amount_minor: 50000 }),
          link({ status: "confirmed", kind: "harvest_share", amount_minor: 80000 }),
          link({ status: "confirmed", kind: "payout", amount_minor: 30000 }),
        ],
        investments: [
          { status: "confirmed", amount: 500, shares: 5, project_id: "p1" },
          { status: "pending", amount: 100, shares: 1, project_id: "p2" },
        ],
      },
      "investor",
    ),
  );
  const opp = item(v, "opportunities");
  ok(opp?.count === 3, "opportunities: offered land not the investor's own and not yet asked about", String(opp?.count));
  ok(/منها 2|منها ٢/.test(opp?.detail?.ar ?? ""), "two of them like what was asked before (a model or a state)", opp?.detail?.ar);
  const req = item(v, "my-requests");
  ok(req?.count === 2 && /waiting for the owner/.test(req.detail?.en ?? "") && /accepted/.test(req.detail?.en ?? ""), "the requests and their status");
  ok(item(v, "inspection-reports")?.href === "/invest/inspections/i-new", "inspection reports, the newest first");
  const st = item(v, "statement");
  ok(/\$500/.test(st?.detail?.en ?? "") && /\$300/.test(st?.detail?.en ?? "") && /due \$500/.test(st?.detail?.en ?? ""), "the statement: financed, handed over, still due", st?.detail?.en);
  ok(st?.href === "/invest/agreements/ag1", "with one agreement, the statement opens it");
  ok(/\$500 confirmed in 1/.test(item(v, "portfolio")?.detail?.en ?? "") && /1 awaiting/.test(item(v, "portfolio")?.detail?.en ?? ""), "the project portfolio counts only what was confirmed", item(v, "portfolio")?.detail?.en);
  ok(v.full.length === 1 && v.full[0].group === "investor", "on the investor's side, the farmer's group is not in full");
}

console.log("\nShop, carrier, agent company, administrator");
{
  const v = roleHome(
    raw({
      supplier: { id: "sp1", name: "متجر النيل", verified: false },
      supplierOrders: [
        { id: "o1", status: "open" },
        { id: "o2", status: "closed" },
        { id: "o3", status: "delivered" },
      ],
      carrier: { id: "c1", name: "نقل", verified: true },
      carrierDeliveries: 2,
      company: { id: "co1", name: "تعاونيّة", ready: true },
      agentFarmers: [{ status: "active" }, { status: "active" }, { status: "pending" }, { status: "revoked" }],
      agentObjections: 1,
    }),
  );
  ok(v.full.map((s) => s.group).join() === "farmer,supplier,carrier,agent", "a shop, a carrier and a company are shown in full after the side", v.full.map((s) => s.group).join());
  ok(item(v, "supplier:verify")?.href === "/suppliers/mine", "an unverified shop says it waits for verification");
  ok(item(v, "supplier:orders")?.count === 2, "the shop's open and closed group orders (not the delivered)");
  ok(item(v, "carrier:deliveries")?.count === 2 && !item(v, "carrier:verify"), "the carrier's deliveries; a verified carrier has no verification card");
  ok(item(v, "agent:farmers")?.count === 2 && item(v, "agent:mandates")?.count === 1 && item(v, "agent:objections")?.count === 1, "the company's farmers, mandates waiting and objections");
  const notReady = roleHome(raw({ company: { id: "co1", name: "تعاونيّة", ready: false }, agentFarmers: [{ status: "pending" }] }));
  ok(item(notReady, "agent:verify")?.href === "/partners/mine" && !item(notReady, "agent:mandates"), "a company not yet verified is told so, and has no farmers yet");

  const admin = roleHome(raw({ admin: { total: 7, secondFactor: false }, lands: [{ id: "l", name: "x", verification: "verified" }] }, "admin"));
  ok(admin.full[0].group === "admin" && item(admin, "admin:queue")?.count === 7 && item(admin, "admin:queue")?.href === "/admin/inbox", "an administrator sees the review list first, with its count");
  ok(admin.full[1]?.group === "farmer", "and the side he holds after it");
  const mfa = roleHome(raw({ admin: { total: null, secondFactor: true } }, "admin"));
  const m = item(mfa, "admin:second-factor");
  ok(m?.count === null && /الرمز الثاني/.test(m.title.ar) && mfa.waiting === 1, "without the second factor, the card says where to enter it, counted once");
  const calm = roleHome(raw({ admin: { total: 0, secondFactor: false } }, "admin"));
  ok(item(calm, "admin:queue")?.kind === "status" && calm.waiting === 0, "an empty list is a status, not something waiting");
  ok(!holdings(raw({}, "farmer")).has("admin"), "only the administrator's role holds the administration");
}

console.log("\nCompact and complete");
{
  const items = buildItems(raw({ interests: [{ status: "pending", model: "lease", state: "x" }] }));
  const v = arrangeHome("farmer", items, holdings(raw({ interests: [{ status: "pending", model: "lease", state: "x" }] })));
  ok(!v.compact.some((s) => s.items.some((i) => i.kind === "status")), "the other side shows only what waits, never where things stand");
  const loc = localizeHome(roleHome(raw({ seasons: [season("s1", [{}])] })), "en");
  const strings = [...loc.full, ...loc.compact].flatMap((s) => [s.title, ...s.items.flatMap((i) => [i.title, i.detail ?? ""])]);
  ok(strings.every((x) => typeof x === "string" && !/undefined|NaN/.test(x)), "every card has its words in English, none undefined or NaN");
  const ar = localizeHome(roleHome(raw({ seasons: [season("s1", [{}])] })), "ar");
  ok([...ar.full].every((s) => /[؀-ۿ]/.test(s.title)), "and in Arabic for the app");
  const all = buildItems(
    raw({
      seasons: [season("s1", [{}])],
      lands: [{ id: "l", name: "x", verification: "verified" }],
      supplier: { id: "s", name: "s", verified: false },
      admin: { total: 1, secondFactor: false },
    }),
  );
  ok(all.every((i) => i.href.startsWith("/") && !i.href.startsWith("//")), "every card opens a page of the site itself");
  ok(new Set(all.map((i) => i.key)).size === all.length, "no two cards share a key");
}

console.log("\nThe person's own reads, and no server key");
const ROUTE = "src/app/api/app/home/route.ts";
const route = read(ROUTE);
const handlers = [...route.matchAll(/export async function (GET|POST)\(([^)]*)\)[^{]*\{\n([^\n]*)\n([^\n]*)/g)];
ok(handlers.length === 1 && handlers[0][1] === "GET", `${ROUTE}: one GET`);
for (const h of handlers) {
  ok(h[3].trim() === "const auth = await clientFromBearer(req);", `${ROUTE}: starts with clientFromBearer(req)`, h[3].trim());
  ok(
    h[4].trim() === `if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });`,
    `${ROUTE}: 401 «انتهت جلستك» when no one is signed in`,
    h[4].trim(),
  );
}
ok(/loadRoleHome\(supabase, user\.id\)/.test(route), `${ROUTE}: reads with the bearer client, for the caller`);
const PATHS = [ROUTE, "src/lib/roleHome.ts", "src/lib/roleHomeLoad.ts", "src/components/RoleHome.tsx", "src/components/RoleHomeOffline.tsx", "src/app/page.tsx"];
const KEY = /SERVICE_ROLE|createAdminClient|from "@\/lib\/supabase\/admin"|\bservice_role\b/;
for (const p of PATHS) ok(!KEY.test(read(p)), `${p}: no service-role key, no admin client`);
for (const p of PATHS) {
  const imports = [...read(p).matchAll(/from "(?:@\/lib\/|\.\/)([^"]+)"/g)].map((m) => `src/lib/${m[1]}.ts`);
  const holding = imports.filter((i) => existsSync(join(root, i)) && KEY.test(read(i)));
  ok(holding.length === 0, `${p}: imports nothing that holds the server key`, holding.join(", "));
}
const load = read("src/lib/roleHomeLoad.ts");
ok(!/createClient|createPublicClient/.test(load), "the loader builds no client of its own: it reads with the caller's");
ok(!/\.(insert|update|upsert|delete|upload)\(/.test(load), "the loader writes nothing");
const READS = new Set([
  "investor_my_interests",
  "land_inspection_list",
  "partner_company_private",
  "supplier_private",
  "agent_my_agents",
  "investor_open_lands",
  "farm_credit_status",
  "land_investor_requests",
  "group_order_directory",
  "agent_my_farmers",
  "is_admin",
]);
const rpcs = [...load.matchAll(/\.rpc\("([^"]+)"/g)].map((m) => m[1]);
ok(rpcs.length > 0 && rpcs.every((r) => READS.has(r)), "and calls only functions that read", rpcs.filter((r) => !READS.has(r)).join(", "));
const home = read("src/components/RoleHome.tsx");
ok(/from "@\/lib\/supabase\/server"/.test(home) && /loadRoleHome\(supabase, userId\)/.test(home), "the website reads with the session's client, for the person signed in");
ok(!/\b(danger|accent|red-|orange-)/.test(home + read("src/components/RoleHomeOffline.tsx")), "the website's role home uses no red and no orange");
ok(/tr\(locale/.test(home) && /tr\(locale/.test(read("src/components/RoleHomeOffline.tsx")), "and says itself in English through tr()");

console.log("\nA visitor's home is unchanged");
const page = read("src/app/page.tsx");
const branch = page.indexOf("{user ? (");
const heroAt = page.indexOf('<section className="hero-video">');
const heroEnd = page.indexOf("</section>", heroAt);
const after = page.slice(heroEnd);
ok(branch > 0 && heroAt > branch, "the only branch on the reader is around the hero");
ok(/\{user \? \(\s*<Suspense fallback=\{<RoleHomeSkeleton locale=\{locale\} \/>\}>\s*<RoleHome userId=\{user\.id\} locale=\{locale\} \/>\s*<\/Suspense>\s*\) : \(\s*<section className="hero-video">/.test(page), "signed in: the role home in its own Suspense boundary; signed out: the hero");
ok((page.match(/\buser\b/g) ?? []).length === 3, "the reader is named nowhere else on the page", String((page.match(/\buser\b/g) ?? []).length));
const hero = page.slice(heroAt, heroEnd);
for (const [what, needle] of [
  ["the headline", 'كل رقمٍ هنا يمكنك أن تعيد حسابه بنفسك'],
  ["the farmer's door", 'href="/lands/new"'],
  ["the study's door", 'href="/arc-canal"'],
  ["the film behind it", "<HeroBackdrop />"],
  ["the poster", "<picture>"],
  ["the Nile line", "nile-line"],
] as const) {
  ok(hero.includes(needle), `the hero keeps ${what}`);
}
for (const [what, needle] of [
  ["the films", "<HeroVideo />"],
  ["the numbers", "stats.map"],
  ["the quick tabs", "<QuickTabs"],
  ["the season strip and the market ticker", "<MarketTicker"],
  ["the rain card", "<RainHomeCard />"],
  ["the sections board", "<PhotoBoard"],
  ["the projects", "<ProjectCard"],
] as const) {
  ok(after.includes(needle), `under it, for everyone: ${what}`);
}
ok(!/\buser\b/.test(after), "nothing under the hero depends on who is reading");

console.log("\nThe app");
const dart = read("mobile/lib/home.dart");
const screen = read("mobile/lib/screens/home_screen.dart");
ok(dart.includes("'/api/app/home'") && existsSync(join(root, ROUTE)), "the app calls /api/app/home, which exists");
ok(/_account\.call\('GET', '\/api\/app\/home'\)/.test(dart), "through the signed-in session (AccountController.call)");
ok(/side == 'investor' \? const \[1, 0, 2\] : const \[0, 1, 2\]/.test(dart), "an investor's groups start with the market and investment");
ok(/sectionOrder\(_side\)/.test(screen) && /WaitingBoard\(/.test(screen), "the home orders its groups by side and shows «ينتظرك» under the hero");
ok(/HeroVideo\(/.test(screen) && /BrandAppBar\(\)/.test(screen) && /drawer: _Menu\(/.test(screen), "the hero film, the logo header and the drawer stay");
ok(!/Colors\.(red|orange|deepOrange|redAccent|orangeAccent)|0xFF[Ee]5|0xFFF4|0xFFFF[0-9A-Fa-f]{2}00/.test(screen + dart), "no red and no orange in the app's home");
ok(/LedgerOutbox\(\)\.pending\(/.test(screen), "the entries kept on the phone are counted in");
ok(existsSync(join(root, "mobile/test/home_test.dart")), "and the app has tests for it");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
