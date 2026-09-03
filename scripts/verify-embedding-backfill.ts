/**
 * محرّكُ حساب المتّجهات — مفحوصاً بقاعدةٍ مزيّفة ومزوّدٍ مزيّف.
 *
 * WHY THIS IS WORTH A SCRIPT
 *
 * The backfill grew a second caller: a button in /admin, for an operator who
 * has a phone and no terminal. Two callers of one engine is the right shape,
 * but it puts weight on behaviour nobody was checking:
 *
 *   1. The button must do BOUNDED work. A serverless request is killed on its
 *      wall clock with no error anyone can read, so an unbounded run does not
 *      fail loudly — it stops silently, mid-write.
 *   2. `remaining` must be recomputed, never counted down. If it were carried
 *      between presses, a failed batch would still shrink it and the screen
 *      would report finished work that never happened.
 *   3. A failed batch must not cost the batches after it, and must be named.
 *
 * All three are testable without a network or a database: the engine takes its
 * client and its provider as arguments, so both can be fakes.
 */

import {
  backfillEmbeddings,
  isStale,
  staleFilter,
  BATCH_SIZE,
  type KnowledgeRowForEmbedding,
} from "../src/lib/backfillEmbeddings";
import type { EmbeddingProvider } from "../src/lib/embedding";

let fail = 0;
function ok(cond: boolean, label: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
}
function eq<T>(got: T, want: T, label: string) {
  ok(got === want, `${label} — got ${JSON.stringify(got)}`);
}

const MODEL = "fake-model-v1";

function rows(n: number, opts: { model?: string | null; embedded?: boolean } = {}) {
  const out: KnowledgeRowForEmbedding[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `id-${i}`,
      crop: "صمغ عربي",
      topic: "economics",
      title: `عنوان ${i}`,
      content: `محتوى ${i}`,
      embedding_model: opts.model === undefined ? null : opts.model,
      embedding: opts.embedded ? [0.1, 0.2] : null,
    });
  }
  return out;
}

/**
 * The smallest thing shaped like the Supabase client the engine uses: a select
 * that returns the seeded rows, and an update chain that records the write.
 */
