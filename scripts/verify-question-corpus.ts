/**
 * حصاد الأسئلة المسجَّلة: كم منها يُجاب بلا نموذج؟
 *
 * WHY THIS EXISTS
 *
 * Every other verify script here asks "is this function still right?".  This
 * one asks a different question, and the only one that decides where work
 * should go next: **of the questions people actually asked, how many can the
 * platform answer with no language model at all?**
 *
 * The deterministic resolvers were built because the model is the part that
 * fails — it needs a network, a key, a quota, and a provider that is up.  A
 * resolver needs none of those.  So the share of real questions answered
 * without one is not a nice-to-have metric; it is the share of the service that
 * survives its own worst day.
 *
 * WHY IT READS A FILE INSTEAD OF THE DATABASE
 *
 * CI holds placeholder credentials on purpose — nothing in a workflow may reach
 * production.  So the corpus is a snapshot, `data/logged-questions.json`, taken
 * from `assistant_questions` and committed.  It goes stale, and that is the
 * intended trade: a stale corpus makes the measurement old, while a live
 * connection from CI would make the whole pipeline a credential holder.
 *
 * Refresh it by re-running the grouping query named in that file.
 *
 * WHAT THE NUMBER MEANS, EXACTLY
 *
 * It is a **floor**, and deliberately a pessimistic one.  The run supplies no
 * knowledge entries at all, so every question that a curated entry would have
 * answered counts here as unanswered.  A question that clears this bar is
 * answered from arithmetic or from a measured row — with the knowledge base
 * cold, the model absent and the network down.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerLocally,
  type AnswerSource,
  type CanalFactRow,
  type MarketRow,
} from "../src/lib/localAnswer";

interface Corpus {
  fetchedAt: string;
  totalAsked: number;
  questions: { q: string; n: number }[];
}

const corpus: Corpus = JSON.parse(
  readFileSync(join(process.cwd(), "data/logged-questions.json"), "utf8"),
);

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

/* ------------------------------------------------------------------ *
 * The context the resolvers read
 * ------------------------------------------------------------------ */

/*
 * Hand-written rather than snapshotted from the database, and small on purpose.
 *
 * A committed dump of all 45 canal facts and all 46 market rows would be a
 * third copy of numbers that already live in two places, and it would drift
 * from both while looking authoritative — the exact failure the mobile parity
 * check exists to prevent.  These fixtures carry only the shape and the few
 * keys the logged questions actually reach, so nothing here can be mistaken for
 * a source of truth about the canal or about yields.
 */
const canalFacts: CanalFactRow[] = [
  {
    key: "route_length",
    label: "طول المسار",
    value: "94",
    unit: "كم",
    status: "derived",
    source: "SRTM",
    note: null,
  },
  {
    key: "static_lift",
    label: "الرفع الساكن",
    value: "112",
    unit: "م",
    status: "derived",
    source: "SRTM",
    note: null,
  },
  {
    key: "terminus_above_source",
    label: "ارتفاع المصبّ عن المأخذ",
    value: "112",
    unit: "م",
    status: "measured",
    source: "SRTM",
    note: null,
  },
  {
    key: "pilot_design",
    label: "تصميم المرحلة التجريبية",
    value: "قطاع شبه منحرف",
    unit: null,
    status: "derived",
    source: "مانينغ",
    note: null,
  },
];

const market: MarketRow[] = [
  {
    item: "Sorghum",
    year: 2024,
    sudan_kg_ha: 632.7,
    egypt_kg_ha: 5200,
    peer_median_kg_ha: 2783.4,
    sudan_export_usd_per_tonne: 357.78,
    regional_producer_usd_per_tonne: 321.13,
  },
  {
    item: "Sesame seed",
    year: 2024,
    sudan_kg_ha: 279.2,
    egypt_kg_ha: 965.5,
    peer_median_kg_ha: 840.8,
    sudan_export_usd_per_tonne: 1611.52,
    regional_producer_usd_per_tonne: 324.33,
  },
  {
    item: "Tomatoes",
    year: 2024,
    sudan_kg_ha: 13576.7,
    egypt_kg_ha: 42880.3,
    peer_median_kg_ha: 26850.4,
    sudan_export_usd_per_tonne: null,
    regional_producer_usd_per_tonne: 573.64,
  },
  {
    item: "Rice",
    year: 2024,
    sudan_kg_ha: 4441.1,
    egypt_kg_ha: 9131.5,
    peer_median_kg_ha: 3382.4,
    sudan_export_usd_per_tonne: null,
    regional_producer_usd_per_tonne: 655.32,
  },
];

const answer = (question: string) =>
  answerLocally({
    question,
    // Cold on purpose — see the header.
    entries: [],
    projectCount: 0,
    investmentLive: false,
    canalFacts,
    market,
  });

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

interface Row {
  q: string;
  n: number;
  source: AnswerSource | null;
}

const rows: Row[] = corpus.questions.map(({ q, n }) => ({
  q,
  n,
  source: answer(q)?.source ?? null,
}));

const asked = rows.reduce((s, r) => s + r.n, 0);
const answeredAsks = rows.reduce((s, r) => s + (r.source ? r.n : 0), 0);
const answeredDistinct = rows.filter((r) => r.source).length;

console.log("=".repeat(78));
console.log(
  `الأسئلة المسجَّلة حتى ${corpus.fetchedAt} — ${asked} سؤالاً، ${rows.length} صيغة مختلفة`,
);
console.log("=".repeat(78));

