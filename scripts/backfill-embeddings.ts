/**
 * Writes the embedding for every knowledge entry that does not have a current
 * one.
 *
 * Run it after adding entries, and after changing embedding provider. An entry
 * with no embedding is not broken — it stays reachable by lexical search — but
 * it is invisible to the semantic half of retrieval, which is the half that
 * finds it when the visitor does not use its vocabulary.
 *
 *   JINA_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-embeddings.ts [--force] [--dry-run]
 *
 * Which provider runs is decided the same way the assistant decides: Jina if
 * its key is present, otherwise Gemini. Whichever it is, its name is written
 * beside every vector, and rows carrying a different name are treated as stale
 * — so switching provider is this script plus a wait, not a migration.
 *
 * --force re-embeds everything, which is what a change to EMBEDDING_DIMENSIONS
 * or entryEmbeddingText() requires: vectors built from different text are not
 * comparable, and mixing them degrades every ranking rather than failing.
 */

import { createClient } from "@supabase/supabase-js";
import { activeProvider, entryEmbeddingText } from "../src/lib/embedding";

interface Row {
  id: string;
  crop: string;
  topic: string;
  title: string;
  content: string;
  embedding_model: string | null;
  embedding: unknown;
}

/**
 * Small enough that one failure re-costs little, large enough that a base this
 * size takes a handful of round trips rather than a hundred.
 */
const BATCH_SIZE = 20;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    console.error(
      "The service role key is needed because knowledge_entries is admin-write;" +
        " copy it from Supabase > Project Settings > API.",
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const provider = activeProvider();
  if (!provider) {
    console.error("No embedding provider configured.");
    console.error("Set JINA_API_KEY (jina.ai/embeddings) or GEMINI_API_KEY.");
    process.exit(1);
  }

  console.log(`Provider: ${provider.model}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, crop, topic, title, content, embedding_model, embedding");

  if (error) {
    console.error("Could not read knowledge_entries:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];

  // A row is stale when it has no vector at all, or when the vector came from
  // another model. Both are invisible at query time — the first ranks nowhere,
  // the second is filtered out by match_knowledge_entries — so both are
  // refreshed.
  const pending = force
    ? rows
    : rows.filter(
        (r) => r.embedding === null || r.embedding_model !== provider.model,
      );

  console.log(`${rows.length} entries, ${pending.length} to embed.`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (dryRun) {
    for (const row of pending) {
      console.log(`  would embed: ${row.title} (was ${row.embedding_model ?? "none"})`);
    }
    return;
  }

  let done = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    let vectors: number[][];
    try {
      vectors = await provider.embed(
        batch.map(entryEmbeddingText),
        "document",
      );
    } catch (err) {
      // Report and continue: one bad batch should not cost the ones after it,
      // and a partial backfill is resumable by re-running.
      console.error(
        `  batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        err instanceof Error ? err.message : err,
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
        console.error(`  ${batch[j].title}: ${res.error.message}`);
        failed++;
      } else {
        done++;
      }
    });

    console.log(`  ${done + failed}/${pending.length}`);
  }

  console.log(`\nEmbedded ${done}, failed ${failed}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
