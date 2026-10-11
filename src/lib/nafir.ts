/**
 * النفير — القيمُ آلياتٍ تعمل.
 *
 * Everything the /nafir section says is here: the charter's text, the labels
 * of the closed lists the database checks, and the wording of the trust pulse.
 * The design and its sources are in docs/nafir-design-ar.md; the guards that
 * make the mechanisms trustworthy are in
 * supabase/migrations/20260925090000_nafir_values_at_work.sql.
 */

import type { Locale } from "./i18n";

/* ───────────────────────── الولايات ───────────────────────── */

/** Must match is_sudan_state() in the migration, in the same spelling. */
export const SUDAN_STATES = [
  "الخرطوم", "الجزيرة", "سنار", "النيل الأزرق", "النيل الأبيض", "القضارف", "كسلا",
  "البحر الأحمر", "نهر النيل", "الشمالية", "شمال كردفان", "جنوب كردفان", "غرب كردفان",
  "شمال دارفور", "جنوب دارفور", "شرق دارفور", "غرب دارفور", "وسط دارفور",
] as const;

/** English names for the closed list above; the stored value stays Arabic. */
export const SUDAN_STATES_EN: Record<string, string> = {
  "الخرطوم": "Khartoum",
  "الجزيرة": "Gezira",
  "سنار": "Sennar",
  "النيل الأزرق": "Blue Nile",
  "النيل الأبيض": "White Nile",
  "القضارف": "Gedaref",
  "كسلا": "Kassala",
  "البحر الأحمر": "Red Sea",
  "نهر النيل": "River Nile",
  "الشمالية": "Northern",
  "شمال كردفان": "North Kordofan",
  "جنوب كردفان": "South Kordofan",
  "غرب كردفان": "West Kordofan",
  "شمال دارفور": "North Darfur",
  "جنوب دارفور": "South Darfur",
  "شرق دارفور": "East Darfur",
  "غرب دارفور": "West Darfur",
  "وسط دارفور": "Central Darfur",
};

export const stateName = (s: string, locale: Locale = "ar") =>
  locale === "en" ? (SUDAN_STATES_EN[s] ?? s) : s;

/** The label of a closed-list key in the reader's language. */
export function label<K extends string>(
  arMap: Record<K, string>,
  enMap: Record<K, string>,
  key: K,
  locale: Locale = "ar",
): string {
  return (locale === "en" ? enMap : arMap)[key] ?? key;
}

/**
 * Attributes for text people typed (titles, descriptions, names) when the
 * page is in English: it is usually Arabic and must keep its own direction.
 */
export const typed = (locale: Locale) =>
  locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};

/* ───────────────────────── الميثاق ───────────────────────── */

/**
 * The charter, versioned. A signature records the version it was given to, so
 * changing a word here means bumping CHARTER_VERSION — and every earlier
 * signature stays a signature to what its signer read.
 */
export const CHARTER_VERSION = 1;

export interface CharterValue {
  key: string;
  title: string;
  /** The same value in English; `en.root` renders the Arabic `root` it sits beside. */
  en: { title: string; root: string; commitment: string; practice: string };
  /** The line from the reference it rests on. */
  root: string;
  /** What it commits the signer to, in one sentence. */
  commitment: string;
  /** Where on the platform it is practised — the difference between a value and a poster. */
  practice: string;
  href?: string;
}

