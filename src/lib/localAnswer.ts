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
import { FAOSTAT_ITEM, HECTARES_PER_FEDDAN } from "@/lib/cropBenchmark";
import {
  DEFAULT_CROP,
  SOIL_LABEL,
  TAW_MM_PER_M,
  irrigationInterval,
} from "@/lib/soilWater";

export type AnswerSource =
  | "platform"
  | "calculator"
  | "knowledge"
  /** Answered from a row of arc_canal_facts, quoted with its own status. */
  | "canal"
  /** Answered from FAOSTAT via the crop_market view. */
  | "market"
  /** Measured climate normals read back, not computed from them. */
  | "climate";

export interface LocalAnswer {
  answer: string;
  source: AnswerSource;
  /** 0–1. Deterministic resolvers report 1; the knowledge match is graded. */
  confidence: number;
  /** Titles of the knowledge entries used, for logging and for the UI. */
  usedTitles: string[];
}

/** One row of arc_canal_facts, as the assistant needs it. */
export interface CanalFactRow {
  key: string;
  label: string;
  value: string | null;
  unit: string | null;
  status: string;
  source: string;
  note: string | null;
}

/** One row of the crop_market view. */
export interface MarketRow {
  item: string;
  year: number;
  sudan_kg_ha: number | string | null;
  egypt_kg_ha: number | string | null;
  peer_median_kg_ha: number | string | null;
  sudan_export_usd_per_tonne: number | string | null;
  regional_producer_usd_per_tonne: number | string | null;
}

export interface LocalAnswerInput {
  question: string;
  entries: RetrievableEntry[];
  /** Non-draft projects. An empty list means nothing is on offer. */
  projectCount: number;
  investmentLive: boolean;
  /** Empty when the caller did not load them; the resolver simply stands down. */
  canalFacts?: CanalFactRow[];
  market?: MarketRow[];
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

/*
 * "ماهي المشاريع المتاحة عندكم الان" was asked, and answered with nothing.
 *
 * It is the investment question with the word "استثمار" left out, and while
 * nothing is published it has the same single correct answer. But the plural
 * alone must not trigger it: "اريد معلومات عن مشروع الجموعية" also names a
 * project, and replying "there is nothing on offer" to that is a non sequitur —
 * the visitor is asking about a scheme that exists, not about our catalogue.
 *
 * So it takes both halves: an offer noun AND a word that makes it a question
 * about availability here. A named project carries the first and never the
 * second.
 */
const OFFER_NOUNS = ["مشاريع", "فرص"].map(normalizeArabic);
const AVAILABILITY_WORDS = [
  "متاحه",
  "مطروحه",
  "متوفره",
  "عندكم",
  "لديكم",
  "الان",
].map(normalizeArabic);

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
  const normalized = normalizeArabic(input.question);
  const asksWhatIsOnOffer =
    OFFER_NOUNS.some((t) => normalized.includes(t)) &&
    AVAILABILITY_WORDS.some((t) => normalized.includes(t));

