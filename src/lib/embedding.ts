/**
 * Embeddings for the assistant's retrieval.
 *
 * The lexical retriever ranks entries by the words they share with the
 * question. That is exact when the visitor uses an entry's vocabulary and blind
 * when they do not, which is what the dialect layer in retrieval.ts and these
 * embeddings each attack from a different side.
 *
 * ── Why there is a provider abstraction here ──────────────────────────────
 *
 * This file used to call Gemini directly. Then Google denied the project access
 * — 403 PERMISSION_DENIED, an account-level block that no new key can fix — and
 * the semantic half of retrieval died with it. The fault was never Gemini's
 * quality; it was that Gemini was the only option, so one provider's decision
 * took the feature out.
 *
 * So a provider is a choice, made by which key is present, and the vectors it
 * produces are stored with its name beside them. Adding a third — or moving to
 * a self-hosted BGE-M3 with no provider at all — is a function and an env var,
 * not a rewrite.
 *
 * ── What is actually owned ────────────────────────────────────────────────
 *
 * The vectors, in the platform's own database. The ranking, the fusion, the
 * dialect layer, the knowledge base. A provider computes a vector and is then
 * out of the loop; nothing about retrieval depends on it staying reachable
 * except the ability to embed *new* questions.
 */

/**
 * All providers are asked for 768 dimensions, so the `vector(768)` column and
 * its HNSW index survive a provider change untouched. Both models here support
 * Matryoshka truncation to this length, which is the reason it is possible.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Asymmetric retrieval: a question and the passage answering it are not the
 * same kind of text, and both providers are trained to place them in the same
 * region only when told which is which. Embedding both as a passage measurably
 * degrades the match.
 */
export type EmbeddingKind = "query" | "document";

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export interface EmbeddingProvider {
  /**
   * Written into knowledge_entries.embedding_model beside every vector.
   *
   * Vectors from different models are not comparable — the cosine between a
   * Gemini vector and a Jina one is noise that looks like a score. The name is
   * what lets a query refuse to compare against rows it has no business
   * comparing against, and what tells the backfill which rows are stale.
   */
  readonly model: string;
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

/**
 * Truncated Matryoshka vectors come back unnormalised — Gemini's 768-prefix
 * measured an L2 norm of 0.59, not 1. Cosine distance still works on
 * unnormalised input, but every similarity threshold would be scaled by an
 * arbitrary per-vector constant. Normalising once here makes `1 - (a <=> b)` a
 * true cosine and keeps rows comparable with each other.
 */
function normalise(values: number[]): number[] {
  let sumOfSquares = 0;
  for (const v of values) sumOfSquares += v * v;

  const norm = Math.sqrt(sumOfSquares);
  // A zero vector cannot be normalised; returning it unchanged keeps the caller
  // from producing NaNs that poison every comparison downstream.
  if (norm === 0) return values;

  return values.map((v) => v / norm);
}

function checkShape(values: unknown, index: number): number[] {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      `vector ${index} has the wrong shape (expected ${EMBEDDING_DIMENSIONS})`,
    );
  }
  return normalise(values as number[]);
}

/* ------------------------------------------------------------------ *
 * Jina
 * ------------------------------------------------------------------ */

/**
 * Jina ships new embedding models faster than this file changes, and their
 * dashboard already defaults to a newer one than this. Pinning the name here
 * and overriding it by env means a model retirement is a variable, not a
 * deploy — the same lesson OPENROUTER_MODELS exists for.
 *
 * v3 is the default because its request shape is the plain one: `input` is an
 * array of strings. The omni models are multimodal and take `[{text: "..."}]`
 * instead, so switching to one is not only a name change.
 */
const DEFAULT_JINA_MODEL = "jina-embeddings-v3";

/**
 * Jina's free allowance is generous enough that this base's whole backfill is a
 * rounding error against it, and the same key covers their reranker — which is
 * the next thing this retrieval needs. It leads because it is reachable where
 * Google's API is not.
 */
