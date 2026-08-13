/**
 * Retrieval for the assistant.
 *
 * The assistant used to send the entire knowledge base with every question.
 * That worked at fourteen entries; at forty-seven it costs about 18,000 prompt
 * tokens per question, burns the free quota fast, and buries the two or three
 * entries that actually answer the question among forty-five that do not.
 *
 * This is the retrieval half of retrieval-augmented generation, which was
 * missing: rank the entries against the question and send only the ones worth
 * reading. Ranking is BM25-style term weighting over Arabic-normalised text —
 * no embeddings, no extra service, no per-query cost, and it runs in under a
 * millisecond for a base this size.
 */

export interface RetrievableEntry {
  crop: string;
  topic: string;
  title: string;
  content: string;
  source_country: string | null;
  source_note: string | null;
}

/**
 * Arabic needs normalising before terms can be compared: the same word appears
 * with different alef and yaa forms, with or without diacritics, and often with
 * an attached conjunction or definite article.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, "") // diacritics and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

/** Words too common in Arabic questions to carry any signal. */
const STOP_WORDS = new Set(
  [
    "من",
    "في",
    "على",
    "عن",
    "الي",
    "الى",
    "هل",
    "ما",
    "ماذا",
    "كيف",
    "متي",
    "اين",
    "لماذا",
    "هو",
    "هي",
    "هذا",
    "هذه",
    "ذلك",
    "التي",
    "الذي",
    "و",
    "او",
    "ثم",
    "قد",
    "كان",
    "يكون",
    "مع",
    "كل",
    "بعض",
    "غير",
    "بين",
    "عند",
    "لكن",
    "اريد",
    "افضل",
    "يمكن",
    "يجب",
    "لدي",
    "عندي",
    "انا",
    "نحن",
    "شي",
    "شيء",
  ].map(normalizeArabic),
);

function tokenize(text: string): string[] {
  return normalizeArabic(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Strips the clitics Arabic glues onto the front of words, so that "والقطن"
 * and "بالقطن" both match "قطن". Deliberately conservative — it only trims a
 * prefix when a reasonable stem survives.
 */
function stem(token: string): string {
  for (const prefix of [
    "وال",
    "بال",
    "فال",
    "كال",
    "لل",
    "ال",
    "و",
    "ب",
    "ف",
    "ل",
    "ك",
  ]) {
    if (token.startsWith(prefix) && token.length - prefix.length >= 3) {
      return token.slice(prefix.length);
    }
  }
  return token;
}

const FIELD_WEIGHT = { title: 3, crop: 3, topic: 1.5, content: 1 };

/** Question terms, normalised and stemmed, with duplicates removed. */
export function questionTerms(question: string): string[] {
  return [...new Set(tokenize(question).map(stem))];
}

export interface ScoredEntry {
  entry: RetrievableEntry;
  score: number;
  /** Which of the question's terms this entry actually contains. */
  matched: string[];
}

/**
 * Scores every entry against the question and returns them ranked, best first.
 *
 * Scoring is term frequency damped by a saturation curve, multiplied by inverse
 * document frequency so that a rare word like "بونجرو" counts far more than a
 * common one like "زراعة", and weighted by which field the term appears in.
 *
 * The scores are exposed rather than kept private because the local answerer
 * needs them: deciding whether the base can answer on its own is a question
 * about how strong the top match is and how far ahead of the runner-up it sits,
 * and that judgement is impossible from a bare list of entries.
 */
export function scoreEntries(
  question: string,
  entries: RetrievableEntry[],
): ScoredEntry[] {
  const queryTerms = questionTerms(question);
  if (queryTerms.length === 0 || entries.length === 0) return [];

  // How many entries contain each term, for inverse document frequency.
  const docsWithTerm = new Map<string, number>();
  const perEntryTokens = entries.map((e) => ({
    title: new Set(tokenize(e.title).map(stem)),
    crop: new Set(tokenize(e.crop).map(stem)),
    topic: new Set(tokenize(e.topic).map(stem)),
    content: tokenize(e.content).map(stem),
  }));

  for (const term of queryTerms) {
    let count = 0;
    for (const t of perEntryTokens) {
      if (
        t.title.has(term) ||
        t.crop.has(term) ||
        t.topic.has(term) ||
        t.content.includes(term)
      ) {
        count++;
      }
    }
    docsWithTerm.set(term, count);
  }

  const scored = entries.map((entry, i) => {
    const t = perEntryTokens[i];
    let score = 0;
    const matched: string[] = [];

    for (const term of queryTerms) {
      const inDocs = docsWithTerm.get(term) ?? 0;
      if (inDocs === 0) continue;

      // Rare terms discriminate; a term in every entry tells us nothing.
      const idf = Math.log(1 + entries.length / inDocs);

      let raw = 0;
      if (t.title.has(term)) raw += FIELD_WEIGHT.title;
      if (t.crop.has(term)) raw += FIELD_WEIGHT.crop;
      if (t.topic.has(term)) raw += FIELD_WEIGHT.topic;

      const inContent = t.content.filter((x) => x === term).length;
      // Saturating: the tenth mention adds far less than the second.
      if (inContent > 0) {
        raw += FIELD_WEIGHT.content * ((inContent * 2.2) / (inContent + 1.2));
      }

      if (raw > 0) matched.push(term);
      score += raw * idf;
    }

    return { entry, score, matched };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Ranks entries against a question and returns the strongest ones.
 */
export function retrieveRelevant(
  question: string,
  entries: RetrievableEntry[],
  limit = 12,
): RetrievableEntry[] {
  if (entries.length <= limit) return entries;

  const ranked = scoreEntries(question, entries);
  if (ranked.length === 0) return entries.slice(0, limit);

  const hits = ranked.filter((s) => s.score > 0);

  // If nothing matched, the question is off-topic for the base; send a small
  // sample rather than the whole thing so the model can still say it does not
  // know, at a fraction of the cost.
  if (hits.length === 0) return entries.slice(0, Math.min(limit, 6));

  return hits.slice(0, limit).map((s) => s.entry);
}
