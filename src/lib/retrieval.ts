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

/**
 * Sudanese colloquial, mapped onto the vocabulary the knowledge base is written
 * in.
 *
 * This is not a nicety. The assistant's own question log says that of the first
 * twenty-three questions real visitors asked, nine used the word "الواطة" — the
 * Sudanese word for the ground you farm, and therefore the subject of most of
 * this platform — and not one of them matched a single entry. The base says
 * "أرض" and "تربة"; the visitor says "واطة"; the ranker compares spellings and
 * sees nothing in common. A third of everything asked fell straight through.
 *
 * Applied to entries as well as questions, so the mapping is symmetric: an
 * entry written in formal Arabic and a question asked in dialect meet at the
 * same token.
 *
 * "أرض" and "تربة" are deliberately collapsed together. They are distinct words
 * and in a soil-science text the distinction would matter; here it does not —
 * both name the ground, they are spread across fifty and forty-one entries
 * respectively, and keeping them apart means a question phrased with one word
 * cannot reach half the base.
 */
const DIALECT: Record<string, string> = Object.fromEntries(
  Object.entries({
  // الأرض والتربة
  واطه: "ارض",
  واطا: "ارض",
  // Observed twice in the log as a phone autocorrect of "واطة". Nothing in the
  // base is about intermediaries, so the mapping costs nothing and recovers a
  // question that would otherwise be lost.
  واسطه: "ارض",
  تربه: "ارض",
  تراب: "ارض",
  اراضي: "ارض",
  ارضي: "ارض",

  // الماء
  مويه: "ماء",
  مويا: "ماء",
  موية: "ماء",
  مياه: "ماء",
  // Listed with the article still attached because the stemmer refuses to strip
  // one when fewer than three letters would survive — "المي" would become "مي"
  // and is left alone instead, so the bare stem never appears.
  المي: "ماء",
  الميه: "ماء",
  الموية: "ماء",

  // العطش والجفاف
  عطشان: "جفاف",
  عطشانه: "جفاف",
  عطش: "جفاف",
  تنشف: "جفاف",
  ينشف: "جفاف",
  نشف: "جفاف",
  ناشف: "جفاف",
  ناشفه: "جفاف",

  // الخصوبة
  رويان: "خصوبه",
  رويانه: "خصوبه",
  مرويه: "خصوبه",

  // الرمل
  رمله: "رمل",
  رمليه: "رمل",
  رملي: "رمل",
  رمال: "رمل",

  // الطين
  طينه: "طين",
  طيني: "طين",
  طينيه: "طين",

  // محاصيل بأسمائها المحلية
  منقه: "مانجو",
  منقا: "مانجو",
  مانجا: "مانجو",
  كركدي: "كركديه",
  // «كيفية انشاء مزرعة لاحم» — سُئل ولم يُجب، والقاعدةُ فيها مشروعُ دواجن
  // كاملٌ بالأرقام. «لاحم» هو الدجاج اللاحم، واسمُه في القاعدة «دواجن».
  // والمُجذِّعُ ينزع اللامَ الأولى على أنّها حرفُ جرّ، فيصل «لاحم» إلى
  // المفتاح بصورة «احم» — فهي المسجَّلة، والأصلُ معها لما لا يُجذَّع.
  احم: "دواجن",
  لاحم: "دواجن",
  فراخ: "دواجن",
  // Keys are normalised at build time rather than by hand, so an entry written
  // with a taa marbuta or a hamza still matches the token the tokeniser
  // actually produces.
  }).map(([dialect, standard]) => [
    normalizeArabic(dialect),
    normalizeArabic(standard),
  ]),
);

/**
 * A token as both sides of the comparison should see it: clitics stripped, then
 * dialect folded onto the base's vocabulary.
 *
 * Everything that tokenises goes through this, questions and entries alike.
 * Applying it to one side only would be worse than not applying it at all — the
 * two vocabularies would meet in the middle and match nothing.
 */
function canonical(token: string): string {
  const stemmed = stem(token);
  return DIALECT[stemmed] ?? stemmed;
}

/** Words too common in Arabic questions to carry any signal. */
const STOP_WORDS = new Set(
  [
    // عامية سودانية: أدوات استفهام وحشو، لا تحمل إشارة أكثر من نظائرها الفصيحة
    "شنو",
    "دحين",
    "وين",
    "ياتو",
    "كدي",
    "زول",
    "زاتو",
    "بس",
    "عشان",
    "علشان",
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
  return [...new Set(tokenize(question).map(canonical))];
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
    title: new Set(tokenize(e.title).map(canonical)),
    crop: new Set(tokenize(e.crop).map(canonical)),
    topic: new Set(tokenize(e.topic).map(canonical)),
    content: tokenize(e.content).map(canonical),
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

/* ------------------------------------------------------------------ *
 * Fusing the lexical ranking with a semantic one
 * ------------------------------------------------------------------ */

/** A knowledge entry as the semantic search returns it, best first. */
export interface SemanticMatch extends RetrievableEntry {
  /** Cosine similarity to the question, 0–1. */
  similarity: number;
}

/**
 * Two entries are the same entry when their title and crop agree. The semantic
 * results come from the same table as the lexical ones, so this only has to be
 * stable, not globally unique.
 */
function entryKey(entry: RetrievableEntry): string {
  return `${entry.title} ${entry.crop}`;
}

/**
 * Standard reciprocal-rank-fusion constant. It damps the top of each list so
 * that rank 1 is not overwhelmingly ahead of rank 2, which is what lets an entry
 * ranked moderately well by *both* rankers beat one ranked first by only one.
 */
const RRF_K = 60;

/**
 * Merges the lexical and semantic rankings into one.
 *
 * Fusion is by rank, not by score, and that is the whole point: a BM25 score and
 * a cosine similarity live on incomparable scales, and any attempt to blend them
 * numerically needs a weight that has to be re-tuned every time either side
 * changes. Ranks are unitless. An entry both rankers place near the top wins,
 * an entry only one of them likes still gets through, and neither ranker's scale
 * leaks into the result.
 *
 * The asymmetry worth knowing: the lexical ranker sees every entry, while the
 * semantic one sees only the top few the database returned. An entry absent from
 * the semantic list is therefore not penalised — it simply scores from its
 * lexical rank alone.
 */
export function fuseRankings(
  question: string,
  entries: RetrievableEntry[],
  semantic: SemanticMatch[],
  limit = 12,
): RetrievableEntry[] {
  // With no semantic side there is nothing to fuse; fall through to the lexical
  // path so a failed embedding call costs ranking quality, not the answer.
  if (semantic.length === 0) return retrieveRelevant(question, entries, limit);

  const fused = new Map<
    string,
    { entry: RetrievableEntry; score: number; lexical: boolean }
  >();

  const lexical = scoreEntries(question, entries).filter((s) => s.score > 0);
  lexical.forEach((scored, rank) => {
    fused.set(entryKey(scored.entry), {
      entry: scored.entry,
      score: 1 / (RRF_K + rank + 1),
      lexical: true,
    });
  });

  semantic.forEach((match, rank) => {
    const key = entryKey(match);
    const existing = fused.get(key);
    const contribution = 1 / (RRF_K + rank + 1);

    if (existing) {
      existing.score += contribution;
    } else {
      // Present only in the semantic list — this is precisely the entry the
      // lexical ranker missed, and the reason embeddings were added.
      fused.set(key, { entry: match, score: contribution, lexical: false });
    }
  });

  const ranked = [...fused.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return entries.slice(0, Math.min(limit, 6));

  return ranked.slice(0, limit).map((r) => r.entry);
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
