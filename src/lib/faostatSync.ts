import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * بيانات الفاو تدخل القاعدة وحدها وتُعتمد بنقرة (البند ١٩٧).
 *
 * `faostat-refresh.yml` يجلب شرائح FAOSTAT مرّتين في السنة ويلتزم بها في data/ (الأسعار PP والتجارة TCL والغلّة QCL).
 * وكان إدخالها في `faostat_observations` خطوةً يدويّة. هذه المزامنة تقرأ الملفّات من النشر نفسه، وتقارنها بما في
 * القاعدة، وتضع **الفرق وحده** في `faostat_pending`: لا تكتب في `faostat_observations` ولا مفتاحُ الخدمة يملك ذلك
 * (supabase/migrations/20261025130000_faostat_sync.sql)، فما يراه الزائر من هذه البيانات لا يتغيّر قبل أن يعتمد
 * المدير الفرق بدالّةٍ واحدة تحفظ ما تستبدله.
 *
 * وثلاثة أحكامٍ في المقارنة:
 *  - صفٌّ في القاعدة غاب عن الملفّ **يبقى** (ما حُمّل يُحفظ).
 *  - ملفٌّ أصغر من نصف ما في القاعدة، أو فارغٌ، أو أكثر من نصف في المئة من صفوفه مشوَّهة: يُرفض ولا يُوضع منه شيء،
 *    فخللٌ في التقليم لا يصير «فرقاً» يعتمده المدير بنقرة دون أن يرى.
 *  - ملفٌّ بالبصمة نفسها التي فُحصت آخر مرّة لا يُقارَن من جديد (ورفضُ المدير للفرق يبقى رفضاً حتى يتغيّر الملفّ؛
 *    زرّ «افحص الآن» وحده يُعيد المقارنة).
 */

export type Domain = "QCL" | "PP" | "TCL";

/** The slices `faostat-refresh.yml` commits, and the domain each one is. */
export const SLICES: { domain: Domain; file: string; name: string }[] = [
  { domain: "PP", file: "faostat-prices.tsv", name: "أسعار المنتجين" },
  { domain: "TCL", file: "faostat-trade.tsv", name: "التجارة" },
  { domain: "QCL", file: "faostat-yield.tsv", name: "الغلّة والإنتاج" },
];

export interface Obs {
  domain: Domain;
  area: string;
  element: string;
  item: string;
  year: number;
  unit: string;
  value: number;
  flag: string | null;
}

export interface DbRow {
  unit: string;
  value: number;
  flag: string | null;
}

export interface Pending extends Obs {
  old_unit: string | null;
  old_value: number | null;
  old_flag: string | null;
}

export const keyOf = (o: { area: string; element: string; item: string; year: number }) =>
  `${o.area}\t${o.element}\t${o.item}\t${o.year}`;

/** Share of malformed rows above which a file is refused outright. */
export const MAX_BAD_SHARE = 0.005;
/** A file with fewer rows than this share of what the database holds for its domain is refused. */
export const MIN_SIZE_SHARE = 0.5;
/** More changed rows than this share of the domain is staged, but flagged for a closer look. */
export const BIG_CHANGE_SHARE = 0.3;

const flagOf = (f: string | null | undefined) => {
  const t = (f ?? "").trim();
  return t === "" ? null : t;
};

/** One slice as `scripts/faostat-trim.py` writes it: domain, area, element, item, year, unit, value, flag — tab-separated. */
export function parseSlice(text: string, domain: Domain): { rows: Obs[]; bad: number } {
  const byKey = new Map<string, Obs>();
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const f = line.split("\t");
    const year = Number(f[4]);
    const value = Number(f[6]);
    if (
      f.length !== 8 ||
      f[0] !== domain ||
      !f[1] || !f[2] || !f[3] || !f[5] ||
      !Number.isInteger(year) || year < 1960 || year > 2100 ||
      f[6].trim() === "" || !Number.isFinite(value)
    ) {
      bad++;
      continue;
    }
    const o: Obs = { domain, area: f[1], element: f[2], item: f[3], year, unit: f[5], value, flag: flagOf(f[7]) };
    // Last row wins, as in the trim and the old loader's upsert — unless the earlier row's unit ranks before it.
    const earlier = byKey.get(keyOf(o));
    if (earlier && unitRank(earlier.unit) < unitRank(o.unit)) continue;
    byKey.set(keyOf(o), o);
  }
  return { rows: [...byKey.values()], bad };
}

/**
 * Two FAOSTAT rows can share (area, element, item, year) and differ only in unit: eggs have a «Production» in tonnes
 * (element code 5510) and another in thousands of eggs (5513), and the table's key cannot hold both. Which one a row
 * stored was an accident of load order — 52 of the 97 Hen-eggs rows held on 25 October 2026 were counts, not tonnes. The
 * rule is now fixed and the same in `scripts/faostat-trim.py`: the mass unit wins, a count of animals or items comes last.
 */
export const UNIT_RANK = ["t", "kg/ha", "ha", "kg/An", "g/An", "An", "1000 An", "No", "1000 No"];
export const unitRank = (u: string) => {
  const i = UNIT_RANK.indexOf(u);
  return i === -1 ? UNIT_RANK.length : i;
};

export const sameValue = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** What the file says that the database does not: rows that are new, and rows whose value, unit or flag differ. */
export function diffSlice(file: Obs[], db: Map<string, DbRow>): { pending: Pending[]; same: number } {
  const pending: Pending[] = [];
  let same = 0;
  for (const o of file) {
    const old = db.get(keyOf(o));
    if (!old) {
      pending.push({ ...o, old_unit: null, old_value: null, old_flag: null });
    } else if (!sameValue(o.value, old.value) || o.unit !== old.unit || o.flag !== flagOf(old.flag)) {
      pending.push({ ...o, old_unit: old.unit, old_value: old.value, old_flag: flagOf(old.flag) });
    } else {
      same++;
    }
  }
  return { pending, same };
}

