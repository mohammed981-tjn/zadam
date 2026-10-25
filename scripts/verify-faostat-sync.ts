/**
 * The FAOSTAT sync (backlog 197): read the committed slices, compare them with the database, stage the difference —
 * and write nothing a visitor reads.
 *
 *   npx tsx scripts/verify-faostat-sync.ts
 *
 * The parser and the comparison are checked on small cases and on the real files in data/; the whole run is checked
 * against a database that records what it is asked to do and refuses every write to faostat_observations; and the
 * places that must agree with each other (the workflow's slices, the trim's unit order, the file tracing, the
 * migration's domains) are compared with one another.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BIG_CHANGE_SHARE,
  SLICES,
  UNIT_RANK,
  diffSlice,
  isFailure,
  keyOf,
  parseSlice,
  refusal,
  syncFaostat,
  type DbRow,
  type Domain,
} from "../src/lib/faostatSync";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const eq = (got: unknown, want: unknown, label: string) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? "PASS" : "FAIL"}  ${label}${good ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!good) failed++;
};
const root = join(__dirname, "..");
const line = (...f: (string | number)[]) => f.join("\t");

async function main() {
  console.log("Reading a slice as the trim writes it");
  const good = line("PP", "Sudan", "Producer Price (USD/tonne)", "Sesame seed", 2023, "USD", "1200.500000", "A");
  eq(parseSlice(good + "\n", "PP"), {
    rows: [{ domain: "PP", area: "Sudan", element: "Producer Price (USD/tonne)", item: "Sesame seed", year: 2023, unit: "USD", value: 1200.5, flag: "A" }],
    bad: 0,
  }, "a row is read whole");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 2023, "USD", "1", "") + "\n", "PP").rows[0].flag, null, "an empty flag is none");
  eq(parseSlice("\n\n" + good + "\r\n\n", "PP").rows.length, 1, "blank lines and CRLF are no rows");
  eq(parseSlice(line("TCL", "Sudan", "E", "I", 2023, "t", "1", "A"), "PP").bad, 1, "a row of another domain is bad");
  eq(parseSlice(line("PP", "Sudan", "E", "I", "20x3", "USD", "1", "A"), "PP").bad, 1, "a year that is not a number is bad");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 1850, "USD", "1", "A"), "PP").bad, 1, "a year out of range is bad");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 2023, "USD", "abc", "A"), "PP").bad, 1, "a value that is not a number is bad");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 2023, "USD", "", "A"), "PP").bad, 1, "an empty value is bad, not zero");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 2023, "USD", "1"), "PP").bad, 1, "a row with seven fields is bad");
  eq(parseSlice(line("PP", "", "E", "I", 2023, "USD", "1", "A"), "PP").bad, 1, "a row with no area is bad");
  eq(parseSlice(line("PP", "Sudan", "E", "I", 2023, "USD", "0", "A"), "PP").rows[0].value, 0, "a real zero is kept (no data and none are different claims)");
  eq(parseSlice([line("PP", "Sudan", "E", "I", 2023, "USD", "1", "A"), line("PP", "Sudan", "E", "I", 2023, "USD", "2", "E")].join("\n"), "PP").rows.map((r) => r.value),
    [2], "the same key twice: the last row wins");

  console.log("\nTwo units under one key (eggs: tonnes and thousands of eggs)");
  const eggT = line("QCL", "Algeria", "Production", "Hen eggs in shell, fresh", 2023, "t", "308541.72", "I");
  const eggN = line("QCL", "Algeria", "Production", "Hen eggs in shell, fresh", 2023, "1000 No", "6170834", "I");
  eq(parseSlice([eggT, eggN].join("\n"), "QCL").rows.map((r) => r.unit), ["t"], "tonnes then count: tonnes");
  eq(parseSlice([eggN, eggT].join("\n"), "QCL").rows.map((r) => r.unit), ["t"], "count then tonnes: tonnes — the order of the file decides nothing");
  ok(UNIT_RANK.indexOf("t") === 0 && UNIT_RANK.indexOf("1000 No") === UNIT_RANK.length - 1, "the mass unit ranks first and the count of items last");

  console.log("\nComparing with the database");
  const db = new Map<string, DbRow>([
    [keyOf({ area: "Sudan", element: "Producer Price (USD/tonne)", item: "Sesame seed", year: 2023 }), { unit: "USD", value: 1200.5, flag: "A" }],
    [keyOf({ area: "Sudan", element: "Producer Price (USD/tonne)", item: "Sesame seed", year: 2022 }), { unit: "USD", value: 1000, flag: "A" }],
    [keyOf({ area: "Sudan", element: "Producer Price (USD/tonne)", item: "Millet", year: 2023 }), { unit: "USD", value: 500, flag: null }],
    [keyOf({ area: "Sudan", element: "Producer Price (USD/tonne)", item: "Only in the database", year: 2023 }), { unit: "USD", value: 9, flag: "A" }],
  ]);
  const o = (item: string, year: number, value: number, unit = "USD", flag: string | null = "A") =>
    ({ domain: "PP" as Domain, area: "Sudan", element: "Producer Price (USD/tonne)", item, year, unit, value, flag });
  const d = diffSlice(
    [o("Sesame seed", 2023, 1200.5), o("Sesame seed", 2022, 1100), o("Millet", 2023, 500, "USD", null), o("Sesame seed", 2024, 1400), o("Wheat", 2023, 300)],
    db,
  );
  eq(d.same, 2, "two rows are the same (the equal number, and the equal number with no flag)");
  eq(d.pending.map((p) => [p.item, p.year, p.old_value]), [["Sesame seed", 2022, 1000], ["Sesame seed", 2024, null], ["Wheat", 2023, null]],
    "a revised value is changed (with the old one), the rest are new");
  ok(!d.pending.some((p) => p.item === "Only in the database"), "a row only the database holds is not proposed for removal — what was loaded is kept");
  eq(diffSlice([o("Millet", 2023, 500, "USD", "E")], db).pending[0]?.old_value, 500, "a changed flag alone is a change");
  eq(diffSlice([o("Millet", 2023, 500, "t", null)], db).pending[0]?.old_unit, "USD", "a changed unit alone is a change, and the old unit is kept beside it");
  eq(diffSlice([o("Millet", 2023, 500.0000000001, "USD", null)], db).same, 1, "a difference below a billionth is not a change");
  eq(diffSlice([o("Millet", 2023, 500.01, "USD", null)], db).pending.length, 1, "a cent in five hundred is");

  console.log("\nWhen a file is refused");
  eq(refusal(0, 0, 1000), "الملف فارغ أو لا صفّ صالحاً فيه", "an empty file");
  ok(refusal(100, 5, 100) !== null, "5 bad rows in 105 are too many (even for a file as big as what is held)");
  ok(refusal(100_000, 100, 100_000) === null, "100 in 100,100 are tolerated (and ignored)");
  ok(refusal(499, 0, 1000) !== null, "a file under half of what the database holds");
  ok(refusal(500, 0, 1000) === null, "exactly half is not refused");
  ok(refusal(10, 0, 0) === null, "the first ever load has nothing to be smaller than");

  console.log("\nThe real files in data/");
  for (const s of SLICES) {
    const { rows, bad } = parseSlice(readFileSync(join(root, "data", s.file), "utf8"), s.domain);
    ok(bad === 0 && rows.length > 1000, `${s.file}: ${rows.length} rows, ${bad} malformed`);
    ok(rows.every((r) => r.value >= 0), `${s.file}: no negative figure`);
  }

  console.log("\nThe whole run, against a database that refuses every write to the figures");
  const dir = mkdtempSync(join(tmpdir(), "faostat-sync-"));
  const write = (file: string, ...lines: string[]) => writeFileSync(join(dir, file), lines.join("\n") + "\n");
  const pp = (item: string, year: number, v: number) => line("PP", "Sudan", "Producer Price (USD/tonne)", item, year, "USD", v, "A");
  const tcl = (item: string, year: number, v: number) => line("TCL", "Sudan", "Export quantity", item, year, "t", v, "A");
  const qcl = (item: string, year: number, v: number) => line("QCL", "Sudan", "Yield", item, year, "kg/ha", v, "E");
  write("faostat-prices.tsv", pp("Sesame seed", 2023, 1310), pp("Sesame seed", 2024, 1400), pp("Millet", 2023, 500));
  write("faostat-trade.tsv", tcl("Sheep", 2023, 1000), tcl("Sheep", 2024, 1100));
  write("faostat-yield.tsv", qcl("Sorghum", 2023, 640), qcl("Sorghum", 2024, 700));

  const state = {
    observations: [
      { domain: "PP", area: "Sudan", element: "Producer Price (USD/tonne)", item: "Sesame seed", year: 2023, unit: "USD", value: 1200.5, flag: "A" },
      { domain: "PP", area: "Sudan", element: "Producer Price (USD/tonne)", item: "Millet", year: 2023, unit: "USD", value: 500, flag: "A" },
      { domain: "TCL", area: "Sudan", element: "Export quantity", item: "Sheep", year: 2023, unit: "t", value: 1000, flag: "A" },
      { domain: "QCL", area: "Sudan", element: "Yield", item: "Sorghum", year: 2023, unit: "kg/ha", value: 640, flag: "E" },
    ] as Record<string, unknown>[],
    pending: [] as Record<string, unknown>[],
    syncs: [] as Record<string, unknown>[],
    forbidden: [] as string[],
    reads: 0,
  };
  const builder = (table: string) => {
    let filter: ((r: Record<string, unknown>) => boolean) | null = null;
    let slice: [number, number] | null = null;
    let action: "select" | "delete" | "insert" = "select";
    let payload: unknown = null;
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      limit: () => b,
      eq: (col: string, val: unknown) => {
        filter = (r) => r[col] === val;
        return b;
      },
      range: (from: number, to: number) => {
        slice = [from, to];
        return b;
      },
      delete: () => {
        if (table === "faostat_observations") state.forbidden.push(`delete ${table}`);
        action = "delete";
        return b;
      },
      insert: (rows: unknown) => {
        if (table === "faostat_observations") state.forbidden.push(`insert ${table}`);
        action = "insert";
        payload = rows;
        return b;
      },
      update: () => {
        state.forbidden.push(`update ${table}`);
        return b;
      },
      upsert: () => {
        state.forbidden.push(`upsert ${table}`);
        return b;
      },
      maybeSingle: async () => ({ data: table === "faostat_syncs" ? (state.syncs.at(-1) ?? null) : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (action === "delete" && table === "faostat_pending") {
          state.pending = state.pending.filter((r) => !(filter ? filter(r) : true));
          return resolve({ error: null });
        }
        if (action === "insert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === "faostat_pending") state.pending.push(...(rows as Record<string, unknown>[]));
          if (table === "faostat_syncs") state.syncs.push(...(rows as Record<string, unknown>[]));
          return resolve({ error: null });
        }
        if (table === "faostat_observations") {
          state.reads++;
          const all = state.observations.filter((r) => (filter ? filter(r) : true));
          return resolve({ data: slice ? all.slice(slice[0], slice[1] + 1) : all, error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return b;
  };
  const admin = { from: builder } as unknown as Parameters<typeof syncFaostat>[0];

  const first = await syncFaostat(admin, "cron", { dir });
  eq([first.newRows, first.changedRows, first.sameRows], [3, 1, 3], "found 3 new, 1 changed, 3 unchanged");
  eq(state.pending.map((p) => [p.domain, p.item, p.year, p.old_value ?? null]),
    [["PP", "Sesame seed", 2023, 1200.5], ["PP", "Sesame seed", 2024, null], ["TCL", "Sheep", 2024, null], ["QCL", "Sorghum", 2024, null]],
    "staged exactly the difference");
  eq(state.forbidden, [], "and wrote nothing to the figures a visitor reads");
  eq(state.observations.length, 4, "which are as they were");
  eq(state.syncs.length, 1, "it recorded the look");
  eq(Object.keys(state.syncs[0].files as object).sort(), ["PP", "QCL", "TCL"], "with each file's size and fingerprint");
  ok(typeof (state.syncs[0].files as Record<string, { sha: string }>).PP.sha === "string" && (state.syncs[0].files as Record<string, { sha: string }>).PP.sha.length === 64, "a 64-character fingerprint");

  const readsAfterFirst = state.reads;
  const second = await syncFaostat(admin, "cron", { dir });
  ok(second.skipped && state.reads === readsAfterFirst && state.syncs.length === 1, "the same files again: skipped, the database not even read, nothing logged");

  state.pending = [];
  const set_aside = await syncFaostat(admin, "cron", { dir });
  ok(set_aside.skipped && state.pending.length === 0, "a difference the administrator set aside does not come back while the files stay the same");
  const forced = await syncFaostat(admin, "admin", { dir, force: true });
  ok(!forced.skipped && state.pending.length === 4, "«check now» compares again and brings it back");

  write("faostat-prices.tsv", pp("Sesame seed", 2023, 1310), pp("Sesame seed", 2024, 1400), pp("Millet", 2023, 500), pp("Millet", 2024, 520));
  const changedFile = await syncFaostat(admin, "cron", { dir });
  ok(!changedFile.skipped && state.pending.filter((p) => p.domain === "PP").length === 3, "a changed file is compared, and its domain's pending replaced (not added to)");
  eq(state.pending.filter((p) => p.domain === "TCL").length, 1, "the other domains' pending stay as they were");

  console.log("\nA file that must not be compared");
  write("faostat-trade.tsv", tcl("Sheep", 2024, 1100)); // 1 row against 1 held: fine; shrink below half instead:
  state.observations.push(...Array.from({ length: 5 }, (_, i) => ({ domain: "TCL", area: "Sudan", element: "Export quantity", item: `I${i}`, year: 2023, unit: "t", value: 1, flag: "A" })));
  const pendingBefore = state.pending.filter((p) => p.domain === "TCL").length;
  const refused = await syncFaostat(admin, "cron", { dir });
  ok(refused.problems.some((p) => p.startsWith("رُفض") && p.includes("TCL")), "a file under half of what is held is refused, with the reason");
  eq(state.pending.filter((p) => p.domain === "TCL").length, pendingBefore, "and what was staged for that domain before stays untouched");
  ok(refused.problems.some(isFailure), "it counts as a look that did not happen");
  const again = await syncFaostat(admin, "cron", { dir });
  ok(!again.skipped, "so the same file is looked at again the next time, not skipped");

  rmSync(join(dir, "faostat-yield.tsv"));
  const missing = await syncFaostat(admin, "admin", { dir, force: true });
  ok(missing.problems.some((p) => p.includes("faostat-yield.tsv") && !isFailure(p)), "a missing file is a note, not a failure");
  ok(state.pending.some((p) => p.domain === "PP"), "and the other files are still compared");

  console.log("\nA big change is flagged, not blocked");
  write("faostat-prices.tsv", pp("Sesame seed", 2023, 99999), pp("Millet", 2023, 99999));
  state.observations.splice(0, state.observations.length, ...[
    { domain: "PP", area: "Sudan", element: "Producer Price (USD/tonne)", item: "Sesame seed", year: 2023, unit: "USD", value: 1200.5, flag: "A" },
    { domain: "PP", area: "Sudan", element: "Producer Price (USD/tonne)", item: "Millet", year: 2023, unit: "USD", value: 500, flag: "A" },
  ]);
  const big = await syncFaostat(admin, "admin", { dir, force: true });
  ok(big.problems.some((p) => p.startsWith("تنبيه") && p.includes("PP")), `more than ${BIG_CHANGE_SHARE * 100}% of a domain changed: flagged for a closer look`);
  ok(!big.problems.some(isFailure) || big.problems.filter(isFailure).every((p) => !p.includes("PP")), "but staged all the same");
  ok(state.pending.filter((p) => p.domain === "PP").length === 2, "the two changes are there for the administrator to decide");

  console.log("\nThe places that must agree with each other");
  const workflow = readFileSync(join(root, ".github/workflows/faostat-refresh.yml"), "utf8");
  for (const s of SLICES) {
    ok(new RegExp(`--domain ${s.domain}\\s+--out data/${s.file.replace(".", "\\.")}`).test(workflow), `the workflow trims ${s.domain} into data/${s.file}`);
    ok(workflow.includes(`data/${s.file}`) && /git add [^\n]*/.exec(workflow)![0].includes(`data/${s.file}`), `and commits it`);
  }
  const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
  ok(SLICES.every((s) => /^faostat-.*\.tsv$/.test(s.file)), "every slice matches the tracing pattern faostat-*.tsv");
  for (const route of ["/api/health", "/admin/faostat"]) {
    ok(new RegExp(`"${route}":\\s*\\["\\./data/faostat-\\*\\.tsv"\\]`).test(nextConfig), `${route} has the data files traced into its deployment`);
  }
  const trim = readFileSync(join(root, "scripts/faostat-trim.py"), "utf8");
  const pyRank = /UNIT_RANK = \[([^\]]*)\]/.exec(trim)?.[1].split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  eq(pyRank, UNIT_RANK, "the trim and the sync rank the units in the same order");
  ok(/choices=\("PP", "TCL", "QCL"\)/.test(trim), "the trim accepts the three domains");
  const migration = readFileSync(join(root, "supabase/migrations/20261025130000_faostat_sync.sql"), "utf8");
  ok(SLICES.every((s) => migration.includes(`'${s.domain}'`)), "the migration's domain check lists every slice's domain");
  const health = readFileSync(join(root, "src/app/api/health/route.ts"), "utf8");
  ok(health.includes("syncFaostat(supabase"), "the daily check runs the sync");

  console.log("");
  if (failed) {
    console.log(`${failed} FAILED`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED — the files are compared, the difference waits for the administrator, and nothing a visitor reads is written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
