/**
 * Embeddings for the assistant's retrieval.
 *
 * The lexical retriever ranks entries by the words they share with the
 * question. That is exact when the visitor happens to use the vocabulary the
 * entry was written in, and blind when they do not: a farmer who asks
 * "الجروف عطشانة" shares no term with an entry titled "الإجهاد المائي", so the
 * entry that answers them is never sent. Embeddings compare meaning rather than
 * spelling, which is the half the lexical ranker cannot do.
 *
 * They do not replace it. A vector model blurs exactly what the lexical ranker
 * is best at — a cultivar name, a village, "بونجرو" — so both run and their
 * rankings are fused. See fuseRankings() in retrieval.ts.
 */

/**
 * Vectors from different models are not comparable. The name is written next to
 * every stored vector so a model change is detectable rather than silently
 * scoring nonsense against the old rows.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * The model emits 3072 dimensions and supports Matryoshka truncation to shorter
 * prefixes. At 109 entries the extra dimensions buy nothing measurable and cost
 * four times the storage and index, so the column is vector(768). Changing this
 * requires a migration and a full re-embed — the stored vectors carry no
 * dimension tag beyond the column type.
 */
export const EMBEDDING_DIMENSIONS = 768;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}`;

/**
 * Asymmetric retrieval: a question and the passage answering it are not the
 * same kind of text, and the model is trained to place them in the same region
 * only when told which is which. Embedding both as RETRIEVAL_DOCUMENT measurably
 * degrades the match, so the two task types must stay paired with their callers.
 */
type TaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

/**
 * Truncated Matryoshka vectors come back unnormalised — the 768-prefix of a
 * 3072-vector measured an L2 norm of 0.59, not 1. Cosine distance in Postgres
 * still works on unnormalised input, but every similarity threshold and every
 * fused score would be scaled by an arbitrary per-vector constant. Normalising
 * once here makes `1 - (a <=> b)` a true cosine and keeps the stored rows
 * comparable with each other.
 */
function normalise(values: number[]): number[] {
  let sumOfSquares = 0;
  for (const v of values) sumOfSquares += v * v;

  const norm = Math.sqrt(sumOfSquares);
  // A zero vector cannot be normalised; returning it unchanged keeps the caller
  // from producing NaNs that would poison every comparison downstream.
  if (norm === 0) return values;

  return values.map((v) => v / norm);
}

function requestBody(text: string, taskType: TaskType) {
  return {
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  };
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Embeds one question.
 *
 * The timeout is deliberately short. This sits in the path of a visitor waiting
 * for an answer, and the pipeline degrades to lexical-only retrieval when it
 * returns null — a slightly worse ranking is a far better outcome than a request
 * that hangs, so a slow embedding service is treated as an absent one.
 */
export async function embedQuestion(
  question: string,
  apiKey: string,
  timeoutMs = 4000,
): Promise<number[] | null> {
  try {
    const res = await fetch(`${ENDPOINT}:embedContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(question, "RETRIEVAL_QUERY")),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      console.error(
        "embedding: query embed failed",
        res.status,
        (await res.text()).slice(0, 300),
      );
      return null;
    }

    const data = await res.json();
    const values: unknown = data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      console.error("embedding: unexpected query embed shape");
      return null;
    }

    return normalise(values as number[]);
  } catch (err) {
    console.error("embedding: query embed threw", err);
    return null;
  }
}

/**
 * Embeds a batch of passages.
 *
 * Unlike embedQuestion this throws rather than returning null: its only caller
 * is the backfill script, where a silent partial result would leave the base in
 * a state nobody notices — half the entries semantically searchable and half
 * not, with no error to explain why.
 */
export async function embedDocuments(
  texts: string[],
  apiKey: string,
  timeoutMs = 30000,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(`${ENDPOINT}:batchEmbedContents?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((t) => requestBody(t, "RETRIEVAL_DOCUMENT")),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new EmbeddingError(
      `batch embed failed (HTTP ${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }

  const data = await res.json();
  const embeddings: unknown = data?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new EmbeddingError(
      `batch embed returned ${Array.isArray(embeddings) ? embeddings.length : "no"} vectors for ${texts.length} inputs`,
    );
  }

  return embeddings.map((e: { values?: number[] }, i) => {
    if (!Array.isArray(e?.values) || e.values.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(`vector ${i} has the wrong shape`);
    }
    return normalise(e.values);
  });
}

/**
 * The text an entry is embedded as.
 *
 * Shared by the backfill and anything that re-embeds later, because a stored
 * vector is only comparable with a query if it was built from the same fields
 * in the same order. Title, crop and topic lead: they carry the entry's subject
 * in the fewest words, and the model weights early tokens more heavily.
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