const pad = (s: string, w: number) => (s.length >= w ? s : s + " ".repeat(w - s.length));

for (const r of [...rows].sort((a, b) => b.n - a.n || a.q.localeCompare(b.q))) {
  const mark = r.source ? `→ ${r.source}` : "— لا مُجيب";
  console.log(`  ${pad(`×${r.n}`, 5)}${pad(mark, 16)}${r.q}`);
}

/* ------------------------------------------------------------------ *
 * What the numbers have to clear
 * ------------------------------------------------------------------ */

console.log();
console.log("=".repeat(78));
console.log("التغطية بلا نموذج، وبقاعدة معرفة باردة");
console.log("=".repeat(78));

const pct = (a: number, b: number) => ((100 * a) / b).toFixed(0);
console.log(
  `  موزونة بعدد مرات السؤال : ${answeredAsks}/${asked}  (${pct(answeredAsks, asked)}٪)`,
);
console.log(
  `  بالصيغ المختلفة          : ${answeredDistinct}/${rows.length}  (${pct(answeredDistinct, rows.length)}٪)`,
);

const bySource = new Map<string, number>();
for (const r of rows) {
  if (r.source) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.n);
}
console.log();
for (const [src, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(src, 12)} ${n} سؤالاً`);
}

console.log();

/*
 * A ratchet, not a target.
 *
 * The floor is set just under what the code achieves today, so the check fails
 * when a change takes coverage backwards — which is the failure that would
 * otherwise be invisible: every unit test still green, and the assistant
 * quietly leaning on the model again for questions it used to answer itself.
 *
 * Raise this number when the resolvers improve.  Never lower it to make a build
 * pass; lowering it is the bug.
 */
const WEIGHTED_FLOOR = 78;
const weighted = (100 * answeredAsks) / asked;
ok(
  weighted >= WEIGHTED_FLOOR,
  `التغطية الموزونة ${weighted.toFixed(0)}٪ ≥ الأرضية ${WEIGHTED_FLOOR}٪`,
);

/*
 * The soil-and-water cluster is singled out because it is the platform's
 * largest single intent — over half of everything asked — and because it is the
 * one the resolvers were built for.  A regression here would be the whole point
 * of that work coming undone, and it would hide inside an aggregate that still
 * looked healthy.
 */
const soilCluster = rows.filter((r) =>
  /واط|واسط|رمل|عطش|عطس|عشة|رويان|تنشف|موي|مي /.test(r.q),
);

/*
 * One exclusion, and it is a standing-down that is correct rather than a miss.
 *
 * "الواطة" on its own — asked twice — names the subject and says nothing about
 * it. Dry or wet, sand or clay, the question does not say, and every useful
 * answer this engine has depends on knowing which. Answering it anyway means
 * picking a soil for the farmer and presenting the result as theirs, which is
 * the failure this whole platform is built against. It stays unanswered here on
 * purpose, and it is written down rather than quietly dropped from the regex.
 */
const STATELESS = new Set(["الواطة"]);
const stated = soilCluster.filter((r) => !STATELESS.has(r.q));
const soilAsks = stated.reduce((s, r) => s + r.n, 0);
const soilAnswered = stated.reduce((s, r) => s + (r.source ? r.n : 0), 0);
ok(
  soilAnswered === soilAsks,
  `عنقود التربة والمياه، حين تُذكر الحالة: ${soilAnswered}/${soilAsks} — لا يُقبل نقصان`,
);

/*
 * The canal must never fall through to the model. Forty-five attributes sit in
 * a table with a status and a source on each precisely so that the answer comes
 * from a row; a model asked about the canal produces something fluent, and
 * "غير معروف" is the truthful answer to several of these.
 *
 * Named schemes — الجموعية، سوبا غرب — are deliberately NOT asserted here.
 * They are answered from curated knowledge entries, and this run keeps the
 * knowledge base cold on purpose. Demanding a row-based answer for them would
 * be demanding that the platform hold a table it has no reason to hold.
 */
const canalAsked = rows.filter((r) => /القوسية/.test(r.q));
ok(
  canalAsked.length > 0 && canalAsked.every((r) => r.source === "canal"),
  `أسئلة القناة (${canalAsked.length}) تُجاب كلها من ملفّ الحقائق`,
);

/* ------------------------------------------------------------------ *
 * The remaining gap, named rather than rounded away
 * ------------------------------------------------------------------ */

const unanswered = rows.filter((r) => !r.source);
if (unanswered.length > 0) {
  console.log();
  console.log("=".repeat(78));
  console.log("ما لا يزال بلا مُجيب حتمي — هذه هي قائمة العمل التالية");
  console.log("=".repeat(78));
  for (const r of unanswered.sort((a, b) => b.n - a.n)) {
    console.log(`  ×${r.n}  ${r.q}`);
  }
  console.log();
  console.log(
    "  ليست كلها إخفاقاً: بعضها نثريّ بطبعه (تجربة دولة، مراحل زراعة) وتخدمه",
  );
  console.log(
    "  قاعدة المعرفة، وهي معطَّلة في هذا الفحص عمداً. لكن ما يتكرر منها ويحمل",
  );
  console.log("  رقماً هو المُجيب التالي الذي يستحق البناء.");
}

console.log();
console.log(fail === 0 ? "corpus: PASS" : `corpus: ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
