/**
 * Answering without the model.
 *
 * The assistant used to send every question to Gemini. That made a free-tier
 * quota the single point of failure for the whole feature, and it was wasteful
 * in a way that is easy to miss: most of what a visitor asks, sudagri already
 * knows exactly. The seasonal water demand for a crop is not a matter of
 * opinion — it is FAO-56 arithmetic the platform already runs. Whether there is
 * an investment offer open is not a matter of phrasing — it is a flag and a
 * table. And a question that lands squarely on a curated knowledge entry is
 * best answered with that entry, not with a paraphrase of it.
 *
 * So this module tries three deterministic resolvers before any network call:
 *
 *   1. platform state — offers, shares, payment: answered from the flag and the
 *      project list, never invented;
 *   2. calculator — a crop plus a water question: answered by running the
 *      agronomy engine and reporting real numbers;
 *   3. knowledge base — answered by quoting the matching entries when the match
 *      is strong enough to be sure which entries those are.
 *
 * When none of the three is confident it returns null and the caller falls back
 * to the model. The point is not to replace the model — it is to stop paying it
 * for questions the platform can answer better itself.
 */

import {
  CROPS,
  STATIONS,
  IRRIGATION_LABEL,
  MONTH_NAMES,
  waterRequirement,
  type CropCoefficients,
  type IrrigationMethod,
  type StationClimate,
} from "@/lib/agronomy";
import {
  normalizeArabic,
  questionTerms,
  scoreEntries,
  type RetrievableEntry,
} from "@/lib/retrieval";
import {
  grossRevenue,
  HECTARES_PER_FEDDAN,
  PRICE_BASIS_LABEL,
  type CropMarket,
} from "@/lib/cropBenchmark";

export type AnswerSource = "platform" | "calculator" | "knowledge" | "market";

export interface LocalAnswer {
  answer: string;
  source: AnswerSource;
  /** 0–1. Deterministic resolvers report 1; the knowledge match is graded. */
  confidence: number;
  /** Titles of the knowledge entries used, for logging and for the UI. */
  usedTitles: string[];
}

export interface LocalAnswerInput {
  question: string;
  entries: RetrievableEntry[];
  /** Non-draft projects. An empty list means nothing is on offer. */
  projectCount: number;
  investmentLive: boolean;
  /**
   * Yield and price per crop, from the crop_market view. Absent when the
   * lookup failed — in which case the market resolver stands down rather than
   * answering from memory.
   */
  markets?: Record<string, CropMarket>;
}

/* ------------------------------------------------------------------ *
 * 1. Platform state
 * ------------------------------------------------------------------ */

const INVESTMENT_TERMS = [
  "استثمار",
  "استثمر",
  "استثماريه",
  "اكتتاب",
  "حصه",
  "حصص",
  "سهم",
  "اسهم",
  "مساهمه",
].map(normalizeArabic);
// "تمويل" is deliberately absent: agricultural finance is a knowledge topic in
// its own right, and treating it as a platform-offer question would answer
// "there is nothing on offer" to someone asking how Indian smallholder credit
// works.

/**
 * Answers "can I invest / what is on offer" without the model.
 *
 * Deliberately narrow: it only fires while there is genuinely nothing to
 * describe — investment closed and no published project. In that state the
 * correct answer is one sentence and cannot be got wrong. The moment a real
 * offer exists there is something to summarise, and summarising is the model's
 * job, so this resolver stands down.
 */
function resolvePlatform(input: LocalAnswerInput): LocalAnswer | null {
  if (input.investmentLive || input.projectCount > 0) return null;

  const terms = new Set(questionTerms(input.question));
  if (!INVESTMENT_TERMS.some((t) => terms.has(t))) return null;

  return {
    source: "platform",
    confidence: 1,
    usedTitles: [],
    answer:
      "لا توجد حالياً أي فرصة استثمار مطروحة على منصة سودجري، ولم يُفتح باب المساهمة بعد. " +
      "المنصة في مرحلة التأسيس: نبني أدوات تخطيط الموسم وحساب الري وتوثيق الأرض أولاً، " +
      "ولن تُعرض أي فرصة قبل أن تكون مستنداتها مكتملة ومراجَعة.\n\n" +
      "ما يمكنك فعله الآن: سجّل أرضك إن كنت مزارعاً، أو استخدم حاسبة الاحتياج المائي وخطة الموسم. " +
      "واسألني عن أي محصول أو تقنية زراعية وسأجيبك.",
  };
}