function fakeSupabase(seed: KnowledgeRowForEmbedding[], failIds = new Set<string>()) {
  const updates: { id: string; model: string }[] = [];

  const client = {
    from() {
      return {
        select() {
          return Promise.resolve({ data: seed, error: null });
        },
        update(patch: { embedding_model: string }) {
          return {
            eq(_col: string, id: string) {
              if (failIds.has(id)) {
                return Promise.resolve({ error: { message: "رفضت القاعدة" } });
              }
              updates.push({ id, model: patch.embedding_model });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  // The engine's parameter is the real client type; this double implements the
  // three calls it actually makes. Casting here keeps the engine honestly typed
  // rather than loosening it to accommodate a test.
  return { client: client as never, updates };
}

function fakeProvider(opts: { failOnCall?: number } = {}): EmbeddingProvider {
  let call = 0;
  return {
    model: MODEL,
    minSimilarity: 0,
    async embed(texts: string[]) {
      call++;
      if (opts.failOnCall === call) throw new Error("المزوّد سقط");
      return texts.map(() => [0.5, 0.5]);
    },
  };
}

console.log(
  "\n==========================================================================",
);
console.log("A) قاعدةُ التقادُم — أيُّ صفٍّ يحتاج عملاً");
console.log(
  "==========================================================================",
);

ok(isStale({ embedding: null, embedding_model: null }, MODEL), "بلا متّجه ⇐ متقادم");
ok(
  isStale({ embedding: [0.1], embedding_model: "other-model" }, MODEL),
  "متّجهٌ من نموذجٍ آخر ⇐ متقادم — وهذا ما يُسقطه p_model في الاستعلام",
);
ok(
  !isStale({ embedding: [0.1], embedding_model: MODEL }, MODEL),
  "متّجهٌ من النموذج نفسِه ⇐ ليس متقادماً",
);
ok(
  staleFilter(MODEL) === `embedding.is.null,embedding_model.neq.${MODEL}`,
  "مرشّحُ العدّ يقول ما تقوله القاعدةُ نفسُها — الشرطان لا الشرطُ الواحد",
);

// Wrapped rather than run at the top level: this repository's tsx emits CJS,
// where a top-level await is a build error, not a slow start.
async function main() {
console.log(
  "\n==========================================================================",
);
console.log("B) الزرُّ محدودُ العمل — وهذا شرطُ ألّا يُقتل الطلبُ في منتصفه");
console.log(
  "==========================================================================",
);

{
  const seed = rows(BATCH_SIZE * 3);
  const { client, updates } = fakeSupabase(seed);
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider(),
    maxBatches: 1,
  });

  eq(out.pending, BATCH_SIZE * 3, "المنتظِرُ قبل الضغطة");
  eq(out.embedded, BATCH_SIZE, "ضغطةٌ واحدة تحسب دفعةً واحدة لا أكثر");
  eq(updates.length, BATCH_SIZE, "ولم تُكتب صفوفٌ زائدة");
  eq(out.remaining, BATCH_SIZE * 2, "والباقي يُعلَن بصدق — ضغطتان أخريان");
  ok(
    updates.every((u) => u.model === MODEL),
    "واسمُ النموذج مكتوبٌ بجانب كل متّجه",
  );
}

{
  const seed = rows(BATCH_SIZE * 3);
  const { client, updates } = fakeSupabase(seed);
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider(),
  });

  eq(out.embedded, BATCH_SIZE * 3, "وبلا حدٍّ — الأمرُ الطرفي يُنهيها كلَّها");
  eq(out.remaining, 0, "ولا يبقى شيء");
  eq(updates.length, BATCH_SIZE * 3, "بعددِ الصفوف تماماً");
}

console.log(
  "\n==========================================================================",
);
console.log("C) الفشلُ لا يُخفى ولا يُعدَى");
console.log(
  "==========================================================================",
);

{
  // The provider drops the first call. The batches after it must still run —
  // otherwise one bad batch costs every batch behind it.
  const seed = rows(BATCH_SIZE * 3);
  const { client } = fakeSupabase(seed);
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider({ failOnCall: 1 }),
  });

  eq(out.failed, BATCH_SIZE, "الدفعةُ الساقطة تُحسب فاشلة");
  eq(out.embedded, BATCH_SIZE * 2, "والدفعتان بعدها تعملان — لا تُلغيان معها");
  eq(out.remaining, BATCH_SIZE, "والباقي يشمل ما فشل — لا يُشطب لأنه جُرِّب");
  ok(out.problems.length > 0, "والسببُ مذكورٌ لا مطويّ");
  ok(!out.problems[0].includes("undefined"), "ورسالةُ السبب مقروءة");
}

{
  // A row the database refuses. `remaining` must still include it: a screen
  // that counts an attempt as progress reports finished work that never was.
  const seed = rows(3);
  const { client } = fakeSupabase(seed, new Set(["id-1"]));
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider(),
  });

  eq(out.embedded, 2, "الصفّان المكتوبان يُحسبان");
  eq(out.failed, 1, "والمرفوضُ يُحسب فشلاً");
  eq(out.remaining, 1, "ويبقى في الباقي — الضغطةُ التالية تُعيد محاولته");
  ok(
    out.problems.some((p) => p.includes("عنوان 1")),
    "والصفُّ المرفوض مسمّىً بعنوانه لا برقمه",
  );
}

console.log(
  "\n==========================================================================",
);
console.log("D) لا عملَ حين لا عمل · و--force يتجاوز ذلك");
console.log(
  "==========================================================================",
);

{
  const seed = rows(5, { model: MODEL, embedded: true });
  const { client, updates } = fakeSupabase(seed);
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider(),
  });

  eq(out.pending, 0, "قاعدةٌ محسوبةٌ كلُّها ⇐ لا منتظِر");
  eq(updates.length, 0, "ولا كتابةَ واحدة — الضغطةُ الزائدة مجّانية");
  eq(out.remaining, 0, "والزرُّ يُعطَّل بحقّ");
}

{
  const seed = rows(5, { model: MODEL, embedded: true });
  const { client, updates } = fakeSupabase(seed);
  const out = await backfillEmbeddings({
    supabase: client,
    provider: fakeProvider(),
    force: true,
  });

  eq(out.pending, 5, "و--force يعيدها كلَّها");
  eq(updates.length, 5, "ويكتبها كلَّها — وهذا ما يلزم بعد تغيير نصّ التضمين");
}

console.log(
  "\n==========================================================================",
);
if (fail > 0) {
  console.log(`فشل ${fail} فحصاً.`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