  if (!INVESTMENT_TERMS.some((t) => terms.has(t)) && !asksWhatIsOnOffer) {
    return null;
  }

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
 * A crop missing from this map is not merely unnamed — it is **unreachable**,
 * because findByAlias walks the crop list and looks each key up here. That made
 * the two failures below possible, and it is why `verify-local-answer` now
 * fails the build when any crop or station has no entry.
 */
export const CROP_ALIASES: Record<string, string[]> = {
  wheat: ["قمح", "حنطه"],
  sorghum: ["ذره رفيعه", "رفيعه", "فتريته", "طابت"],
  /*
   * "دخن" used to live on sorghum, and while millet was not a crop this
   * platform knew, that was defensible: the nearest cereal beats no answer.
   *
   * It stopped being defensible the moment millet was added with coefficients
   * of its own. A millet question was then answered with sorghum's water
   * requirement — confidently, and with nothing on screen calling it a
   * substitution beyond the crop name in the header. Adding a crop is two
   * edits; only one of them was made.
   */
  millet: ["دخن", "دخنه"],
  maize: ["ذره شاميه", "شاميه"],
  cotton: ["قطن"],
  groundnut: ["فول سوداني", "سوداني", "فول"],
  sesame: ["سمسم"],
  alfalfa: ["برسيم", "علف"],
  onion: ["بصل"],
  tomato: ["طماطم", "بندوره"],
  sugarcane: ["قصب سكر", "قصب"],
  /*
   * "تمر" is deliberately absent, and this is not fussiness: it sits inside
   * "مستمر", so "هل الدعم مستمر؟" would be read as a question about palms.
   * The plural and the tree carry no such collision.
   */
  dates: ["تمور", "نخيل", "نخل", "بلح"],
};

/**
 * Nine of the fifteen stations could not be named in a question — every Darfur
 * state, both Blue Nile points, White Nile and Sennar. A visitor in Nyala
 * asking about their own area was answered with Khartoum's climate, a thousand
 * kilometres away.
 *
 * The answer does print the station it used, so the substitution was visible to
 * anyone reading closely. It was still the wrong number for the person asking.
 */
export const STATION_ALIASES: Record<string, string[]> = {
  khartoum: ["الخرطوم", "خرطوم", "بحري", "امدرمان", "ام درمان"],
  gezira: ["الجزيره", "جزيره", "ود مدني", "مدني"],
  rivernile: ["نهر النيل", "عطبره", "شندي", "الدامر"],
  northern: ["الشماليه", "دنقلا", "الشمال", "مروي"],
  kordofan: ["كردفان", "الابيض", "بارا"],
  // Gedaref has no station of its own yet, so it borrows Kassala's — the
  // nearest normals the platform holds. Deliberate, and stated in the answer.
  kassala: ["كسلا", "القضارف", "جدارف", "الفاو", "حلفا الجديده"],

  /*
   * Bare "دارفور" is ambiguous across five states, so it is answered with
   * Nyala rather than left to fall through. Falling through does not mean "no
   * answer" — it means Khartoum, which is both wrong and far. Nyala is at
   * least in Darfur, and the answer names it, so the reader sees at once which
   * of the five was assumed.
   */
  nyala: ["نيالا", "جنوب دارفور", "دارفور"],
  elfasher: ["الفاشر", "فاشر", "شمال دارفور"],
  geneina: ["الجنينه", "جنينه", "غرب دارفور"],
  zalingei: ["زالنجي", "وسط دارفور"],
  eddaein: ["الضعين", "ضعين", "شرق دارفور"],
  damazin: ["الدمازين", "دمازين", "النيل الازرق"],
  kurmuk: ["الكرمك", "كرمك"],
  kosti: ["كوستي", "النيل الابيض"],
  sennar: ["سنار", "سنجه", "الدندر"],
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
export const DEFAULT_PLANTING_MONTH: Record<string, number> = {
  wheat: 10, // نوفمبر
  sorghum: 6, // يوليو
  maize: 6,
  cotton: 7, // أغسطس
  groundnut: 6,
  sesame: 6,
  alfalfa: 10,
  onion: 10,
  tomato: 9, // أكتوبر
  sugarcane: 2, // مارس
  // The same omission as the alias map, and it hid behind a `?? 6` fallback.
  // July is in fact right for rain-fed millet, so this line changes no number —
  // it removes a correct answer that was arrived at by accident.
  millet: 6, // يوليو، مع الخريف
  /*
   * A perennial has no planting month. Its four "stages" sum to 365 days and
   * exist only so the same engine can cost a palm, so what this field really
   * chooses is where the year starts — and January is the plain convention.
   * The default of July would have started the palm's year mid-summer for no
   * reason anyone could have explained.
   */
  dates: 0, // يناير — بداية دورة سنوية، لا موعد غرس
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
 * 4. Crop calendar
 * ------------------------------------------------------------------ */

const CALENDAR_TERMS = [
  "متى",
  "امتى",
  "موعد",
  "ميعاد",
  "شهر",
  "ازرع",
  "زراعه",
  "ازرعه",
  "زريعه",
  "موسم",
  "مده",
  "طول",
  "حصاد",
  "اقلع",
].map(normalizeArabic);

const STAGE_NAMES = ["التأسيس", "النمو الخضري", "منتصف الموسم", "النضج والحصاد"];

/**
 * Answers "when do I plant X and how long does it take" from the crop table.
 *
 * The stage lengths are already in the platform — they are what the water
 * engine integrates the Kc curve over — so the calendar is the same data read
 * a different way rather than a second set of numbers that can drift from it.
 *
 * It deliberately does not fire when the question also asks about water: the
 * calculator answers that better and already states the planting month it used.
 */
function resolveCalendar(input: LocalAnswerInput): LocalAnswer | null {
  const normalized = normalizeArabic(input.question);
  const terms = new Set(questionTerms(input.question));

  const asksWater = WATER_TERMS.some(
    (t) => terms.has(t) || normalized.includes(t),
  );
  if (asksWater) return null;

  if (!CALENDAR_TERMS.some((t) => terms.has(t) || normalized.includes(t))) {
    return null;
  }

  const crop = findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES);
  if (!crop) return null;

  const month = DEFAULT_PLANTING_MONTH[crop.key];
  if (month === undefined) return null;

  const seasonDays = crop.stages.reduce((a, b) => a + b, 0);

  // Walking the calendar day by day rather than dividing by 30: harvest in the
  // wrong month is the kind of error a farmer notices and nobody else does.
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = month;
  let left = seasonDays;
  while (left > DAYS[m]) {
    left -= DAYS[m];
    m = (m + 1) % 12;
  }

  const stageLines = crop.stages.map(
    (days, i) => `  ${STAGE_NAMES[i]}: ${days} يوماً`,
  );

  return {
    source: "calculator",
    confidence: 1,
    usedTitles: [],
    answer: [
      `${crop.name} في السودان — الموعد وطول الموسم:`,
      "",
      `الزراعة المعتادة: ${MONTH_NAMES[month]}.`,
      `طول الموسم: ${seasonDays} يوماً، فالحصاد نحو ${MONTH_NAMES[m]}.`,
      "",
      "مراحل الموسم:",
      ...stageLines,
      "",
      "هذه المواعيد المعتادة في وادي النيل الأوسط، وتتقدّم أو تتأخّر بحسب " +
        "الولاية وسنة المطر. اذكر موقعك أو اسألني عن احتياجه المائي وسأحسبه " +
        "على مناخ منطقتك.",
    ].join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * 5. Climate
 * ------------------------------------------------------------------ */

const CLIMATE_TERMS = [
  "حراره",
  "حراره",
  "درجه",
  "مطر",
  "امطار",
  "خريف",
  "مناخ",
  "طقس",
  "حار",
  "بارد",
].map(normalizeArabic);

/**
 * Answers "how hot / how much rain" for a station the platform already carries.
 *
 * Fifteen stations of twenty-year monthly normals sit in the agronomy module
 * because the water engine needs them. A visitor asking how much rain El Fasher
 * gets is asking for a number that is already loaded, exact, and attributed —
 * and a model asked the same question will produce a plausible one instead.
 */
function resolveClimate(input: LocalAnswerInput): LocalAnswer | null {
  const normalized = normalizeArabic(input.question);
  const terms = new Set(questionTerms(input.question));

  // A crop in the question means the water calculator or the calendar is the
  // better resolver; this one answers about places.
  if (findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES)) return null;

  if (!CLIMATE_TERMS.some((t) => terms.has(t) || normalized.includes(t))) {
    return null;
  }

  const station = findByAlias<StationClimate>(
    normalized,
    STATIONS,
    STATION_ALIASES,
  );
  if (!station) return null;

  let namedMonth = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (normalized.includes(normalizeArabic(MONTH_NAMES[i]))) {
      namedMonth = i;
      break;
    }
  }

  const annualRain = station.rainfall.reduce((a, b) => a + b, 0);
  const hottest = station.tmax.indexOf(Math.max(...station.tmax));
  const wettest = station.rainfall.indexOf(Math.max(...station.rainfall));
  const rainyMonths = station.rainfall.filter((r) => r >= 10).length;

  const lines: string[] = [];

  if (namedMonth >= 0) {
    lines.push(
      `${station.name} في ${MONTH_NAMES[namedMonth]}:`,
      "",
      `العظمى ${station.tmax[namedMonth]}° والصغرى ${station.tmin[namedMonth]}°.`,
      `المطر ${formatNumber(station.rainfall[namedMonth])} مم.`,
      "",
    );
  } else {
    lines.push(`${station.name} — المعدّلات المناخية:`, "");
  }

  lines.push(
    `المطر السنوي: ${formatNumber(annualRain)} مم، أغزره في ${MONTH_NAMES[wettest]} ` +
      `(${formatNumber(station.rainfall[wettest])} مم).`,
    rainyMonths === 0
      ? "ولا شهر فيه مطرٌ يُعتدّ به — الزراعة هنا ريّاً بحتاً."
      : `وموسم المطر ${rainyMonths} ${rainyMonths <= 10 ? "أشهر" : "شهراً"} في السنة.`,
    `أحرّ الشهور ${MONTH_NAMES[hottest]}: عظمى ${station.tmax[hottest]}° وصغرى ${station.tmin[hottest]}°.`,
    `أبرد ليلة في المتوسّط ${Math.min(...station.tmin)}°.`,
  );

  lines.push(
    "",
    station.source === "nasa-power"
      ? "المصدر: NASA POWER — متوسّطات MERRA-2 عند إحداثيات المحطة."
      : "قيم استرشادية للمنطقة، لا قراءات محطة مقيسة.",
  );

  return {
    source: "climate",
    confidence: 1,
    usedTitles: [],
    answer: lines.join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * 6. Market — yield and price from FAOSTAT
 * ------------------------------------------------------------------ */

const MARKET_TERMS = [
  "غله",
  "غلة",
  "انتاجيه",
  "انتاج",
  "طن",
  "كيلو",
  "سعر",
  "اسعار",
  "بكم",
  "يبيع",
  "بيع",
  "عائد",
  "ايراد",
  "تصدير",
  "قيمه",
].map(normalizeArabic);

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Answers yield and price from FAOSTAT rather than from recollection.
 *
 * Every figure here is a published observation with a year on it, and the
 * gap between Sudan and its peers is the single most useful thing this
 * platform can tell someone deciding what to plant. A model asked the same
 * question returns a number of the right magnitude and the wrong provenance.
 *
 * The revenue per feddan is computed rather than looked up, because that is the
 * form the question is actually asked in — "بكم يطلع الفدان" — and the two
 * prices are reported separately: an export unit value and a regional producer
 * price are not the same money, and averaging them would hide which one the
 * farmer at the gate actually sees.
 */
function resolveMarket(input: LocalAnswerInput): LocalAnswer | null {
  const rows = input.market ?? [];
  if (rows.length === 0) return null;

  const normalized = normalizeArabic(input.question);
  const terms = new Set(questionTerms(input.question));

  if (!MARKET_TERMS.some((t) => terms.has(t) || normalized.includes(t))) {
    return null;
  }

  const crop = findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES);
  if (!crop) return null;

  const item = FAOSTAT_ITEM[crop.key];
  if (!item) return null;

  const row = rows.find((r) => r.item === item);
  if (!row) return null;

  const sudan = num(row.sudan_kg_ha);
  if (sudan === null) return null;

  const egypt = num(row.egypt_kg_ha);
  const peer = num(row.peer_median_kg_ha);
  const exportPrice = num(row.sudan_export_usd_per_tonne);
  const producerPrice = num(row.regional_producer_usd_per_tonne);

  const perFeddanKg = sudan * HECTARES_PER_FEDDAN;

  const lines = [
    `${crop.name} — الغلّة والسعر من FAOSTAT (${row.year}):`,
    "",
    `غلّة السودان: ${formatNumber(sudan)} كجم/هكتار، أي ${formatNumber(perFeddanKg)} كجم للفدان.`,
  ];

  if (peer !== null) {
    lines.push(
      `وسيط الدول المشابهة: ${formatNumber(peer)} كجم/هكتار` +
        (sudan > 0
          ? ` — أي ${(peer / sudan).toFixed(1)} ضعف غلّة السودان.`
          : "."),
    );
  }
  if (egypt !== null) {
    lines.push(`ومصر: ${formatNumber(egypt)} كجم/هكتار.`);
  }

  if (exportPrice !== null || producerPrice !== null) {
    lines.push("", "السعر:");
    if (exportPrice !== null) {
      lines.push(
        `  قيمة الوحدة التصديرية للسودان: ${formatNumber(exportPrice)} $/طن.`,
      );
    }
    if (producerPrice !== null) {
      lines.push(
        `  سعر المنتِج في الدول المجاورة: ${formatNumber(producerPrice)} $/طن.`,
      );
    }

    // The gross the farmer's own yield earns at each price. Break-even and cost
    // are not here on purpose: they need the visitor's own budget, and the
    // feasibility tool asks for it.
    const best = producerPrice ?? exportPrice;
    if (best !== null) {
      lines.push(
        "",
        `فالفدان بغلّة السودان يبيع بنحو ${formatNumber(
          (perFeddanKg / 1000) * best,
        )} دولاراً إجمالاً قبل أي تكلفة.`,
      );
    }
  }

  lines.push(
    "",
    "قيمة الوحدة التصديرية ليست سعر المزرعة: بينهما النقل والتنظيف والوسيط. " +
      "استخدم حاسبة الجدوى في المنصّة لتضع تكاليفك ونرى الصافي.",
  );

  return {
    source: "market",
    confidence: 1,
    usedTitles: [],
    answer: lines.join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * 7. The Arc Canal dossier
 * ------------------------------------------------------------------ */

const CANAL_TERMS = ["القناه القوسيه", "القوسيه", "قناه قوسيه"].map(
  normalizeArabic,
);

const FACT_STATUS_LABEL: Record<string, string> = {
  measured: "مقيس",
  derived: "محسوب",
  assumption: "فرضية",
  unknown: "غير معروف",
};

/**
 * Answers about the canal from the dossier table, not from prose.
 *
 * The whole point of putting forty-five attributes in a table with a status and
 * a source on each was that anything could then answer from them. This is that
 * anything: a question naming the canal is matched against the fact labels and
 * notes, and the best matches are quoted with their status attached.
 *
 * Quoting the status is not decoration. "غير معروف" is the honest answer to
 * several of the most natural questions about this project — the water permit,
 * the tariff, the operator — and a resolver that skipped the blank rows would
 * answer those questions with silence and let the model invent something.
 */
function resolveCanal(input: LocalAnswerInput): LocalAnswer | null {
  const facts = input.canalFacts ?? [];
  if (facts.length === 0) return null;

  const normalized = normalizeArabic(input.question);
  if (!CANAL_TERMS.some((t) => normalized.includes(t))) return null;

  const terms = questionTerms(input.question).filter(
    (t) => !normalized.startsWith(t) || t.length > 3,
  );

  const scored = facts
    .map((f) => {
      const haystack = normalizeArabic(
        `${f.label} ${f.value ?? ""} ${f.unit ?? ""} ${f.note ?? ""}`,
      );
      let score = 0;
      for (const t of terms) {
        if (t.length < 3) continue;
        // The label is what the fact is about; a hit there is worth more than a
        // hit somewhere in a two-sentence note.
        if (normalizeArabic(f.label).includes(t)) score += 3;
        else if (haystack.includes(t)) score += 1;
      }
      return { fact: f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const quoted = scored.slice(0, 4);

  // Nothing matched beyond the canal's own name: answer with the study's
  // headline rather than with four arbitrary rows.
  if (quoted.length === 0 || quoted[0].score < 3) {
    const headline = facts.filter((f) =>
      ["route_length", "static_lift", "terminus_above_source", "pilot_design"].includes(
        f.key,
      ),
    );
    if (headline.length === 0) return null;
    return {
      source: "canal",
      confidence: 1,
      usedTitles: headline.map((f) => f.label),
      answer: [
        "دراسة سودجري للقناة القوسية، في أربعة أرقام:",
        "",
        ...headline.map(
          (f) => `${f.label}: ${f.value ?? "لم يُحدَّد بعد"}${f.unit ? ` ${f.unit}` : ""}`,
        ),
        "",
        "الدراسة كاملة على صفحة /arc-canal — الخريطة والمقطع الطولي والتصميم " +
          "والكلفة. واسألني عن أي بند بعينه.",
      ].join("\n"),
    };
  }

  const blocks = quoted.map((s) => {
    const f = s.fact;
    const head =
      f.value === null
        ? `${f.label}: لم يُحدَّد بعد`
        : `${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`;
    const tag = FACT_STATUS_LABEL[f.status] ?? f.status;
    const src = f.status === "unknown" ? "" : ` · ${f.source}`;
    return `${head}\n  [${tag}${src}]${f.note ? `\n  ${f.note}` : ""}`;
  });

  return {
    source: "canal",
    confidence: 1,
    usedTitles: quoted.map((s) => s.fact.label),
    answer: [
      "من ملفّ القناة القوسية في قاعدة سودجري:",
      "",
      blocks.join("\n\n"),
      "",
      "الدراسة كاملة على صفحة /arc-canal.",
    ].join("\n"),
  };
}


/* ------------------------------------------------------------------ *
 * 8. Soil and water, in Sudanese colloquial
 * ------------------------------------------------------------------ */

/*
 * THE LARGEST GAP IN THE LOG, BY A WIDE MARGIN.
 *
 * Of the first fifty questions the assistant recorded, twenty-six were this one
 * intent and twenty of those went unanswered: "the ground is thirsty", "the
 * water dries fast in the sand", "where is the ground that holds water". The
 * dialect was understood only by the language model, and the model is the part
 * that fails — so the most-asked question on the platform was also its
 * worst-served.
 *
 * The words below are taken from the log verbatim, misspellings included.
 * «واسطة» for «واطة» and «عطسانة» for «عطشانة» are not hypothetical typos: they
 * are what people actually typed, more than once each, and a resolver that
 * matched only correct spelling would miss the questions it exists for.
 */

/** The ground itself — including the two misspellings the log shows. */
const SOIL_WORDS = [
  // "واط" rather than "واطه", because the log carries "واطاطي" — a possessive
  // the exact form misses. Safe only because a dry-or-wet word is required
  // alongside it, so an unrelated word containing the same letters cannot
  // trigger this on its own.
  "واط",
  "واسطه",
  "تربه",
  "الارض",
  "ارضي",
  "رمله",
  "رمليه",
].map(normalizeArabic);

/** Water, and the state of running short of it. */
const DRY_WORDS = [
  "عطشانه",
  "عطشان",
  // Two spellings nobody would invent, both taken from the log: ط→س, and a
  // transposition. Guessing at typos is overfitting; copying the ones people
  // actually typed is the opposite — it is the only way a colloquial resolver
  // meets the words as they arrive rather than as a dictionary imagines them.
  "عطسانه",
  "عشةانه",
  "بتنشف",
  "تنشف",
  "ينشف",
  "نشفت",
  "عطشت",
  "جفاف",
  "بسرعه",
].map(normalizeArabic);

/** The opposite state — ground that holds its water. */
const WET_WORDS = ["رويانه", "رويان", "خصبه", "بتمسك المويه"].map(
  normalizeArabic,
);

const WATER_WORDS = ["مويه", "مي", "ماء", "الماء"].map(normalizeArabic);

const n1 = (v: number) => v.toFixed(1);

/**
 * Answers the thirsty-soil question with an interval, not with advice.
 *
 * The finding a farmer needs here is counter-intuitive and a model will not
 * reliably produce it: sandy ground does not need *more* water over the season,
 * it needs the *same* water more often and in smaller doses. Stated as two
 * numbers from the same engine — every 3.7 days on sand against every 10.3 on
 * clay loam — it is checkable and it is actionable.
 */
function resolveSoilWater(input: LocalAnswerInput): LocalAnswer | null {
  const normalized = normalizeArabic(input.question);

  const mentionsSoil = SOIL_WORDS.some((w) => normalized.includes(w));
  const mentionsWater = WATER_WORDS.some((w) => normalized.includes(w));
  const isDry = DRY_WORDS.some((w) => normalized.includes(w));
  const isWet = WET_WORDS.some((w) => normalized.includes(w));

  /*
   * Needs a subject and a state — "الواطة" alone is not a question, and
   * answering it would be guessing at what was meant.
   *
   * Except that «عطشانة» and «رويانة» are themselves soil adjectives in this
   * dialect: nobody calls anything else thirsty or well-watered. So when both
   * appear with no noun at all — the log has «الرويانة العطشانة» — the subject
   * is not missing, it is implied.
   */
  const impliedSoil = isDry && isWet;
  if (!(mentionsSoil || mentionsWater || impliedSoil) || !(isDry || isWet)) {
    return null;
  }

  const crop =
    findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES) ??
    DEFAULT_CROP;
  const station =
    findByAlias<StationClimate>(normalized, STATIONS, STATION_ALIASES) ??
    STATIONS[0];
  const month = DEFAULT_PLANTING_MONTH[crop.key] ?? 6;

  const light = irrigationInterval(crop, station, month, "flood", "sand");
  const heavy = irrigationInterval(crop, station, month, "flood", "clay loam");
  if (!light || !heavy) return null;

  if (isWet && !isDry) {
    // "Where is the ground that holds water" — the same table read the other
    // way. No place names: which soils hold water is physics, where those soils
    // are is a survey nobody on this platform has done.
    const ordered = Object.entries(TAW_MM_PER_M).sort((a, b) => b[1] - a[1]);
    return {
      source: "calculator",
      confidence: 1,
      usedTitles: [],
      answer: [
        "الأرض التي «ترويان» هي التي تمسك أكبر عمق من الماء في منطقة الجذور.",
        "",
        "الماء المتاح الكلّي لكل متر من عمق الجذور:",
        ...ordered.map(([soil, taw]) => `  ${SOIL_LABEL[soil]}: ${taw} مم`),
        "",
        `والفرق عملي لا نظري: ${crop.name} على تربة طينية طميية يصبر ` +
          `${n1(heavy.days)} يوماً بين ريّة وريّة، وعلى الرملية ` +
          `${n1(light.days)} أيام فقط — بالماء نفسه والمناخ نفسه.`,
        "",
        "ولا أستطيع أن أقول لك أين تقع كل تربة في السودان: ذلك مسحٌ ميداني " +
          "لم تُجرِه هذه المنصّة. لكن فحص قوام تربتك بسيط — بلّها واعصرها بيدك: " +
          "إن تماسكت خيطاً فهي طينية، وإن تفتّتت فهي رملية.",
      ].join("\n"),
    };
  }

  return {
    source: "calculator",
    confidence: 1,
    usedTitles: [],
    answer: [
      "الأرض الرملية لا تحتاج ماءً أكثر — تحتاج الماء نفسه على دفعات أقرب.",
      "",
      `السبب أنها تمسك ثلث ما تمسكه الطينية: ${TAW_MM_PER_M["sand"]} مم لكل متر ` +
        `من عمق الجذور مقابل ${TAW_MM_PER_M["clay loam"]} مم. فالخزّان أصغر، ` +
        "والمحصول يسحب منه بالمعدّل نفسه، فيفرغ أسرع.",
      "",
      `وبحساب FAO-56 على ${crop.name} في ${station.name}، عند ذروة الموسم:`,
      `  تربة رملية: ريّة كل ${n1(light.days)} أيام، ` +
        `بعمق ${Math.round(light.doseMm)} مم (${Math.round(light.doseM3PerFeddan)} م³ للفدان).`,
      `  تربة طينية طميية: ريّة كل ${n1(heavy.days)} أيام، ` +
        `بعمق ${Math.round(heavy.doseMm)} مم (${Math.round(heavy.doseM3PerFeddan)} م³ للفدان).`,
      "",
      "أي أنك تروي نحو ثلاثة أضعاف عدد المرّات، وبثلث الكمية في كل مرّة. " +
        "والريّة الكبيرة على الرملية تنزل تحت الجذور ولا يستفيد منها المحصول.",
      "",
      "وما يوسّع الفترة فعلاً ثلاثة:",
      "  التنقيط بدل الغمر — يوصل الماء للجذر ولا يبلّل ما بين الخطوط.",
      "  التغطية بالمخلّفات النباتية — تقطع البخر من سطح التربة.",
      "  المادة العضوية والسماد البلدي — ترفع ما تمسكه التربة الرملية سنةً بعد سنة.",
      "",
      "اسألني عن احتياج محصولك المائي بالتفصيل، أو جرّب حاسبة المياه في المنصّة.",
    ].join("\n"),
  };
}

/* ------------------------------------------------------------------ *
 * 9. What the assistant can actually do
 * ------------------------------------------------------------------ */

const CAPABILITY_TERMS = [
  "امكانيات",
  "امكانياتك",
  "تفعل",
  "تعمل شنو",
  "بتعمل شنو",
  "قدراتك",
  "تساعدني في شنو",
  "وش تسوي",
].map(normalizeArabic);

/**
 * Seven visitors asked what this assistant can do, and four got nothing.
 *
 * A model answering it improvises a list, and the list is wrong the moment a
 * resolver is added or removed. This one is written from what the resolvers
 * above actually do, so it goes stale only when they do.
 */
/*
 * "هل يمكنك إضافة اي معلومة هنا" — asked twice, answered neither time.
 *
 * It gets its own answer rather than the capability menu, because it is not
 * "what can you do" but "can you write into this platform", and the honest
 * answer is no. A model asked this says yes and offers, which would be a
 * promise the platform cannot keep and — worse — would suggest the knowledge
 * base accepts unreviewed text, which is the one thing it must never do.
 */
const AUTHORING_TERMS = [
  "تضيف معلومه",
  "اضافه اي معلومه",
  "اضافه معلومه",
  "تضيف معلومات",
  "اضافه معلومات",
].map(normalizeArabic);

/*
 * "هل المساعد العام يعمل" — someone checking whether the thing is alive at all.
 * Answering it needs no model, and answering it *with* a model is exactly
 * backwards: if the model is down, the question goes unanswered precisely when
 * its answer matters.
 */
const LIVENESS_TERMS = ["المساعد يعمل", "المساعد العام يعمل", "المساعد شغال"].map(
  normalizeArabic,
);

function resolveCapability(input: LocalAnswerInput): LocalAnswer | null {
  const normalized = normalizeArabic(input.question);

  if (AUTHORING_TERMS.some((t) => normalized.includes(t))) {
    return {
      source: "platform",
      confidence: 1,
      usedTitles: [],
      answer:
        "لا. أنا أقرأ من قاعدة سودجري ولا أكتب فيها، وهذا قيد مقصود لا نقص: " +
        "كل مُدخل في قاعدة المعرفة يمرّ بمراجعة بشرية ويُنشر بمصدره ودولته " +
        "المرجعية، ومساعدٌ يضيف نصّاً بنفسه يفتح الباب لمعلومة بلا سند داخل " +
        "المكان الذي يُفترض أن يكون كل ما فيه موثّقاً.\n\n" +
        "وإن كانت لديك معلومة أو تصحيح، فأرسلها عبر نموذج الملاحظات — تصل " +
        "الإدارة وتُراجَع، ثم تُنشر بمصدرها إن صحّت.",
    };
  }

  if (LIVENESS_TERMS.some((t) => normalized.includes(t))) {
    return {
      source: "platform",
      confidence: 1,
      usedTitles: [],
      answer:
        "نعم، يعمل — وهذه الإجابة نفسها دليلها: وصلتك من داخل المنصّة بلا " +
        "نموذج لغوي ولا اتصال خارجي.\n\n" +
        "حسابات الريّ والمناخ والغلّة والمواعيد تُجاب هكذا دائماً. أمّا " +
        "الأسئلة النثرية فتحتاج النموذج، وقد ينقطع — وحين ينقطع يظلّ ما سبق " +
        "يُجاب كاملاً.",
    };
  }

  if (!CAPABILITY_TERMS.some((t) => normalized.includes(t))) return null;

  // A question that names a crop is a question about that crop, however it is
  // phrased. Only the bare "what can you do" reaches here.
  if (findByAlias<CropCoefficients>(normalized, CROPS, CROP_ALIASES)) return null;

  /*
   * And "تعمل شنو لو واطاطي عطشت شديد" is not a capability question — it opens
   * with the same three words and is about thirsty ground. Standing down when
   * a soil or water state is described is what keeps this resolver from
   * answering the platform's most-asked question with a menu.
   */
  if (
    [...DRY_WORDS, ...WET_WORDS].some((w) => normalized.includes(w)) &&
    [...SOIL_WORDS, ...WATER_WORDS].some((w) => normalized.includes(w))
  ) {
    return null;
  }

  return {
    source: "platform",
    confidence: 1,
    usedTitles: [],
    answer: [
      "أجيب من بيانات سودجري نفسها قبل أن ألجأ إلى أي نموذج لغوي. ما أحسبه بنفسي:",
      "",
      `الاحتياج المائي لأي من ${CROPS.length} محاصيل، بمنهجية FAO-56، على مناخ ` +
        `${STATIONS.length} محطة سودانية وبأربع طرق ريّ — بالمتر المكعّب للفدان ` +
        "وبشهر الذروة.",
      "الفترة بين ريّة وأخرى بحسب قوام تربتك: كم يوماً تصبر أرضك قبل أن يعطش المحصول.",
      "موعد الزراعة وطول الموسم ومراحله وشهر الحصاد لكل محصول.",
      "المناخ: المطر السنوي وأغزر شهوره وأحرّ الشهور في أي محطة.",
      "الغلّة والأسعار من قاعدة FAOSTAT المحمَّلة داخل المنصّة، مع مقارنة السودان بالدول المشابهة.",
      "ملفّ القناة القوسية: التضاريس والتربة والتصميم والكلفة، كل بند بحالته ومصدره.",
      "",
      "وما عدا ذلك أجيبه من قاعدة المعرفة المراجَعة، وأذكر لك دولة كل مصدر. " +
        "وإن لم تكفِ، أقول لك ذلك بدل أن أختلق جواباً.",
      "",
      "جرّب: «كم يحتاج فدان القمح من الماء في الجزيرة؟» أو «متى أزرع السمسم؟» " +
        "أو «الواطة عطشانة كيف أعالجها؟»",
    ].join("\n"),
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

export function answerLocally(input: LocalAnswerInput): LocalAnswer | null {
  /*
   * ORDER MATTERS, AND IT IS BY SPECIFICITY.
   *
   * The canal resolver is first because naming the canal is unambiguous — no
   * other resolver wants that question, and several would half-answer it. Then
   * the computed resolvers, each of which requires a crop or a place plus a
   * topic before it will fire, so none of them can swallow a question meant for
   * another. Prose comes last: an entry that merely mentions sorghum should
   * never outrank the arithmetic for how much water sorghum needs.
   */
  const canal = resolveCanal(input);
  if (canal) return canal;

  // The calculator goes first among the crop resolvers: when a question names a
  // crop and asks about water, computed numbers beat any prose about it.
  const calculated = resolveCalculator(input);
  if (calculated) return calculated;

  const market = resolveMarket(input);
  if (market) return market;

  const calendar = resolveCalendar(input);
  if (calendar) return calendar;

  const climate = resolveClimate(input);
  if (climate) return climate;

  /*
   * Soil-and-water comes after the crop resolvers and before prose, and the
   * log says why it has to exist at all: it is the single largest intent the
   * assistant receives and was its worst-served. It sits below the calculator
   * so that a question naming both a crop and its water still gets the seasonal
   * figure, and above the knowledge base so that an entry merely mentioning
   * sand cannot outrank a computed irrigation interval.
   */
  const soil = resolveSoilWater(input);
  if (soil) return soil;

  const capability = resolveCapability(input);
  if (capability) return capability;

  // A question landing squarely on a curated entry is a knowledge question even
  // when it contains the word "استثمار" — answering "nothing is on offer" to
  // someone asking how investment in cotton works would be a non sequitur.
  const knowledge = resolveKnowledge(input);
  if (knowledge && knowledge.confidence >= KB_OVERRIDE_CONFIDENCE) {
    return knowledge;
  }

  return resolvePlatform(input) ?? knowledge;
}