/* ------------------------------------------------------------------ *
 * 2. Water calculator
 * ------------------------------------------------------------------ */

const WATER_TERMS = [
  "ماء",
  "مياه",
  "ري",
  "احتياج",
  "استهلاك",
  "بخر",
  "نتح",
  "مكعب",
  "متر",
  "سقايه",
  "سقي",
].map(normalizeArabic);

/**
 * Words a visitor is likely to use for a crop that are not the crop's name.
 *
 * "دخن" was listed under sorghum, and it is not sorghum — it is millet. That
 * was harmless while millet was not a crop the platform knew, because the
 * nearest cereal beat no answer at all. It stopped being harmless the moment
 * millet arrived with its own FAO-56 coefficients: a question about دخن was
 * then answered with sorghum's water requirement, confidently and wrongly, with
 * nothing on screen to reveal the substitution.
 *
 * Millet and dates joined the crop table and never reached this map. Adding a
 * crop is two edits, and this is the second one.
 */
const CROP_ALIASES: Record<string, string[]> = {
  wheat: ["قمح", "حنطه"],
  sorghum: ["ذره رفيعه", "رفيعه", "فتريته", "طابت"],
  millet: ["دخن"],
  maize: ["ذره شاميه", "شاميه"],
  cotton: ["قطن"],
  groundnut: ["فول سوداني", "سوداني", "فول"],
  sesame: ["سمسم"],
  alfalfa: ["برسيم", "علف"],
  onion: ["بصل"],
  tomato: ["طماطم", "بندوره"],
  sugarcane: ["قصب سكر", "قصب"],
  // "تمر" is deliberately not an alias: it is a substring of "مستمر", so
  // "هل الإنتاج مستمر؟" would be answered as a question about date palms.
  dates: ["تمور", "نخيل", "نخله", "بلح"],
};

/**
 * Nine stations joined the climate table — all five Darfur states, two points
 * on the Blue Nile, Sennar and the White Nile — and none could be named in a
 * question until now, so a visitor in Nyala asking about their own area was
 * silently answered for Khartoum.
 *
 * Gedaref still points at Kassala on purpose. It has no station of its own
 * because the reanalysis diurnal range there runs at about half the observed
 * figure, and Kassala is the nearest place with numbers worth quoting.
 */
const STATION_ALIASES: Record<string, string[]> = {
  khartoum: ["الخرطوم", "خرطوم", "بحري", "امدرمان", "ام درمان"],
  gezira: ["الجزيره", "جزيره", "ود مدني", "مدني"],
  rivernile: ["نهر النيل", "عطبره", "شندي", "الدامر"],
  northern: ["الشماليه", "دنقلا", "الشمال", "مروي"],
  kordofan: ["كردفان", "الابيض", "بارا"],
  kassala: ["كسلا", "القضارف", "جدارف", "الفاو", "حلفا الجديده"],
  nyala: ["نيالا", "جنوب دارفور"],
  elfasher: ["الفاشر", "شمال دارفور"],
  geneina: ["الجنينه", "غرب دارفور"],
  zalingei: ["زالنجي", "وسط دارفور"],
  eddaein: ["الضعين", "شرق دارفور"],
  damazin: ["الدمازين", "النيل الازرق", "الروصيرص"],
  kurmuk: ["الكرمك"],
  kosti: ["كوستي", "النيل الابيض", "ربك"],
  sennar: ["سنار", "سنجه"],
};

