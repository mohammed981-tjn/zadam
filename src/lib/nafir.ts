/**
 * النفير — القيمُ آلياتٍ تعمل.
 *
 * Everything the /nafir section says is here: the charter's text, the labels
 * of the closed lists the database checks, and the wording of the trust pulse.
 * The design and its sources are in docs/nafir-design-ar.md; the guards that
 * make the mechanisms trustworthy are in
 * supabase/migrations/20260925090000_nafir_values_at_work.sql.
 */

/* ───────────────────────── الولايات ───────────────────────── */

/** Must match is_sudan_state() in the migration, in the same spelling. */
export const SUDAN_STATES = [
  "الخرطوم", "الجزيرة", "سنار", "النيل الأزرق", "النيل الأبيض", "القضارف", "كسلا",
  "البحر الأحمر", "نهر النيل", "الشمالية", "شمال كردفان", "جنوب كردفان", "غرب كردفان",
  "شمال دارفور", "جنوب دارفور", "شرق دارفور", "غرب دارفور", "وسط دارفور",
] as const;

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
  },
  {
    title: "الفسيلة",
    text: "«إن قامت الساعة وفي يد أحدكم فسيلة فليغرسها» — نعمل ولو لم نرَ الثمرة، لأنّ العمل نفسه هو المطلوب.",
  },
  {
    title: "الإنسان والتراب والوقت",
    text: "يرى مالك بن نبي أنّ الحضارة إنسانٌ وترابٌ ووقت، لا تتفاعل إلا بفكرةٍ دافعة. التراب عندنا وفير، والوقت يضيع، والإنسان ينتظر فكرةً تجمعه.",
  },
  {
    title: "ما نعرفه من أهلنا",
    text: "النفير، والفزعة، والجودية — قيمٌ يعيشها الريف السوداني قبل أن تُكتب. نحن لا نستورد قيماً؛ نعطي ما عندنا أداةً أوسع.",
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
  },
  {
    key: "qudwa",
    title: "القدوة",
    root: "«أتأمرون الناس بالبرّ وتنسون أنفسكم»",
    commitment: "لا أطلب من الناس عملاً لا أحضره.",
    practice: "القائد يدعو إلى النفير ويحضره، ويظهر ذلك في سجلّ النفير.",
    href: "/nafir",
  },
  {
    key: "sidq",
    title: "الصدق والشفافية",
    root: "«كونوا مع الصادقين»",
    commitment: "لا أعلن رقماً بلا مصدره، ولا أُخفي خسارة.",
    practice: "مؤشّرات النفير عامّةٌ للجميع، وأرقام المنصّة كلّها بمصدرها.",
    href: "/nafir#indicators",
  },
  {
    key: "shura",
    title: "الشورى",
    root: "«وأمرُهم شورى بينهم»",
    commitment: "أسمع قبل أن أقرّر، وأُجيب علناً عمّا أُسأل عنه.",
    practice: "كلّ سؤالٍ في الشورى يبقى ظاهراً بعمره حتى يُجاب.",
    href: "/nafir/shura",
  },
  {
    key: "adl",
    title: "العدل في العائد",
    root: "«اعدلوا هو أقرب للتقوى»",
    commitment: "أعلن قاعدة توزيع العائد قبل الموسم لا بعده.",
    practice: "سؤال «كيف يُوزَّع العائد؟» يُطرح في الشورى ويُجاب قبل الزراعة.",
    href: "/nafir/shura",
  },
  {
    key: "sabr",
    title: "طول النفس",
    root: "حديث الفسيلة",
    commitment: "أعمل لعشر سنين، ولا ألغي الخطة عند أوّل تعثّر.",
    practice: "المؤشّرات تُقرأ موسماً بعد موسم، لا يوماً بيوم.",
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
  },
  {
    key: "faza",
    title: "الفزعة",
    root: "«من نفّس عن مؤمنٍ كربة…»",
    commitment: "إذا أصابت جاري جائحةٌ فزعتُ له بما أملك من يدٍ أو آلةٍ أو بذر.",
    practice: "طلبات الفزعة: عونٌ غير ماليّ يُعاهَد عليه.",
    href: "/nafir/faza",
  },
  {
    key: "wafa",
    title: "الأمانة في الوعد",
    root: "«وأوفوا بالعهد إنّ العهد كان مسؤولاً»",
    commitment: "إذا عاهدتُ وفيت، ولا أعِد بما لا أقدر عليه.",
    practice: "العهد يُعدّ موفىً حين يشهد بذلك مَن عوهد، لا مَن عاهَد.",
    href: "/nafir/faza",
  },
  {
    key: "itqan",
    title: "الإتقان",
    root: "«إنّ الله يحبّ إذا عمل أحدكم عملاً أن يتقنه»",
    commitment: "أعمل عملي كأنّ الناس سيرونه، لأنهم سيرونه.",
    practice: "كلّ نفيرٍ يُغلق بما أُنجز فعلاً، ويُنشر ذلك.",
    href: "/nafir",
  },
  {
    key: "karama",
    title: "الكرامة والملكية",
    root: "«من أحيا أرضاً ميتةً فهي له»",
    commitment: "أنا شريكٌ في ما أزرع، أُسأل وأَسأل.",
    practice: "لكلّ عضوٍ صوتٌ في الشورى، وسجلُّ أرضه وموسمه باسمه.",
    href: "/nafir/shura",
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
  { key: "q_trust_people", text: "أغلب الناس في قريتي أو حيّي مستعدّون للمساعدة إن احتجتُ إليهم." },
  { key: "q_trust_leaders", text: "أثق أنّ القادة في مجتمعي — رؤساء التعاونيات والمشايخ والإدارة — يعملون للصالح العام." },
  // SC-IQ Q14, with the water problem made a canal: «If there was a water
  // supply problem … how likely is it that people will cooperate?»
  { key: "q_help_expected", text: "لو تعطّلت قناة الريّ أو مورد الماء عندنا، سيتعاون الناس لإصلاحه." },
  // SC-IQ Q6.4: «how much impact do you think you have in making this village
  // a better place?» — the voice question, asked as the full questionnaire asks it.
  { key: "q_voice_heard", text: "لي أثرٌ ورأيٌ مسموع في جعل مكاني أفضل." },
] as const;

export const PULSE_SCALE = ["لا أوافق أبداً", "لا أوافق", "بين بين", "أوافق", "أوافق تماماً"];

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

export const ar = (n: number) => n.toLocaleString("ar", { maximumFractionDigits: 1 });

/** «منذ ٣ أيام» — the age of an unanswered question is the point of showing it. */
export function ageAr(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${ar(days)} أيام`;
  return `منذ ${ar(days)} يوماً`;
}

export const dateAr = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("ar", {
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

export const JUDIYYA_STATUS = {
  forming: "ينتظر الطرفين",
  active: "جارٍ",
  settled: "خُتم الصلح",
  withdrawn: "سُحب",
} as const;

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
