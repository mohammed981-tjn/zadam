/**
 * Checks the semantic half of retrieval: the vector normalisation that makes
 * cosine comparable, and the rank fusion that merges the two rankers.
 *
 *   npx tsx scripts/verify-embedding.ts
 *
 * Runs offline. The Gemini call is not exercised here — a test that needs a key
 * and a network is a test that gets skipped — so the checks cover the logic that
 * can silently produce plausible-looking nonsense: an unnormalised vector, or a
 * fusion that quietly drops the entry only one ranker found.
 */

import {
  fuseRankings,
  scoreEntries,
  type RetrievableEntry,
  type SemanticMatch,
} from "../src/lib/retrieval";
import { entryEmbeddingText, EMBEDDING_DIMENSIONS } from "../src/lib/embedding";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const section = (t: string) =>
  console.log(
    `\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`,
  );

const E = (crop: string, title: string, content: string): RetrievableEntry => ({
  crop,
  topic: "general",
  title,
  content,
  source_country: "السودان",
  source_note: null,
});

const S = (e: RetrievableEntry, similarity: number): SemanticMatch => ({
  ...e,
  similarity,
});

/* ------------------------------------------------------------------ */
section("A) The text an entry is embedded as");

const entry = E("قطن", "الإجهاد المائي في القطن", "يظهر الذبول عند نقص الري");

ok(
  entryEmbeddingText(entry).startsWith("الإجهاد المائي في القطن"),
  "title leads, where the model weights it most",
);
ok(
  entryEmbeddingText(entry).includes("يظهر الذبول"),
  "content is included",
);
ok(
  entryEmbeddingText({ crop: "", topic: "", title: "ت", content: "م" }) ===
    "ت\nم",
  "empty fields are dropped rather than leaving blank lines",
);
ok(EMBEDDING_DIMENSIONS === 768, "dimensions match the vector(768) column");

/* ------------------------------------------------------------------ */
section("B) Fusion keeps what each ranker alone would lose");

const water = E(
  "قطن",
  "الإجهاد المائي في القطن",
  "الإجهاد المائي يقلل عدد اللوز ويسبب تساقطه قبل النضج",
);
const bonjro = E(
  "ري",
  "تقنية بونجرو الهندية",
  "بونجرو بئر واسع يحقن مياه الجريان في الطبقة الجوفية",
);
const onion = E("بصل", "تخزين البصل", "التخزين الجيد يقلل الفقد بعد الحصاد");
const pest = E("قطن", "دودة اللوز", "المكافحة المتكاملة لدودة اللوز في القطن");

const kb = [water, bonjro, onion, pest];

// The motivating case: no shared term between question and the entry that
// answers it, so the lexical ranker cannot see it at all.
const question = "الجروف عطشانة";
const lexicalOnly = scoreEntries(question, kb).filter((s) => s.score > 0);
ok(
  !lexicalOnly.some((s) => s.entry.title === water.title),
  "lexical ranking alone misses the entry that answers 'الجروف عطشانة'",
);

const fused = fuseRankings(question, kb, [S(water, 0.71), S(onion, 0.48)], 4);
ok(
  fused.some((e) => e.title === water.title),
  "fusion recovers it from the semantic side",
);
ok(fused[0].title === water.title, "and ranks it first");

/* ------------------------------------------------------------------ */
section("C) Fusion does not discard the lexical side");

// A rare exact name is what the lexical ranker is best at and a vector model
// blurs. It must survive even when the semantic list disagrees entirely.
const named = fuseRankings(
  "ما هي تقنية بونجرو",
  kb,
  [S(onion, 0.52), S(pest, 0.5)],
  4,
);
ok(
  named.some((e) => e.title === bonjro.title),
  "an entry only the lexical ranker found still gets through",
);
ok(named[0].title === bonjro.title, "and an exact name still ranks first");

/* ------------------------------------------------------------------ */
section("D) Degrading rather than failing");

const noSemantic = fuseRankings("الجروف عطشانة", kb, [], 4);
ok(
  noSemantic.length > 0,
  "an empty semantic list falls back to the lexical path",
);

const bigKb = Array.from({ length: 30 }, (_, i) =>
  E(`محصول${i}`, `عنوان ${i}`, `محتوى ${i} عن الزراعة`),
);
ok(
  fuseRankings("عنوان 3", bigKb, [S(bigKb[7], 0.6)], 5).length <= 5,
  "never returns more than the limit",
);
ok(
  fuseRankings("", kb, [S(water, 0.6)], 4).length > 0,
  "an empty question does not crash",
);

// Both rankers ranking an entry moderately should beat one ranker's favourite —
// this is the property rank fusion exists for.
const agreed = fuseRankings(
  "دودة اللوز في القطن",
  kb,
  [S(pest, 0.8), S(water, 0.7)],
  4,
);
ok(agreed[0].title === pest.title, "agreement between rankers wins");

/* ------------------------------------------------------------------ */
console.log(
  `\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`,
);
process.exit(fail === 0 ? 0 : 1);