export const CHARTER_REFERENCE = [
  {
    title: "الاستخلاف والعمران",
    text: "«هُوَ أَنشَأَكُم مِّنَ الْأَرْضِ وَاسْتَعْمَرَكُمْ فِيهَا» — الأرضُ أمانة، وعمارتُها عبادة. مَن رأى زرعه أمانةً لم يتركه حين يتأخّر الربح.",
    en: {
      title: "Stewardship and building the earth",
      quote: "هُوَ أَنشَأَكُم مِّنَ الْأَرْضِ وَاسْتَعْمَرَكُمْ فِيهَا",
      text: "“He has produced you from the earth and settled you in it” (Hud 11:61). The land is a trust, and making it flourish is worship. Whoever sees their crop as a trust does not abandon it when the profit is late.",
    },
  },
  {
    title: "الفسيلة",
    text: "«إن قامت الساعة وفي يد أحدكم فسيلة فليغرسها» — نعمل ولو لم نرَ الثمرة، لأنّ العمل نفسه هو المطلوب.",
    en: {
      title: "The palm seedling",
      quote: "إن قامت الساعة وفي يد أحدكم فسيلة فليغرسها",
      text: "“If the Hour comes while one of you has a palm seedling in his hand, let him plant it” (hadith). We work even if we never see the fruit, because the work itself is what is asked of us.",
    },
  },
  {
    title: "الإنسان والتراب والوقت",
    text: "يرى مالك بن نبي أنّ الحضارة إنسانٌ وترابٌ ووقت، لا تتفاعل إلا بفكرةٍ دافعة. التراب عندنا وفير، والوقت يضيع، والإنسان ينتظر فكرةً تجمعه.",
    en: {
      title: "People, soil and time",
      text: "Malek Bennabi held that civilisation is people, soil and time, which only combine through a driving idea. We have soil in plenty, time is being lost, and people are waiting for an idea that brings them together.",
    },
  },
  {
    title: "ما نعرفه من أهلنا",
    text: "النفير، والفزعة، والجودية — قيمٌ يعيشها الريف السوداني قبل أن تُكتب. نحن لا نستورد قيماً؛ نعطي ما عندنا أداةً أوسع.",
    en: {
      title: "What we know from our own people",
      text: "Nafir (the communal work call), faza (rushing to a neighbour’s aid) and judiyya (mediation by respected elders): values rural Sudan lives before they are ever written down. We are not importing values; we are giving what we already have a wider tool.",
    },
  },
];

