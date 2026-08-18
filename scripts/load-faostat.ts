/**
 * Loads the FAOSTAT reference into faostat_observations.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/load-faostat.ts [--dry-run]
 *
 * WHY A SCRIPT AND NOT A MIGRATION
 *
 * Twenty-six thousand observations are data, not schema. Pasting them into a
 * migration would make a file nobody can review, and re-running it after FAO's
 * next annual release would mean editing that file rather than dropping in a
 * CSV.
 *
 * It also removes a transcription risk that is easy to underestimate. The
 * sources in data/ are FAOSTAT exports, unchanged; this script reads them and
 * nothing else. No number is retyped on the way in, so no number can be altered
 * on the way in — which matters more here than in most places, because a
 * benchmark that is quietly wrong is one somebody acts on without ever
 * suspecting it. That is also why this is not pasted through a chat: 883 KB of
 * hand-copied INSERT statements is a corrupted digit waiting to happen, and the
 * corruption would be invisible.
 *
 * The upsert is keyed on (area, element, item, year), so running it twice
 * changes nothing and running it after a new export updates in place.
 *
 * TO REFRESH WHEN FAO PUBLISHES
 *
 * Export from faostat.fao.org, drop the CSV into data/, run this. Nothing else
 * changes — not this script, and not the schema.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/*
 * Every CSV in data/ is loaded, not one named file.
 *
 * FAOSTAT exports are per-query: one covers twenty-two countries for 2023–2024,
 * another covers seven countries across 2017–2024. Neither is "the" dataset and
 * a third will arrive. Reading the directory means adding coverage is dropping
 * a file in, and the upsert key makes the overlap between exports — 448 rows
 * where the two current files describe the same observation — harmless rather
 * than a duplicate to reconcile.
 */
const CSV_DIR = "data";
const BATCH = 500;

interface Observation {
  area: string;
  element: string;
  item: string;
  year: number;
  unit: string;
  value: number;
  flag: string | null;
}

/**
 * A CSV parser that respects quoted fields.
 *
 * FAOSTAT quotes every field and several item names contain commas — "Maize
 * (corn)" is harmless, but "Groundnuts, excluding shelled" splits into two
 * columns under a naive split(","), and every column after it shifts. That
 * failure is silent: the row still parses, it just describes something else.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function readFile(path: string): Observation[] {
  // The BOM FAOSTAT writes would otherwise become part of the first header
  // name, so the first column could never be found by name.
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const header = parseCsvLine(lines[0]);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`column "${name}" not in ${path}`);
    return i;
  };

  const iArea = col("Area");
  const iElement = col("Element");
  const iItem = col("Item");
  const iYear = col("Year");
  const iUnit = col("Unit");
  const iValue = col("Value");
  const iFlag = col("Flag");

  const rows: Observation[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const value = Number(f[iValue]);
    const year = Number(f[iYear]);

    // FAOSTAT ships rows with no value for combinations it has no figure for.
    // They are dropped rather than stored as zero: "no data" and "none" are
    // different claims, and a zero yield is a claim about a harvest.
    if (!Number.isFinite(value) || !Number.isFinite(year) || !f[iArea]) {
      skipped++;
      continue;
    }

    rows.push({
      area: f[iArea],
      element: f[iElement],
      item: f[iItem],
      year,
      unit: f[iUnit],
      value,
      flag: f[iFlag] || null,
    });
  }

  console.log(
    `  ${path}: ${rows.length} observations, ${skipped} skipped without a value`,
  );
  return rows;
}

/**
 * Reads every CSV in the data directory and removes overlap between them.
 *
 * Later files win on a clash, which is the right way round: a fresh export
 * carries FAO's current figure for an observation an older export estimated.
 */
function read(): Observation[] {
  const files = readdirSync(CSV_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort()
    .map((f) => join(CSV_DIR, f));

  if (files.length === 0) throw new Error(`no CSV files in ${CSV_DIR}/`);

  const byKey = new Map<string, Observation>();
  for (const file of files) {
    for (const row of readFile(file)) {
      byKey.set(`${row.area}|${row.element}|${row.item}|${row.year}`, row);
    }
  }

  console.log(`${files.length} files, ${byKey.size} distinct observations`);
  return [...byKey.values()];
}

async function main() {
  const rows = read();

  const areas = new Set(rows.map((r) => r.area));
  const items = new Set(rows.map((r) => r.item));
  const years = [...new Set(rows.map((r) => r.year))].sort();
  console.log(`${areas.size} areas, ${items.size} items, years ${years.join(", ")}`);

  if (process.argv.includes("--dry-run")) {
    console.log("dry run — nothing written");
    return;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must both be set.\n" +
        "The service role key is needed because faostat_observations is admin-write:\n" +
        "a benchmark anyone could edit is not a benchmark.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("faostat_observations")
      .upsert(chunk, { onConflict: "area,element,item,year" });

    if (error) {
      console.error(`batch at ${i} failed: ${error.message}`);
      process.exit(1);
    }

    written += chunk.length;
    process.stdout.write(`\r  ${written}/${rows.length}`);
  }

  console.log(`\nloaded ${written} observations`);

  // Read back and report, so a run that silently wrote nothing is visible.
  const { count } = await supabase
    .from("faostat_observations")
    .select("*", { count: "exact", head: true });
  console.log(`table now holds ${count} rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