function jinaProvider(apiKey: string, model: string): EmbeddingProvider {
  return {
    model,
    async embed(texts, kind) {
      const res = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          task: kind === "query" ? "retrieval.query" : "retrieval.passage",
          dimensions: EMBEDDING_DIMENSIONS,
          // Jina normalises server-side when asked, which makes the client-side
          // pass below a no-op rather than a correction. Both stay: a provider
          // that quietly stops honouring the flag would otherwise skew every
          // stored vector by its own constant, silently.
          normalized: true,
          input: texts,
        }),
        signal: AbortSignal.timeout(kind === "query" ? 6000 : 60000),
      });

      if (!res.ok) {
        throw new EmbeddingError(
          `jina embed failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
          res.status,
        );
      }

      const body = await res.json();
      const rows: { index?: number; embedding?: number[] }[] = body?.data ?? [];

      if (rows.length !== texts.length) {
        throw new EmbeddingError(
          `jina returned ${rows.length} vectors for ${texts.length} inputs`,
        );
      }

      // The response carries an explicit index. Trusting array order instead
      // would silently attach the wrong vector to the wrong entry if the API
      // ever reordered — a corruption that produces no error, only bad answers.
      const ordered = [...rows].sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0),
      );
      return ordered.map((r, i) => checkShape(r.embedding, i));
    },
  };
}

/* ------------------------------------------------------------------ *
 * Gemini
 * ------------------------------------------------------------------ */

const GEMINI_MODEL = "gemini-embedding-001";

function geminiProvider(apiKey: string): EmbeddingProvider {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

  return {
    model: GEMINI_MODEL,
    async embed(texts, kind) {
      const taskType =
        kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

      const request = (text: string) => ({
        model: `models/${GEMINI_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      });

      // One text goes through the single endpoint; the batch endpoint exists
      // for the backfill and is pointless for a single question.
      if (texts.length === 1) {
        const res = await fetch(`${endpoint}:embedContent?key=${apiKey}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request(texts[0])),
          signal: AbortSignal.timeout(kind === "query" ? 6000 : 60000),
        });

        if (!res.ok) {
          throw new EmbeddingError(
            `gemini embed failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
            res.status,
          );
        }

        const data = await res.json();
        return [checkShape(data?.embedding?.values, 0)];
      }

      const res = await fetch(`${endpoint}:batchEmbedContents?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requests: texts.map(request) }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        throw new EmbeddingError(
          `gemini batch embed failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
          res.status,
        );
      }

      const data = await res.json();
      const rows: { values?: number[] }[] = data?.embeddings ?? [];

      if (rows.length !== texts.length) {
        throw new EmbeddingError(
          `gemini returned ${rows.length} vectors for ${texts.length} inputs`,
        );
      }

      return rows.map((r, i) => checkShape(r.values, i));
    },
  };
}

/* ------------------------------------------------------------------ *
 * Choosing one
 * ------------------------------------------------------------------ */

export interface EmbeddingEnv {
  jinaKey?: string;
  /** Overrides the pinned Jina model when their catalogue moves on. */
  jinaModel?: string;
  geminiKey?: string;
}

/**
 * The provider in use, or null when none is configured.
 *
 * Jina leads because it is reachable from more places than Google's API is —
 * which, after an account-level block took the feature out entirely, is worth
 * more than any benchmark difference between the two.
 *
 * Returning null is a normal state, not an error: retrieval falls back to
 * lexical ranking, which is exactly what it does today.
 */
export function embeddingProvider(
  env: EmbeddingEnv,
): EmbeddingProvider | null {
  if (env.jinaKey) {
    return jinaProvider(env.jinaKey, env.jinaModel || DEFAULT_JINA_MODEL);
  }
  if (env.geminiKey) return geminiProvider(env.geminiKey);
  return null;
}

/** Reads the environment directly, for callers that have no reason to care. */
export function activeProvider(): EmbeddingProvider | null {
  return embeddingProvider({
    jinaKey: process.env.JINA_API_KEY,
    jinaModel: process.env.JINA_MODEL,
    geminiKey: process.env.GEMINI_API_KEY,
  });
}

/**
 * Embeds one question, returning null rather than throwing.
 *
 * This sits in the path of a visitor waiting for an answer and the pipeline
 * degrades to lexical-only retrieval without it, so a failing or slow embedding
 * service is treated as an absent one. A worse ranking beats a hung request.
 */
export async function embedQuestion(
  provider: EmbeddingProvider,
  question: string,
): Promise<number[] | null> {
  try {
    const [vector] = await provider.embed([question], "query");
    return vector ?? null;
  } catch (err) {
    console.error("embedding: query embed failed", err);
    return null;
  }
}

/**
 * The text an entry is embedded as.
 *
 * Shared by the backfill and anything that re-embeds later, because a stored
 * vector is only comparable with a query if it was built from the same fields
 * in the same order. Title, crop and topic lead: they carry the entry's subject
 * in the fewest words, and these models weight early tokens more heavily.
 */
export function entryEmbeddingText(entry: {
  crop: string;
  topic: string;
  title: string;
  content: string;
}): string {
  return [entry.title, entry.crop, entry.topic, entry.content]
    .filter((part) => part && part.trim().length > 0)
    .join("\n");
}