export const LEADER_VALUES: CharterValue[] = [
  {
    key: "amana",
    title: "الأمانة",
    root: "«إنّا عرضنا الأمانة…»",
    commitment: "أتصرّف في الأرض والناس والمال تصرّفَ المؤتمن الذي سيُسأل.",
    practice: "اسمي في قائمة القادة الموقّعين، وأُسأل به في الشورى.",
    href: "/nafir/shura",
    en: {
      title: "Trustworthiness (amana)",
      root: "“Indeed, We offered the Trust…” (al-Ahzab 33:72)",
      commitment: "I handle the land, the people and the money as a trustee who will be called to account.",
      practice: "My name is on the list of signed leaders, and I am questioned by it in the shura.",
    },
  },
  {
    key: "qudwa",
    title: "القدوة",
    root: "«أتأمرون الناس بالبرّ وتنسون أنفسكم»",
    commitment: "لا أطلب من الناس عملاً لا أحضره.",
    practice: "القائد يدعو إلى النفير ويحضره، ويظهر ذلك في سجلّ النفير.",
    href: "/nafir",
    en: {
      title: "Leading by example",
      root: "“Do you order righteousness of the people and forget yourselves?” (al-Baqarah 2:44)",
      commitment: "I do not ask people for work I do not turn up to myself.",
      practice: "A leader calls a nafir and attends it, and the nafir record shows it.",
    },
  },
  {
    key: "sidq",
    title: "الصدق والشفافية",
    root: "«كونوا مع الصادقين»",
    commitment: "لا أعلن رقماً بلا مصدره، ولا أُخفي خسارة.",
    practice: "مؤشّرات النفير عامّةٌ للجميع، وأرقام المنصّة كلّها بمصدرها.",
    href: "/nafir#indicators",
    en: {
      title: "Truthfulness and transparency",
      root: "“…and be with those who are true” (at-Tawbah 9:119)",
      commitment: "I announce no figure without its source, and I hide no loss.",
      practice: "The nafir indicators are public to all, and every figure on the platform carries its source.",
    },
  },
  {
    key: "shura",
    title: "الشورى",
    root: "«وأمرُهم شورى بينهم»",
    commitment: "أسمع قبل أن أقرّر، وأُجيب علناً عمّا أُسأل عنه.",
    practice: "كلّ سؤالٍ في الشورى يبقى ظاهراً بعمره حتى يُجاب.",
    href: "/nafir/shura",
    en: {
      title: "Consultation (shura)",
      root: "“…and whose affair is [determined by] consultation among themselves” (ash-Shura 42:38)",
      commitment: "I listen before I decide, and I answer in public what I am asked.",
      practice: "Every question in the shura stays visible, with its age, until it is answered.",
    },
  },
  {
    key: "adl",
    title: "العدل في العائد",
    root: "«اعدلوا هو أقرب للتقوى»",
    commitment: "أعلن قاعدة توزيع العائد قبل الموسم لا بعده.",
    practice: "سؤال «كيف يُوزَّع العائد؟» يُطرح في الشورى ويُجاب قبل الزراعة.",
    href: "/nafir/shura",
    en: {
      title: "Fairness in the returns",
      root: "“Be just; that is nearer to righteousness” (al-Ma’idah 5:8)",
      commitment: "I announce the rule for sharing the returns before the season, not after it.",
      practice: "The question “How will the returns be shared?” is put in the shura and answered before planting.",
    },
  },
  {
    key: "sabr",
    title: "طول النفس",
    root: "حديث الفسيلة",
    commitment: "أعمل لعشر سنين، ولا ألغي الخطة عند أوّل تعثّر.",
    practice: "المؤشّرات تُقرأ موسماً بعد موسم، لا يوماً بيوم.",
    en: {
      title: "Patience for the long haul",
      root: "The hadith of the palm seedling",
      commitment: "I work for ten years, and I do not drop the plan at the first stumble.",
      practice: "The indicators are read season after season, not day by day.",
    },
  },
];

export const MEMBER_VALUES: CharterValue[] = [
  {
    key: "nafir",
    title: "النفير والتكافل",
    root: "«المؤمن للمؤمن كالبنيان يشدّ بعضه بعضاً»",
    commitment: "ألبّي نداء جاري إلى العمل كما أريده أن يلبّي ندائي.",
    practice: "دعوات النفير: تُنشر، ويُلبّيها الناس بأسمائهم.",
    href: "/nafir",
    en: {
      title: "Nafir and mutual support",
      root: "“The believer to the believer is like a building, each part strengthening the other” (hadith)",
      commitment: "I answer my neighbour’s call to work as I want him to answer mine.",
      practice: "Nafir calls: they are posted, and people answer them by name.",
    },
  },
  {
    key: "faza",
    title: "الفزعة",
    root: "«من نفّس عن مؤمنٍ كربة…»",
    commitment: "إذا أصابت جاري جائحةٌ فزعتُ له بما أملك من يدٍ أو آلةٍ أو بذر.",
    practice: "طلبات الفزعة: عونٌ غير ماليّ يُعاهَد عليه.",
    href: "/nafir/faza",
    en: {
      title: "Faza: rushing to help",
      root: "“Whoever relieves a believer of a hardship…” (hadith)",
      commitment: "If disaster strikes my neighbour, I rush to help with whatever I have: hands, machinery or seed.",
      practice: "Faza requests: non-cash help, pledged on the record.",
    },
  },
  {
    key: "wafa",
    title: "الأمانة في الوعد",
    root: "«وأوفوا بالعهد إنّ العهد كان مسؤولاً»",
    commitment: "إذا عاهدتُ وفيت، ولا أعِد بما لا أقدر عليه.",
    practice: "العهد يُعدّ موفىً حين يشهد بذلك مَن عوهد، لا مَن عاهَد.",
    href: "/nafir/faza",
    en: {
      title: "Keeping one’s word",
      root: "“And fulfil [every] commitment. Indeed, the commitment is ever [that about which one will be] questioned” (al-Isra 17:34)",
      commitment: "When I pledge, I keep it, and I promise nothing I cannot do.",
      practice: "A pledge counts as kept when the one it was made to says so, not the one who made it.",
    },
  },
  {
    key: "itqan",
    title: "الإتقان",
    root: "«إنّ الله يحبّ إذا عمل أحدكم عملاً أن يتقنه»",
    commitment: "أعمل عملي كأنّ الناس سيرونه، لأنهم سيرونه.",
    practice: "كلّ نفيرٍ يُغلق بما أُنجز فعلاً، ويُنشر ذلك.",
    href: "/nafir",
    en: {
      title: "Doing the work well (itqan)",
      root: "“Allah loves that when one of you does a deed, he does it well” (hadith)",
      commitment: "I do my work as if people will see it, because they will.",
      practice: "Every nafir is closed with what was actually achieved, and that is published.",
    },
  },
  {
    key: "karama",
    title: "الكرامة والملكية",
    root: "«من أحيا أرضاً ميتةً فهي له»",
    commitment: "أنا شريكٌ في ما أزرع، أُسأل وأَسأل.",
    practice: "لكلّ عضوٍ صوتٌ في الشورى، وسجلُّ أرضه وموسمه باسمه.",
    href: "/nafir/shura",
    en: {
      title: "Dignity and ownership",
      root: "“Whoever brings dead land to life, it is his” (hadith)",
      commitment: "I am a partner in what I grow; I am asked, and I ask.",
      practice: "Every member has a voice in the shura, and the record of their land and season is in their name.",
    },
  },
];

