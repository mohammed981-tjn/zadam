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
 *
 * THERE IS ALSO A BUTTON
 *
 * /admin does this without a terminal, for an operator who has a phone and no
 * checkout. Both press the same engine — `src/lib/backfillEmbeddings.ts` — so
 * neither can hold its own opinion about which rows are stale. The difference
 * is only how much work each does at once: this script runs to the end, the
 * button does one batch per press because a serverless request has a wall
 * clock this does not.
 */

import { createClient } from "@supabase/supabase-js";
import { activeProvider } from "../src/lib/embedding";
import {
  backfillEmbeddings,
  isStale,
  type KnowledgeRowForEmbedding,
} from "../src/lib/backfillEmbeddings";

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

  // --dry-run wants the titles, which the engine does not return: it reports
  // counts because that is what a button can show. Listing them is this
  // script's own affair, and it reuses the engine's staleness rule rather than
  // restating it.
  if (dryRun) {
    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("id, crop, topic, title, content, embedding_model, embedding");

    if (error) {
      console.error("Could not read knowledge_entries:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as KnowledgeRowForEmbedding[];
    const pending = force
      ? rows
      : rows.filter((r) => isStale(r, provider.model));

    console.log(`${rows.length} entries, ${pending.length} to embed.`);
    for (const row of pending) {
      console.log(`  would embed: ${row.title} (was ${row.embedding_model ?? "none"})`);
    }
    return;
  }

  const outcome = await backfillEmbeddings({
    supabase,
    provider,
    force,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });

  console.log(`${outcome.scanned} entries, ${outcome.pending} to embed.`);
  if (outcome.pending === 0) {
    console.log("Nothing to do.");
    return;
  }

  for (const problem of outcome.problems) console.error(`  ${problem}`);

  console.log(`\nEmbedded ${outcome.embedded}, failed ${outcome.failed}.`);
  if (outcome.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