/** Why a file must not be compared at all, or null. */
export function refusal(rows: number, bad: number, dbRows: number): string | null {
  if (rows === 0) return "الملف فارغ أو لا صفّ صالحاً فيه";
  if (bad / (rows + bad) > MAX_BAD_SHARE) return `${bad} صفّاً مشوّهاً من ${rows + bad} — أكثر مما يُحتمل`;
  if (dbRows > 0 && rows < dbRows * MIN_SIZE_SHARE) return `الملف (${rows} صفّاً) أصغر من نصف المحفوظ (${dbRows}) — يُراجَع التقليم`;
  return null;
}

/** The problems that mean a look did not happen (as against notes: a missing file, a warning, ignored rows). */
export const isFailure = (problem: string) => problem.startsWith("رُفض") || problem.startsWith("تعذّر") || problem.startsWith("سجلّ الفحص");

export interface SyncSummary {
  skipped: boolean;
  newRows: number;
  changedRows: number;
  sameRows: number;
  problems: string[];
  files: Record<string, { rows: number; sha: string }>;
}

// The first look after the yield slice arrived stages ~50,000 new rows (28 areas × 287 items × 8 years against the 26,114
// the old exports held): 2,000 a request keeps that to 25 requests inside the daily check's minute.
const BATCH = 2000;
const PAGE = 1000;

async function loadDb(admin: SupabaseClient, domain: Domain): Promise<Map<string, DbRow>> {
  const out = new Map<string, DbRow>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("faostat_observations")
      .select("area,element,item,year,unit,value,flag")
      .eq("domain", domain)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`faostat_observations: ${error.message}`);
    const page = (data ?? []) as { area: string; element: string; item: string; year: number; unit: string; value: number | string; flag: string | null }[];
    for (const r of page) out.set(keyOf(r), { unit: r.unit, value: Number(r.value), flag: flagOf(r.flag) });
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * Compare the committed slices with the database and stage the difference. Called by the daily check (`/api/health`) and
 * by the «افحص الآن» button (`force`, which compares again even when no file changed since the last look).
 */
export async function syncFaostat(
  admin: SupabaseClient,
  trigger: "cron" | "admin",
  opts: { force?: boolean; dir?: string } = {},
): Promise<SyncSummary> {
  const dir = opts.dir ?? join(process.cwd(), "data");
  const problems: string[] = [];
  const files: SyncSummary["files"] = {};
  const texts = new Map<Domain, string>();

  for (const s of SLICES) {
    const path = join(dir, s.file);
    if (!existsSync(path)) {
      problems.push(`${s.name} (${s.domain}): لا ملف ${s.file} في data/ بعد`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    texts.set(s.domain, text);
    files[s.domain] = { rows: 0, sha: createHash("sha256").update(text).digest("hex") };
  }

  // Nothing changed since the last look: nothing to compare (and a discarded difference stays discarded).
  if (!opts.force) {
    const { data: last } = await admin.from("faostat_syncs").select("files,problems").order("ran_at", { ascending: false }).limit(1).maybeSingle();
    const prevRun = last as { files: Record<string, { sha?: string }>; problems: string[] } | null;
    const prev = prevRun?.files;
    // A look that was refused or failed is looked at again even when the files are the same.
    const failedBefore = (prevRun?.problems ?? []).some(isFailure);
    if (prev && !failedBefore && texts.size > 0 && [...texts.keys()].every((d) => prev[d]?.sha === files[d].sha)) {
      return { skipped: true, newRows: 0, changedRows: 0, sameRows: 0, problems, files };
    }
  }

  let newRows = 0;
  let changedRows = 0;
  let sameRows = 0;

  for (const s of SLICES) {
    const text = texts.get(s.domain);
    if (text === undefined) continue;
    const { rows, bad } = parseSlice(text, s.domain);
    files[s.domain].rows = rows.length;
    try {
      const db = await loadDb(admin, s.domain);
      const why = refusal(rows.length, bad, db.size);
      if (why) {
        problems.push(`رُفض ملف ${s.name} (${s.domain}): ${why}`);
        continue;
      }
      if (bad > 0) problems.push(`${s.name} (${s.domain}): ${bad} صفّاً مشوّهاً تُجوهل`);
      const { pending, same } = diffSlice(rows, db);
      const fresh = pending.filter((p) => p.old_value === null).length;
      newRows += fresh;
      changedRows += pending.length - fresh;
      sameRows += same;
      if (db.size > 0 && pending.length - fresh > db.size * BIG_CHANGE_SHARE) {
        problems.push(`تنبيه: تغيّر ${pending.length - fresh} من ${db.size} رقماً في ${s.name} (${s.domain}) — راجع قبل الاعتماد`);
      }

      const { error: delErr } = await admin.from("faostat_pending").delete().eq("domain", s.domain);
      if (delErr) throw new Error(`faostat_pending: ${delErr.message}`);
      for (let i = 0; i < pending.length; i += BATCH) {
        const { error } = await admin.from("faostat_pending").insert(pending.slice(i, i + BATCH));
        if (error) throw new Error(`faostat_pending: ${error.message}`);
      }
    } catch (e) {
      problems.push(`تعذّرت مقارنة ${s.name} (${s.domain}): ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  const { error } = await admin.from("faostat_syncs").insert({
    trigger,
    files,
    new_rows: newRows,
    changed_rows: changedRows,
    same_rows: sameRows,
    problems: problems.slice(0, 20),
  });
  if (error) problems.push(`سجلّ الفحص: ${error.message}`);

  return { skipped: false, newRows, changedRows, sameRows, problems, files };
}
