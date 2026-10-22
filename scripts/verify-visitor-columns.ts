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

import { readFileSync } from "node:fs";
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

console.log("");
if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — the pages ask for exactly what a visitor is granted");