const METHOD_ALIASES: [IrrigationMethod, string[]][] = [
  ["drip", ["تنقيط", "بالتنقيط", "نقطي"]],
  ["pivot", ["محوري", "محاور", "ارتكازيه", "بيفوت"]],
  ["sprinkler", ["رش", "بالرش", "رشاش"]],
  ["flood", ["غمر", "بالغمر", "غمري", "سطحي", "انسياب"]],
];

/**
 * Conventional Sudanese sowing month per crop, used only when the visitor does
 * not name one. The answer always says which month it assumed, because the
 * planting date moves the seasonal total substantially.
 */
const DEFAULT_PLANTING_MONTH: Record<string, number> = {
  wheat: 10, // نوفمبر
  sorghum: 6, // يوليو
  millet: 5, // يونيو — FAO-56 Table 11 names June for millet
  maize: 6,
  cotton: 7, // أغسطس
  groundnut: 6,
  sesame: 6,
  alfalfa: 10,
  onion: 10,
  tomato: 9, // أكتوبر
  sugarcane: 2, // مارس
  // A date palm has no planting month; the cycle is the calendar year, and the
  // near-flat Kc curve means the starting point barely moves the total.
  dates: 0,
};

/** Substring match on the normalised question — aliases are multi-word. */
function findByAlias<T extends { key: string }>(
  haystack: string,
  items: T[],
  aliases: Record<string, string[]>,
): T | null {
  let best: T | null = null;
  let bestLength = 0;

  for (const item of items) {
    for (const alias of aliases[item.key] ?? []) {
      const needle = normalizeArabic(alias);
      // Longest alias wins, so "ذره شاميه" beats the "ذره" inside it.
      if (haystack.includes(needle) && needle.length > bestLength) {
        best = item;
        bestLength = needle.length;
      }
    }
  }

  return best;
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Answers a crop-water question by running the same FAO-56 engine the water
 * calculator page runs. No model involved, and the numbers are exact rather
 * than recalled.
 */
function resolveCalculator(input: LocalAnswerInput): LocalAnswer | null {
  const normalized = normalizeArabic(input.question);
  const terms = new Set(questionTerms(input.question));

  if (!WATER_TERMS.some((t) => terms.has(t) || normalized.includes(t))) {
    return null;
  }

  const crop = findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES);
  if (!crop) return null;

  const namedStation = findByAlias<StationClimate>(
    normalized,
    STATIONS,
    STATION_ALIASES,
  );
  const station = namedStation ?? STATIONS[0];

  let namedMethod: IrrigationMethod | null = null;
  for (const [method, aliases] of METHOD_ALIASES) {
    if (aliases.some((a) => normalized.includes(normalizeArabic(a)))) {
      namedMethod = method;
      break;
    }
  }
  const method = namedMethod ?? "flood";

  let namedMonth = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (normalized.includes(normalizeArabic(MONTH_NAMES[i]))) {
      namedMonth = i;
      break;
    }
  }
  const plantingMonth =
    namedMonth >= 0 ? namedMonth : (DEFAULT_PLANTING_MONTH[crop.key] ?? 6);

  const result = waterRequirement(crop, station, plantingMonth, method);
  const peakMonth = MONTH_NAMES[result.peakMonthIndex];

  // Everything the caller did not state is stated back, so no number in the
  // answer rests on a silent assumption.
  const assumed: string[] = [];
  if (!namedStation) assumed.push(`الموقع: ${station.name}`);
  if (!namedMethod) assumed.push(`طريقة الري: ${IRRIGATION_LABEL[method]}`);
  if (namedMonth < 0) assumed.push(`شهر الزراعة: ${MONTH_NAMES[plantingMonth]}`);

  const lines = [
    `الاحتياج المائي لـ${crop.name} في ${station.name} بـ${IRRIGATION_LABEL[method]}، زراعة ${MONTH_NAMES[plantingMonth]}:`,
    "",
    `طول الموسم: ${result.seasonDays} يوماً.`,
    `الاستهلاك المائي للمحصول: ${formatNumber(result.totalEtc)} مم.`,
    `الأمطار الفعّالة خلال الموسم: ${formatNumber(result.totalEffectiveRain)} مم.`,
    `صافي الري المطلوب: ${formatNumber(result.totalNet)} مم.`,
    `إجمالي الري بعد احتساب كفاءة الطريقة: ${formatNumber(result.totalGross)} مم، أي ${formatNumber(result.m3PerFeddan)} متر مكعب للفدان في الموسم.`,
    `أعلى شهر طلباً: ${peakMonth}، بمعدل ${formatNumber(result.peakM3PerFeddanPerDay, 1)} متر مكعب للفدان يومياً — وهذا الرقم هو الذي تُحسب عليه الطلمبة، لا المتوسط.`,
  ];

  if (assumed.length > 0) {
    lines.push(
      "",
      `افترضتُ ما لم تذكره: ${assumed.join("، ")}. اذكرها في سؤالك وسأعيد الحساب عليها.`,
    );
  }

  lines.push(
    "",
    "الحساب بمنهجية FAO-56 على متوسطات مناخية استرشادية للمنطقة، وليست قراءات محطة مقيسة لأرضك. عاملها كتقدير تخطيطي.",
  );

  return {
    source: "calculator",
    confidence: 1,
    usedTitles: [],
    answer: lines.join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * 3. Knowledge base
 * ------------------------------------------------------------------ */

/** Below this the top match is weak enough that quoting it would mislead. */
const KB_MIN_SCORE = 5;
/** Share of the question's meaningful terms the top entry must contain. */
const KB_MIN_COVERAGE = 0.5;
/** Score at which a match counts as fully strong; above this adds nothing. */
const KB_SATURATION = 14;
const KB_MIN_CONFIDENCE = 0.6;
/** A runner-up scoring at least this share of the top is quoted alongside it. */
const KB_SUPPORT_RATIO = 0.6;
/**
 * Minimum words the quoted material must add up to before it can stand as a
 * whole answer. Every one of the 58 entries written so far runs 54 words or
 * more, so this rejects nothing in the base today — it exists so that a stub
 * entry added later cannot become a one-line reply to a real question. Below
 * the floor the question goes to the model, which is the pre-existing
 * behaviour.
 */
const KB_MIN_WORDS = 25;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function attribution(entry: RetrievableEntry): string {
  const parts: string[] = [];
  if (entry.source_country) parts.push(`المرجع: ${entry.source_country}`);
  if (entry.source_note) parts.push(entry.source_note);
  return parts.join(" — ");
}

function resolveKnowledge(input: LocalAnswerInput): LocalAnswer | null {
  const terms = questionTerms(input.question);
  if (terms.length === 0) return null;

  const ranked = scoreEntries(input.question, input.entries).filter(
    (s) => s.score > 0,
  );
  if (ranked.length === 0) return null;

  const top = ranked[0];
  const coverage = top.matched.length / terms.length;
  const strength = Math.min(1, top.score / KB_SATURATION);
  const confidence = 0.5 * strength + 0.5 * coverage;

  if (
    top.score < KB_MIN_SCORE ||
    coverage < KB_MIN_COVERAGE ||
    confidence < KB_MIN_CONFIDENCE
  ) {
    return null;
  }

  const supporting = ranked
    .slice(1)
    .filter((s) => s.score >= top.score * KB_SUPPORT_RATIO)
    .slice(0, 2);

  const quoted = [top, ...supporting];
  const words = quoted.reduce((sum, s) => sum + wordCount(s.entry.content), 0);
  if (words < KB_MIN_WORDS) return null;

  const blocks = quoted.map((s) => {
    const credit = attribution(s.entry);
    return `${s.entry.title}\n${s.entry.content}${credit ? `\n(${credit})` : ""}`;
  });

  const related = ranked
    .slice(1 + supporting.length, 4 + supporting.length)
    .filter((s) => s.score >= top.score * 0.25)
    .map((s) => s.entry.title);

  const lines = ["من قاعدة معرفة سودجري:", "", blocks.join("\n\n")];

  if (related.length > 0) {
    lines.push("", `مواضيع قريبة في القاعدة: ${related.join("، ")}.`);
  }

  return {
    source: "knowledge",
    confidence,
    usedTitles: [top, ...supporting].map((s) => s.entry.title),
    answer: lines.join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Tries to answer from the platform's own data and engines.
 *
 * Returns null when none of the resolvers is confident, which is the signal to
 * fall back to the language model.
 */
/**
 * What to say when the model is unreachable and no resolver was confident.
 *
 * This is the degraded path, not the normal one: it drops the confidence
 * threshold and shows the closest entries anyway, labelled as approximate. A
 * visitor who asked about onion storage during a quota outage is better served
 * by the three nearest entries under an honest heading than by an error.
 *
 * Returns null when nothing matched at all, because a list of unrelated entries
 * is worse than admitting the base does not cover the question.
 */
export function bestEffortAnswer(
  question: string,
  entries: RetrievableEntry[],
  /**
   * The fused lexical+semantic ranking, when the caller has one.
   *
   * Without it this falls back to lexical scoring, and lexical scoring is
   * exactly what fails on the questions that reach this path: a visitor asking
   * why water "dries fast in the sand" got an entry about stabilising desert
   * dunes, because it shares the word "sand", while the entry on irrigating
   * sandy soils — which answers them — shares no term at all and sat unranked.
   */
  ranked?: RetrievableEntry[],
): LocalAnswer | null {
  const top = (ranked && ranked.length > 0
    ? ranked
    : scoreEntries(question, entries)
        .filter((s) => s.score > 0)
        .map((s) => s.entry)
  ).slice(0, 3);

  if (top.length === 0) return null;

  const blocks = top.map((entry) => {
    const credit = attribution(entry);
    return `${entry.title}\n${entry.content}${credit ? `\n(${credit})` : ""}`;
  });

  return {
    source: "knowledge",
    confidence: 0,
    usedTitles: top.map((e) => e.title),
    answer: [
      "لم أستطع الوصول لمحرك المعرفة العامة الآن، وهذه أقرب المواد في قاعدة سودجري لسؤالك — قد لا تجيبه مباشرة:",
      "",
      blocks.join("\n\n"),
      "",
      "أعد سؤالك بعد قليل للحصول على إجابة أشمل.",
    ].join("\n"),
  };
}

/** A knowledge match this strong outranks the platform notice. */
const KB_OVERRIDE_CONFIDENCE = 0.8;

/* ------------------------------------------------------------------ *
 * 4. Market — yield and price, straight from the table
 * ------------------------------------------------------------------ */

const YIELD_TERMS = [
  "غله",
  "غلة",
  "انتاجيه",
  "انتاجية",
  "الانتاجيه",
  "كم ينتج",
  "كم تنتج",
  "طن للهكتار",
  "كجم للهكتار",
  "متوسط الانتاج",
].map(normalizeArabic);

/*
 * Written without the definite article on purpose. The first draft listed
 * "العائد" and "المردود", and "ما عائد فدان البصل؟" matched neither — the
 * article is part of the term only when the visitor happens to use it, and
 * "العائد" contains "عائد" while the reverse is false.
 *
 * "دخل" is deliberately absent despite being the obvious word for income: it
 * is a substring of "دخلت" and "تدخل" and "مدخل", and the resolver would fire
 * on "هل دخلت الطماطم السوق؟". "عائد" and "سعر" and "ربح" already cover the
 * question without reaching for it.
 */
const PRICE_TERMS = [
  "سعر",
  "بكم",
  "اسعار",
  "قيمه الطن",
  "يبيع",
  "بيع",
  "عائد",
  "مردود",
  "ايراد",
  "مربح",
  "ربح",
].map(normalizeArabic);

/**
 * Answers "what does this crop yield, and what does it fetch" from the loaded
 * FAOSTAT reference rather than from prose about it.
 *
 * Worth having as a deterministic resolver rather than prompt context for the
 * same reason the water calculator is: these are measured numbers, and a model
 * paraphrasing them can only make them worse. It also means the question is
 * still answered when every generation engine is down.
 *
 * The revenue line is the one that changes minds. A visitor asking about
 * sorghum is usually surprised that the national yield and the export price
 * multiply out to under a hundred dollars a feddan, and that single figure
 * reframes the rest of the conversation more than any paragraph.
 */
function resolveMarket(input: LocalAnswerInput): LocalAnswer | null {
  if (!input.markets) return null;

  const normalized = normalizeArabic(input.question);
  const wantsYield = YIELD_TERMS.some((t) => normalized.includes(t));
  const wantsPrice = PRICE_TERMS.some((t) => normalized.includes(t));
  if (!wantsYield && !wantsPrice) return null;

  const crop = findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES);
  if (!crop) return null;

  const market = input.markets[crop.key];
  if (!market) return null;
  if (market.sudanKgPerHa === null && market.usdPerTonne === null) return null;

  const lines: string[] = [];

  if (market.sudanKgPerHa !== null) {
    lines.push(
      `غلّة ${crop.name} في السودان: **${formatNumber(market.sudanKgPerHa)} كجم/هكتار**` +
        (market.year ? ` (FAOSTAT ${market.year})` : ""),
    );
    const peer = market.nearestPeerKgPerHa;
    if (peer !== null) {
      lines.push(
        `للمقارنة — مصر: ${formatNumber(peer)} كجم/هكتار` +
          (market.peerMedianKgPerHa !== null
            ? `، ووسيط الدول القاحلة النظيرة: ${formatNumber(market.peerMedianKgPerHa)}`
            : ""),
      );
    }
  }

  if (market.usdPerTonne !== null) {
    lines.push(
      `السعر المعتمد: **${formatNumber(market.usdPerTonne)} دولاراً للطن** — ${PRICE_BASIS_LABEL[market.priceBasis]}.`,
    );
  }

  // One feddan, so the figure is comparable with the cost of working one.
  const perFeddan = grossRevenue(market.sudanKgPerHa, 1, market.usdPerTonne);
  if (perFeddan !== null) {
    lines.push(
      `أي أن الفدان يعطي بالمتوسط الوطني نحو **${formatNumber(perFeddan)} دولاراً** إجمالاً قبل خصم أي تكلفة ` +
        `(${formatNumber(market.sudanKgPerHa! * HECTARES_PER_FEDDAN)} كجم للفدان).`,
    );
    lines.push(
      "قارِنه بتكلفة عملياتك في «دراسة الجدوى المرحلية» لتعرف عند أي مرحلة يتوقّف الاسترداد.",
    );
  }

  if (market.sudanKgPerHa === null) {
    lines.push("ولا تُنشر غلّة لهذا المحصول في السودان ضمن البيانات المحمَّلة.");
  }

  return {
    answer: lines.join("\n"),
    source: "market",
    confidence: 1,
    usedTitles: [],
  };
}

export function answerLocally(input: LocalAnswerInput): LocalAnswer | null {
  // The calculator goes first: when a question names a crop and asks about
  // water, computed numbers beat any prose about it.
  const calculated = resolveCalculator(input);
  if (calculated) return calculated;

  // Then the market, for the same reason: a measured yield and a realised
  // export price are facts, and the table holding them is right here.
  const market = resolveMarket(input);
  if (market) return market;

  // A question landing squarely on a curated entry is a knowledge question even
  // when it contains the word "استثمار" — answering "nothing is on offer" to
  // someone asking how investment in cotton works would be a non sequitur.
  const knowledge = resolveKnowledge(input);
  if (knowledge && knowledge.confidence >= KB_OVERRIDE_CONFIDENCE) {
    return knowledge;
  }

  return resolvePlatform(input) ?? knowledge;
}