/* ───────────────────────── النفير ───────────────────────── */

export const NAFIR_KINDS = {
  harvest: "حصاد",
  planting: "زراعة",
  canal: "تطهير قناة أو ترعة",
  building: "بناء",
  cleaning: "نظافة وإصلاح",
  other: "عملٌ آخر",
} as const;
export type NafirKind = keyof typeof NAFIR_KINDS;
export const NAFIR_KINDS_EN: Record<NafirKind, string> = {
  harvest: "Harvest",
  planting: "Planting",
  canal: "Clearing a canal or ditch",
  building: "Building",
  cleaning: "Cleaning and repairs",
  other: "Other work",
};

export interface NafirCall {
  id: string;
  organizer_id: string;
  display_name: string;
  kind: NafirKind;
  title: string;
  description: string;
  state: string;
  locality: string;
  starts_on: string;
  needed: number;
  hosting: string | null;
  bring_tools: string | null;
  canal_id: string | null;
  status: "open" | "done" | "cancelled";
  outcome: string | null;
  attended: number | null;
  created_at: string;
  closed_at: string | null;
}

export interface NafirJoin {
  call_id: string;
  user_id: string;
  display_name: string;
  brings: string | null;
  joined_at: string;
}

/* ───────────────────────── الفزعة ───────────────────────── */

export const FAZA_CAUSES = {
  flood: "سيلٌ أو فيضان",
  pest: "آفة",
  fire: "حريق",
  drought: "جفاف",
  livestock: "نفوق ماشية",
  illness: "مرضٌ أقعد صاحبه",
  other: "سببٌ آخر",
} as const;
export type FazaCause = keyof typeof FAZA_CAUSES;
export const FAZA_CAUSES_EN: Record<FazaCause, string> = {
  flood: "Flash flood or flooding",
  pest: "Pests",
  fire: "Fire",
  drought: "Drought",
  livestock: "Livestock deaths",
  illness: "Illness that laid the farmer up",
  other: "Another cause",
};

