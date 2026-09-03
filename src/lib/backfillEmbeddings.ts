import type { SupabaseClient } from "@supabase/supabase-js";
import { entryEmbeddingText, type EmbeddingProvider } from "./embedding";

/**
 * حساب المتّجهات الناقصة — منطقٌ واحد يناديه الأمرُ الطرفي والزرُّ الإداري.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES
 *
 * The backfill lived only in `scripts/backfill-embeddings.ts`, which asks its
 * operator for a terminal, a checkout, and two secrets pasted onto a command
 * line. The owner of this platform works from a phone. So the same job now has
 * a button in /admin — and a button that re-implemented the staleness rule
 * would be a second opinion about which rows need work, free to disagree with
 * the script's.
 *
 * They cannot disagree now: both call this. The script passes an unbounded
 * `maxBatches`; the button passes one.
 *
 * WHY THE BUTTON IS BOUNDED AND THE SCRIPT IS NOT
 *
 * A serverless request has a wall clock the terminal does not. One provider
 * call plus its updates fits inside it; twenty of them do not, and a request
 * killed halfway leaves no error anyone can read — it simply stops. So the
 * button does one batch per press and reports what is left, which is also the
 * honest thing to show on a phone: a number that goes down.
 *
 * Resuming is free because the work is idempotent: `remaining` is recomputed
 * from the rows themselves, never from a counter someone has to trust.
 */

/** How many entries go into one provider call. Mirrors the script's original. */
export const BATCH_SIZE = 20;

export interface KnowledgeRowForEmbedding {
  id: string;
  crop: string;
  topic: string;
  title: string;
  content: string;
  embedding_model: string | null;
  embedding: unknown;
}

export interface BackfillOutcome {
  /** The provider that ran, written beside every vector it produced. */
  model: string;
  /** Entries in the base. */
  scanned: number;
  /** Entries needing work when this run started. */
  pending: number;
  /** Embedded successfully by this run. */
  embedded: number;
  /** Rows this run tried and could not write. */
  failed: number;
  /** Still needing work after this run — press again while above zero. */
  remaining: number;
  /** One line per failure, for a caller that wants to show why. */
  problems: string[];
}

/**
 * A row is stale when it has no vector at all, or when its vector came from
 * another model. Both are invisible at query time — the first ranks nowhere,
 * and `match_knowledge_entries` filters the second out by `p_model` — so both
 * are refreshed. This rule is the one thing that must never fork, which is why
 * it lives here alone.
 */
export function isStale(
  row: Pick<KnowledgeRowForEmbedding, "embedding" | "embedding_model">,
  model: string,
): boolean {
  return row.embedding === null || row.embedding_model !== model;
}

/**
 * The same rule as a PostgREST filter, so a page can show the count without
 * pulling 768 floats per row across the wire just to see whether they are
 * there. It lives beside `isStale` because the two must always mean the same
 * thing, and a screen that disagrees with the engine about how much work is
 * left is worse than a screen that shows nothing.
 */
export function staleFilter(model: string): string {
  return `embedding.is.null,embedding_model.neq.${model}`;
}

/** How many entries need work right now. Counts rows, transfers none. */
export async function countStale(
  supabase: SupabaseClient,
  model: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("knowledge_entries")
    .select("id", { count: "exact", head: true })
    .or(staleFilter(model));

  // Null, not zero: a failed count is not the same answer as "nothing pending",
  // and rendering it as zero would hide the work behind a disabled button.
  return error ? null : (count ?? null);
}

export async function backfillEmbeddings(opts: {
  supabase: SupabaseClient;
  provider: EmbeddingProvider;
  /** Re-embed everything, not only the stale. */
  force?: boolean;
  /** Cap the provider calls this run makes. Omit for no cap. */
  maxBatches?: number;
  /** Called after each batch, for a terminal that prints progress. */
  onProgress?: (done: number, total: number) => void;
}): Promise<BackfillOutcome> {
  const { supabase, provider, force = false, maxBatches, onProgress } = opts;

  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, crop, topic, title, content, embedding_model, embedding");

  if (error) {
    throw new Error(`could not read knowledge_entries: ${error.message}`);
  }

  const rows = (data ?? []) as KnowledgeRowForEmbedding[];
  const pending = force
    ? rows
    : rows.filter((r) => isStale(r, provider.model));

  const problems: string[] = [];
  let embedded = 0;
  let failed = 0;

  const batches = Math.ceil(pending.length / BATCH_SIZE);
  const limit = maxBatches === undefined ? batches : Math.min(batches, maxBatches);

  for (let b = 0; b < limit; b++) {
    const batch = pending.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

    let vectors: number[][];
    try {
      vectors = await provider.embed(batch.map(entryEmbeddingText), "document");
    } catch (err) {
      // Report and continue: one bad batch should not cost the ones after it,
      // and a partial run is resumable because `remaining` is recomputed.
      problems.push(
        `الدفعة ${b + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed += batch.length;
      continue;
    }

    const results = await Promise.all(
      batch.map((row, j) =>
        supabase
          .from("knowledge_entries")
          .update({
            embedding: JSON.stringify(vectors[j]),
            embedding_model: provider.model,
            embedding_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id),
      ),
    );

    results.forEach((res, j) => {
      if (res.error) {
        problems.push(`${batch[j].title}: ${res.error.message}`);
        failed++;
      } else {
        embedded++;
      }
    });

    onProgress?.(embedded + failed, pending.length);
  }

  return {
    model: provider.model,
    scanned: rows.length,
    pending: pending.length,
    embedded,
    failed,
    // What this run did not reach, plus what it tried and could not write.
    remaining: pending.length - embedded,
    problems,
  };
}
