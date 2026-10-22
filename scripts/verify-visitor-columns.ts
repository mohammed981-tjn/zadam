/**
 * The columns the pages ask for, held to the columns the database grants
 * (backlog 132).
 *
 *   npx tsx scripts/verify-visitor-columns.ts
 *
 * A signed-out visitor holds SELECT on named columns of eighteen tables
 * (supabase/migrations/20261022050000_visitor_columns.sql). A page that asks
 * for a column the grant leaves out fails for every visitor; a column the
 * grant adds that the list here leaves out is one no page can read. Either
 * way the two lists must be the same list, and this says so before a visitor
 * does.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MEMBER_COLUMNS, VISITOR_COLUMNS } from "../src/lib/visitorColumns";

const sql = readFileSync(join(__dirname, "../supabase/migrations/20261022050000_visitor_columns.sql"), "utf8");

let failed = 0;
const check = (ok: boolean, label: string, why = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${why}`}`);
  if (!ok) failed++;
};

const split = (s: string) => s.split(",").map((c) => c.trim()).filter(Boolean).sort();

function grants(role: "anon" | "authenticated"): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = new RegExp(`grant select \\(([^)]*)\\)\\s+on table public\\.([a-z_]+) to ${role};`, "g");
  for (const m of sql.matchAll(re)) out.set(m[2], split(m[1]));
  return out;
}

function compare(role: "anon" | "authenticated", lists: Record<string, string>) {
  const granted = grants(role);
  for (const [table, cols] of Object.entries(lists)) {
    const want = granted.get(table);
    if (!want) {
      check(false, `${table}: ${role} list`, "no grant in the migration");
      continue;
    }
    const have = split(cols);
    const missing = want.filter((c) => !have.includes(c));
    const extra = have.filter((c) => !want.includes(c));
    check(missing.length === 0 && extra.length === 0, `${table}: ${role} reads ${have.length} columns`,
      [missing.length ? `granted but not listed: ${missing.join(", ")}` : "",
       extra.length ? `listed but not granted: ${extra.join(", ")}` : ""].filter(Boolean).join("; "));
  }
  for (const table of granted.keys()) {
    if (!(table in lists)) check(false, `${table}: ${role} grant`, "granted in the migration but missing from src/lib/visitorColumns.ts");
  }
}

console.log("What a visitor reads");
compare("anon", VISITOR_COLUMNS);

console.log("\nWhat a member reads where the review note or the contact is withheld");
compare("authenticated", MEMBER_COLUMNS);

console.log("\nWhat stays hidden");
const hidden: [keyof typeof VISITOR_COLUMNS, string][] = [
  ["suppliers", "review_note"], ["suppliers", "owner_id"], ["suppliers", "licence_doc_path"],
  ["partner_companies", "review_note"], ["partner_companies", "owner_id"],
  ["projects", "review_note"], ["projects", "land_id"], ["projects", "created_by"],
  ["feedback", "contact"], ["feedback", "author_id"],
  ["charter_signatures", "user_id"], ["nafir_joins", "user_id"], ["nafir_calls", "organizer_id"],
  ["faza_requests", "requester_id"], ["faza_pledges", "pledger_id"], ["judiyya_mediators", "user_id"],
  ["shura_items", "author_id"], ["market_offers", "created_by"], ["export_offers", "owner_id"],
  ["export_offer_custody", "latitude"], ["export_offer_origins", "boundary"], ["export_offer_evidence", "storage_path"],
];
for (const [table, col] of hidden) {
  check(!split(VISITOR_COLUMNS[table]).includes(col), `a visitor does not read ${table}.${col}`, "it is in the list");
}
for (const table of ["suppliers", "partner_companies"] as const) {
  check(!split(MEMBER_COLUMNS[table]).includes("review_note"), `a member does not read ${table}.review_note`, "it is in the list");
}
check(!split(MEMBER_COLUMNS.feedback).includes("contact"), "a member does not read feedback.contact", "it is in the list");

/*
 * The phone app reads as a visitor too, and it was missed: its النفير screen
 * asked nafir_calls and faza_requests for `*`, which the grant refuses, so the
 * screen failed for every reader from the day the migration was applied. Every
 * `_get('table', {...})` in mobile/lib is held to the same lists here: the
 * selected columns, the ordering column and every filtered column, since a
 * visitor needs SELECT on a column to filter or sort by it as well.
 */
console.log("\nWhat the phone app asks for");
const dartDir = join(__dirname, "../mobile/lib");
const dartFiles = readdirSync(dartDir, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".dart"));
let appReads = 0;
for (const file of dartFiles) {
  const src = readFileSync(join(dartDir, file), "utf8");
  // `static const _name = 'a,b' 'c,d';` — adjacent literals are one string.
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/const\s+(_?[A-Za-z]\w*)\s*=\s*((?:'[^']*'\s*)+);/g)) {
    consts.set(m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]).join(""));
  }
  for (const m of src.matchAll(/_get\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g)) {
    const [, table, body] = m;
    if (!(table in VISITOR_COLUMNS)) continue;
    appReads++;
    const entries = new Map<string, string>();
    for (const e of body.matchAll(/'([a-z_]+)'\s*:\s*(?:'([^']*)'|(_?[A-Za-z]\w*))/g)) {
      entries.set(e[1], e[2] ?? consts.get(e[3]) ?? `<unknown ${e[3]}>`);
    }
    const select = entries.get("select") ?? "*";
    const used = select === "*" ? ["*"] : split(select);
    const order = entries.get("order");
    if (order) used.push(order.split(".")[0]);
    for (const key of entries.keys()) {
      if (!["select", "order", "limit", "offset", "or"].includes(key)) used.push(key);
    }
    const allowed = split(VISITOR_COLUMNS[table as keyof typeof VISITOR_COLUMNS]);
    const refused = used.filter((c) => !allowed.includes(c));
    check(refused.length === 0, `mobile/lib/${file}: ${table} (${[...new Set(used)].join(", ")})`,
      `a visitor is not granted: ${refused.join(", ")}`);
  }
}
check(appReads > 0, "the app's reads were found", "no _get(...) on a granted table — has the pattern changed?");

console.log("");
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — the pages ask for exactly what a visitor is granted");