/** No cash on purpose — see the migration's «WHY NO MONEY». */
export const FAZA_NEEDS = {
  labor: "أيدٍ عاملة",
  tools: "آلات وأدوات",
  seeds: "بذور وتقاوي",
  transport: "ترحيل",
  advice: "مشورة وخبرة",
  other: "غير ذلك",
} as const;
export type FazaNeed = keyof typeof FAZA_NEEDS;
export const FAZA_NEEDS_EN: Record<FazaNeed, string> = {
  labor: "Labour",
  tools: "Machinery and tools",
  seeds: "Seed",
  transport: "Transport",
  advice: "Advice and know-how",
  other: "Something else",
};

export interface FazaRequest {
  id: string;
  requester_id: string;
  display_name: string;
  cause: FazaCause;
  title: string;
  description: string;
  state: string;
  locality: string;
  needs: FazaNeed[];
  status: "open" | "met" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface FazaPledge {
  id: string;
  request_id: string;
  pledger_id: string;
  display_name: string;
  kind: FazaNeed;
  detail: string;
  kept_at: string | null;
  created_at: string;
}

/* ───────────────────────── الشورى ───────────────────────── */

export interface ShuraItem {
  id: string;
  author_id: string;
  display_name: string;
  kind: "question" | "proposal";
  title: string;
  body: string;
  answer: string | null;
  answer_name: string | null;
  answered_at: string | null;
  created_at: string;
}

/* ───────────────────────── نبض الثقة ───────────────────────── */

/**
 * Four statements, 1–5, adapted from the World Bank's Integrated
 * Questionnaire for the Measurement of Social Capital (Grootaert et al. 2004,
 * Working Paper 18, Annex B). The authors warn that the classic «can people
 * be trusted» item translates badly, so the first statement uses their
 * willingness-to-help wording instead. Results are reported only in
 * aggregate, as they advise. The column names in trust_pulse are these keys.
 */
export const PULSE_QUESTIONS = [
  // SC-IQ Q9A: «Most people in this village are willing to help if you need it.»
  { key: "q_trust_people", text: "أغلب الناس في قريتي أو حيّي مستعدّون للمساعدة إن احتجتُ إليهم.", en: "Most people in my village or neighbourhood are willing to help if I need it." },
  { key: "q_trust_leaders", text: "أثق أنّ القادة في مجتمعي — رؤساء التعاونيات والمشايخ والإدارة — يعملون للصالح العام.", en: "I trust that the leaders in my community — cooperative heads, sheikhs and the local administration — work for the common good." },
  // SC-IQ Q14, with the water problem made a canal: «If there was a water
  // supply problem … how likely is it that people will cooperate?»
  { key: "q_help_expected", text: "لو تعطّلت قناة الريّ أو مورد الماء عندنا، سيتعاون الناس لإصلاحه.", en: "If our irrigation canal or water source broke down, people would cooperate to fix it." },
  // SC-IQ Q6.4: «how much impact do you think you have in making this village
  // a better place?» — the voice question, asked as the full questionnaire asks it.
  { key: "q_voice_heard", text: "لي أثرٌ ورأيٌ مسموع في جعل مكاني أفضل.", en: "I have an impact, and a voice that is heard, in making my place better." },
] as const;

export const PULSE_SCALE = ["لا أوافق أبداً", "لا أوافق", "بين بين", "أوافق", "أوافق تماماً"];
export const PULSE_SCALE_EN = ["Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"];

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export interface NafirIndicators {
  signers_leaders: number;
  signers_members: number;
  nafir_open: number;
  nafir_done: number;
  nafir_attended: number;
  faza_open: number;
  faza_met: number;
  pledges_total: number;
  pledges_kept: number;
  shura_total: number;
  shura_answered: number;
  shura_median_days: number | null;
  pulse_period: string;
  pulse_count: number;
  pulse_floor: number;
  pulse_trust_people: number | null;
  pulse_trust_leaders: number | null;
  pulse_help_expected: number | null;
  pulse_voice_heard: number | null;
}

/* ───────────────────────── عامّ ───────────────────────── */

export const ar = (n: number, locale: Locale = "ar") =>
  n.toLocaleString(locale === "en" ? "en-GB" : "ar", { maximumFractionDigits: 1 });

/** «منذ ٣ أيام» — the age of an unanswered question is the point of showing it. */
export function ageAr(iso: string, now = Date.now(), locale: Locale = "ar"): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (locale === "en") {
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${ar(days, "en")} days ago`;
  }
  if (days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${ar(days)} أيام`;
  return `منذ ${ar(days)} يوماً`;
}

export const dateAr = (iso: string, locale: Locale = "ar") =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Khartoum",
  });

/** The earliest day a nafir can be called for — the database refuses the past. */
export function tomorrowIso(now = Date.now()): string {
  return new Date(now + 86_400_000).toISOString().slice(0, 10);
}

/* ───────────────────────── الجودية ───────────────────────── */

export const JUDIYYA_KINDS = {
  water: "الماء ونوباته",
  boundary: "حدود الأرض",
  grazing: "المرعى ومرور الماشية",
  contract: "اتفاقٌ أو شراكة",
  other: "أمرٌ آخر",
} as const;
export type JudiyyaKind = keyof typeof JUDIYYA_KINDS;
export const JUDIYYA_KINDS_EN: Record<JudiyyaKind, string> = {
  water: "Water and watering turns",
  boundary: "Land boundaries",
  grazing: "Grazing and livestock passage",
  contract: "An agreement or partnership",
  other: "Another matter",
};

export const JUDIYYA_STATUS = {
  forming: "ينتظر الطرفين",
  active: "جارٍ",
  settled: "خُتم الصلح",
  withdrawn: "سُحب",
} as const;
export const JUDIYYA_STATUS_EN: Record<keyof typeof JUDIYYA_STATUS, string> = {
  forming: "Waiting for both parties",
  active: "Under way",
  settled: "Settlement sealed",
  withdrawn: "Withdrawn",
};

export interface JudiyyaMediator {
  user_id: string;
  display_name: string;
  state: string;
  about: string;
  verified_at: string | null;
}

export interface JudiyyaCase {
  id: string;
  opened_by: string;
  kind: JudiyyaKind;
  title: string;
  summary: string;
  state: string;
  locality: string;
  invite_token: string;
  status: keyof typeof JUDIYYA_STATUS;
  settlement: string | null;
  settled_by: string | null;
  settlement_name: string | null;
  settlement_at: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface JudiyyaParty {
  case_id: string;
  side: "a" | "b";
  user_id: string;
  display_name: string;
  committed_at: string | null;
  confirmed_at: string | null;
}

export interface JudiyyaPanelSeat {
  case_id: string;
  mediator_id: string;
  approved_a: boolean;
  approved_b: boolean;
  accepted_at: string | null;
}

/* ───────────────────────── الترع ───────────────────────── */

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CanalSummary {
  id: string;
  name: string;
  state: string;
  locality: string;
  description: string | null;
  members: number;
  feddans: number;
}

export interface CanalMember {
  canal_id: string;
  user_id: string;
  display_name: string;
  feddans: number;
  role: "member" | "steward";
  status: "pending" | "member";
  joined_at: string;
}

export interface CanalTurn {
  id: string;
  canal_id: string;
  user_id: string;
  weekday: number;
  starts: string;
  ends: string;
}

/**
 * Each member's share of the canal's maintenance, in proportion to the land it
 * waters — Ostrom's 2B, proportional equivalence between benefits and costs.
 * Pending applicants carry no share until a steward accepts them.
 */
export function maintenanceShares(members: CanalMember[]): Map<string, number> {
  const active = members.filter((m) => m.status === "member");
  const total = active.reduce((a, m) => a + Number(m.feddans), 0);
  return new Map(active.map((m) => [m.user_id, total > 0 ? Number(m.feddans) / total : 0]));
}
