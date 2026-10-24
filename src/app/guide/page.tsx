import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CROPS,
  STATIONS,
  IRRIGATION_EFFICIENCY,
  IRRIGATION_LABEL,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { STAGE_TEMPLATES, LEDGER_LABEL, type StageKey } from "@/lib/season";
import { assessProject, WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import { computeTrust } from "@/lib/trust";
import { RISK_WEIGHTS, type RiskProfile } from "@/lib/portfolio";
import { investmentLive } from "@/lib/platformFlags";
import FilmPlayer from "@/components/FilmPlayer";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";

/*
 * The guide reads the platform instead of describing it from memory.
 *
 * A user guide written as prose starts accurate and drifts: a stage's budget
 * share changes, a factor is reweighted, a crop is added, and the page keeps
 * saying what used to be true — which is worse than having no guide, because a
 * reader has no way to tell. So every number here comes from the module the
 * platform itself runs on, and the counts come from the database at request
 * time. Change a weight and this page changes with it.
 */

export async function generateMetadata() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return {
    title: t("دليل الاستخدام | سوداقري", "User guide | Sudagri"),
    description: t(
      "شرح كامل لكل أداة في سوداقري: المساعد، وحاسبة المياه، وتسجيل الأرض، وإدارة الموسم، وسجلّ إثبات المنشأ — وما يعمل الآن وما لم يُفتح بعد.",
      "A full explanation of every tool on Sudagri: the assistant, the water calculator, land registration, season management and the proof-of-origin register — and what works now and what is not open yet.",
    ),
  };
}

const pctOf = (locale: Locale) => (v: number) =>
  `${Math.round(v * 100)}${locale === "en" ? "%" : "٪"}`;

/*
 * English names for what the guide reads from the platform's modules. They are
 * keyed by the modules' own keys, so a crop, station or factor added there
 * still appears here — under its Arabic name until it is given an English one.
 */
const CROP_EN: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize",
  cotton: "Cotton",
  groundnut: "Groundnut",
  sesame: "Sesame",
  alfalfa: "Alfalfa",
  onion: "Onion",
  tomato: "Tomato",
  sugarcane: "Sugarcane",
  millet: "Millet",
  dates: "Date palm",
};

const STATION_EN: Record<string, string> = {
  khartoum: "Khartoum",
  gezira: "Gezira (Wad Madani)",
  rivernile: "River Nile (Atbara)",
  northern: "Northern (Dongola)",
  kordofan: "North Kordofan (El Obeid)",
  kassala: "Kassala",
  nyala: "South Darfur (Nyala)",
  elfasher: "North Darfur (El Fasher)",
  damazin: "Blue Nile (Ed Damazin)",
  kosti: "White Nile (Kosti)",
  geneina: "West Darfur (El Geneina)",
  zalingei: "Central Darfur (Zalingei)",
  eddaein: "East Darfur (Ed Daein)",
  kurmuk: "Blue Nile (Kurmuk)",
  sennar: "Sennar",
};

const IRRIGATION_EN: Record<IrrigationMethod, string> = {
  flood: "Flood irrigation",
  sprinkler: "Sprinkler irrigation",
  pivot: "Centre pivot",
  drip: "Drip irrigation",
};

const WATER_SOURCE_EN: Record<WaterSource, string> = {
  canal: "Canal from a dam or river",
  river_pump: "Direct pumping from the river",
  borehole: "Boreholes (groundwater)",
  rainfed: "Fully rain-fed",
};

const LEDGER_EN: Record<string, string> = {
  seeds: "Seeds",
  fertiliser: "Fertiliser",
  pesticide: "Pesticides",
  labour: "Labour",
  irrigation: "Irrigation and fuel",
  transport: "Transport",
  other: "Other",
  revenue: "Revenue",
};

const STAGE_EN: Record<StageKey, { name: string; activities: string[] }> = {
  land_prep: {
    name: "Land preparation",
    activities: [
      "Ploughing and levelling",
      "Opening canals or laying irrigation lines",
      "Base fertiliser",
    ],
  },
  planting: {
    name: "Planting",
    activities: [
      "Buying certified seed",
      "Seed treatment",
      "Sowing and the first irrigation",
    ],
  },
  establishment: {
    name: "Germination and establishment",
    activities: ["Checking germination", "Gap filling", "First weeding"],
  },
  vegetative: {
    name: "Vegetative growth",
    activities: [
      "Nitrogen fertiliser",
      "Regular irrigation",
      "Pest monitoring",
    ],
  },
  flowering: {
    name: "Flowering and fruiting",
    activities: [
      "Irrigating exactly on time — the stage most sensitive to water stress",
      "Potassium fertiliser",
      "Control of flowering pests",
    ],
  },
  maturity: {
    name: "Maturity",
    activities: [
      "Reducing irrigation gradually",
      "Preparing for harvest",
      "Estimating expected yield",
    ],
  },
  harvest: {
    name: "Harvest and after",
    activities: [
      "Harvesting",
      "Drying and cleaning",
      "Storage or delivery to the buyer",
    ],
  },
};

const FACTOR_EN: Record<string, string> = {
  water_adequacy: "Water adequacy",
  water_source: "Water source reliability",
  documents: "Documentation completeness",
  operator: "Operator track record",
  price: "Price stability",
  access: "Market access",
  experience: "Experience on the platform",
  evidence: "Discipline in documenting",
  punctuality: "Keeping to schedule",
  budget: "Budget control",
  outcome: "Season results",
};

/*
 * Both scorers report their own factor labels and weights, so the guide asks
 * them rather than repeating numbers that would then have to be kept in step.
 * The inputs below exist only to make the scorers return their factor list;
 * none of these values is shown to the reader.
 */
const RISK_FACTORS = assessProject({
  cropKey: "wheat",
  stationKey: "gezira",
  plantingMonth: 10,
  irrigation: "flood",
  waterSource: "canal",
  declaredWaterPerFeddan: 3600,
  documentsOnFile: 4,
  documentsRequired: 4,
  operatorSeasons: 3,
  operatorReportingRate: 1,
  kmToMarket: 10,
}).factors;

const TRUST_FACTORS = computeTrust([
  {
    status: "completed",
    feddans: 10,
    plannedBudget: 1000,
    actualCosts: 1000,
    revenue: 1500,
    stagesTotal: 7,
    stagesCompleted: 7,
    stagesWithEvidence: 7,
    stagesDated: 7,
    stagesOnTime: 7,
  },
]).factors;

const STAGE_ORDER: StageKey[] = [
  "land_prep",
  "planting",
  "establishment",
  "vegetative",
  "flowering",
  "maturity",
  "harvest",
];

const SECTIONS = [
  ["status", "ما يعمل الآن وما لم يُفتح بعد", "What works now and what is not open yet"],
  ["account", "إنشاء الحساب والدخول", "Creating an account and signing in"],
  ["nav", "التنقّل داخل المنصة", "Finding your way around"],
  ["assistant", "مساعد سوداقري", "The Sudagri assistant"],
  ["water", "حاسبة الاحتياج المائي", "The water requirement calculator"],
  ["lands", "تسجيل الأرض وتوثيقها", "Registering and documenting land"],
  ["seasons", "إدارة الموسم الزراعي", "Managing the farming season"],
  ["trust", "مؤشر ثقة المنفّذ", "The operator trust score"],
  ["opportunity", "رفع فرصة استثمارية", "Submitting an investment opportunity"],
  ["investor", "للمستثمر: المشاريع والمحفظة", "For investors: projects and portfolio"],
  ["mining", "التعدين وسجلّ إثبات المنشأ", "Mining and the proof-of-origin register"],
  ["admin", "لوحة الإدارة", "The admin panel"],
  ["privacy", "الخصوصية ومن يرى ماذا", "Privacy: who sees what"],
  ["limits", "حدود المنصة", "What the platform does not do"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function Section({
  id,
  title,
  who,
  children,
}: {
  id: string;
  title: string;
  who?: string[];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-border pt-10">
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {who && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {who.map((w) => (
            <li
              key={w}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {w}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Note({
  title,
  tone = "plain",
  children,
}: {
  title?: string;
  tone?: "plain" | "warn" | "flag";
  children: React.ReactNode;
}) {
  const skin =
    tone === "warn"
      ? "border-danger/40 bg-danger/5"
      : tone === "flag"
        ? "border-accent/40 bg-accent/10"
        : "border-border bg-card";
  const heading =
    tone === "warn"
      ? "text-danger"
      : tone === "flag"
        ? "text-accent"
        : "text-foreground";

  return (
    <div className={`rounded-2xl border p-5 ${skin}`}>
      {title && <h3 className={`mb-2 font-bold ${heading}`}>{title}</h3>}
      <div className="flex flex-col gap-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card text-start">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map(([t, body], i) => (
        <li key={t} className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {i + 1}
          </span>
          <div>
            <p className="font-bold">{t}</p>
            <p className="text-muted">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A factor list with its weights drawn as a bar, used by both scorers. */
function Weights({
  factors,
  locale,
}: {
  factors: { key: string; label: string; weight: number; detail?: string }[];
  locale: Locale;
}) {
  const sorted = [...factors].sort((a, b) => b.weight - a.weight);
  return (
    <ul className="flex flex-col gap-4">
      {sorted.map((f) => (
        <li key={f.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">
              {locale === "en" ? (FACTOR_EN[f.key] ?? f.label) : f.label}
            </span>
            <span className="flex-none text-xs text-muted">
              {locale === "en" ? `${f.weight} of 100` : `${f.weight} من 100`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${f.weight}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {children}
    </span>
  );
}

export default async function GuidePage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const pct = pctOf(locale);
  const title = (id: SectionId) => {
    const row = SECTIONS.find((r) => r[0] === id)!;
    return en ? row[2] : row[1];
  };
  const crop = (c: { key: string; name: string }) =>
    en ? (CROP_EN[c.key] ?? c.name) : c.name;
  const station = (c: { key: string; name: string }) =>
    en ? (STATION_EN[c.key] ?? c.name) : c.name;
  const irrigation = (m: IrrigationMethod) =>
    en ? IRRIGATION_EN[m] : IRRIGATION_LABEL[m];
  const waterSource = (w: WaterSource) =>
    en ? WATER_SOURCE_EN[w] : WATER_SOURCE_LABEL[w];

  const LIVE = <Pill tone="bg-primary/10 text-primary">{t("يعمل", "Live")}</Pill>;
  const SHUT = <Pill tone="bg-danger/10 text-danger">{t("مغلق", "Closed")}</Pill>;
  const SOON = <Pill tone="bg-accent/15 text-accent">{t("لاحقاً", "Later")}</Pill>;

  const ALL = t("للجميع", "Everyone");
  const FARMER = t("للمزارع", "Farmers");
  const INVESTOR = t("للمستثمر", "Investors");
  const MINER = t("للمعدّن", "Miners");

  const supabase = await createClient();
  const INVESTMENT_LIVE = await investmentLive(supabase);

  // Read at request time so the status section is true when it is read, not
  // when it was written.
  const [{ count: knowledgeCount }, { count: projectCount }] =
    await Promise.all([
      supabase
        .from("knowledge_entries")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .neq("status", "draft"),
    ]);

  const openProjects = projectCount ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="pb-8">
        <p className="text-sm font-medium text-primary">{t("دليل الاستخدام", "User guide")}</p>
        <h1 className="mt-2 text-2xl font-black leading-snug sm:text-3xl">
          {t("كل ما في سوداقري، وكيف تستعمله", "Everything on Sudagri, and how to use it")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {t(
            "منصة واحدة تجمع معرفة زراعية موثّقة، وأدوات حساب حقيقية للمزارع، وسجلاً لإثبات منشأ الذهب — ومسار استثمار زراعي شفاف قيد البناء. هذا الدليل يشرح كل شاشة، وما تفعله بالضبط، وما لا تفعله.",
            "One platform that brings together documented farming knowledge, real calculation tools for farmers, and a register that proves where gold came from — with a transparent agricultural investment path under construction. This guide explains every screen, exactly what it does, and what it does not do.",
          )}
        </p>
      </header>

      <figure className="my-6">
        <FilmPlayer
          base="/video/inhand-wide"
          poster="/video/inhand-wide.jpg"
          label={t(
            "فيلم سوداقري: معلومتك في يدك — المنصّة في يد أسرة",
            "Sudagri film: your information in your hand — the platform in a family's hands",
          )}
        />
      </figure>

      <nav
        aria-label={t("محتويات الدليل", "Guide contents")}
        className="rounded-2xl border border-border bg-card p-5"
      >
        <p className="mb-3 text-xs font-medium text-muted">{t("المحتويات", "Contents")}</p>
        <ol className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {SECTIONS.map(([id]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-sm transition hover:text-primary"
              >
                {title(id)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex flex-col gap-10">
        {/* ---------------- status ---------------- */}
        <Section id="status" title={title("status")}>
          <p className="text-muted">
            {t(
              "المنصة في مرحلة بناء، وهذا الجدول يقول أين وصل كل جزء. لا شيء هنا معروض على أنه جاهز وهو ليس كذلك.",
              "The platform is being built, and this table says how far each part has got. Nothing here is presented as ready when it is not.",
            )}
          </p>
          <Table
            head={[
              t("الجزء", "Part"),
              t("الحالة", "Status"),
              t("ما يعنيه عملياً", "What it means in practice"),
            ]}
            rows={[
              [
                t("قاعدة المعرفة", "Knowledge base"),
                LIVE,
                en
                  ? `${knowledgeCount ?? 0} entries, open to everyone without signing up.`
                  : `${knowledgeCount ?? 0} مُدخلاً، مفتوحة للجميع بلا تسجيل.`,
              ],
              [t("مساعد سوداقري", "Sudagri assistant"), LIVE, t("يجيب فوراً وبلا تسجيل.", "Answers immediately, no sign-up needed.")],
              [t("حاسبة الاحتياج المائي", "Water requirement calculator"), LIVE, t("حساب كامل بلا تسجيل.", "Full calculation, no sign-up needed.")],
              [t("تسجيل الأراضي وتوثيقها", "Land registration and documentation"), LIVE, t("يتطلب حساباً.", "Requires an account.")],
              [t("تخطيط الموسم ودفتر الحسابات", "Season planning and the ledger"), LIVE, t("يتطلب حساباً.", "Requires an account.")],
              [t("سجلّ إثبات المنشأ", "Proof-of-origin register"), LIVE, t("يتطلب حساباً.", "Requires an account.")],
              [t("رفع فرصة للمراجعة", "Submitting an opportunity for review"), LIVE, t("تُراجَع من الإدارة قبل أي نشر.", "Reviewed by the team before anything is published.")],
              [
                t("الاستثمار بالمال", "Investing money"),
                INVESTMENT_LIVE ? LIVE : SHUT,
                INVESTMENT_LIVE
                  ? t("مفتوح.", "Open.")
                  : t(
                      "لا يمكن ضخّ أي مبلغ اليوم — الرفض مبني في الخادم لا في إخفاء زر.",
                      "No money can be put in today — the refusal is built into the server, not done by hiding a button.",
                    ),
              ],
              [
                t("المشاريع المطروحة", "Listed projects"),
                openProjects > 0 ? LIVE : SHUT,
                openProjects > 0
                  ? en
                    ? `${openProjects} projects listed now.`
                    : `${openProjects} مشروعاً معروضاً الآن.`
                  : t(
                      "لا يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً.",
                      "No project is listed before it is legally documented and inspected in the field.",
                    ),
              ],
              [
                t("التحقق من الجوال برسالة", "Phone verification by SMS"),
                SOON,
                t(
                  "الرقم اليوم مُعرِّف اخترته أنت، لا رقم أثبتت المنصة ملكيتك له.",
                  "Today the number is an identifier you chose, not a number the platform has proved is yours.",
                ),
              ],
            ]}
          />
          {!INVESTMENT_LIVE && (
            <Note title={t("لماذا الاستثمار مغلق؟", "Why is investing closed?")} tone="flag">
              <p>
                {t(
                  "لأن فتحه قبل وجود مشاريع موثّقة قانونياً وترتيب حقيقي لحفظ الأموال يعني جمع مال على وعد. المنصة تبني أولاً ما يُثبت المشروع — التوثيق، والمعاينة، وسجل المنفّذ، والأدلة المصوّرة — ثم تفتح الباب.",
                  "Because opening it before there are legally documented projects and a real arrangement for holding funds would mean collecting money on a promise. The platform first builds what proves a project — documentation, inspection, the operator's track record and photo evidence — and then opens the door.",
                )}
              </p>
            </Note>
          )}
        </Section>

        {/* ---------------- account ---------------- */}
        <Section id="account" title={title("account")} who={[ALL]}>
          <p className="text-muted">
            {t(
              "المعرفة والحاسبة والمساعد لا تحتاج حساباً. الحساب مطلوب لتسجيل أرض، أو إدارة موسم، أو استخدام سجلّ الذهب.",
              "The knowledge base, the calculator and the assistant need no account. You need one to register land, manage a season or use the gold register.",
            )}
          </p>

          <h3 className="font-bold">{t("التسجيل برقم الجوال", "Signing up with a phone number")}</h3>
          <Steps
            items={[
              [
                t("افتح صفحة إنشاء حساب", "Open the sign-up page"),
                t("من القائمة ← حسابك ← إنشاء حساب.", "From the menu → Your account → Create account."),
              ],
              [
                t("اكتب اسمك الكامل", "Write your full name"),
                t(
                  "هذا الاسم هو ما يظهر للمستثمرين على صفحة سجلّك إن أدرت مواسم.",
                  "This is the name investors see on your track-record page if you manage seasons.",
                ),
              ],
              [
                t("اختر الدولة واكتب رقمك", "Choose the country and enter your number"),
                t(
                  "اكتبه كما تكتبه دائماً — المنصة تتكفّل بالباقي.",
                  "Write it the way you always do — the platform handles the rest.",
                ),
              ],
              [t("اختر كلمة مرور", "Choose a password"), t("ستة أحرف على الأقل.", "At least six characters.")],
              [
                t("اضغط إنشاء الحساب", "Press Create account"),
                t(
                  "يُفتح الحساب فوراً. لا رسالة تنتظرها ولا رمز تأكيد.",
                  "The account opens immediately. No message to wait for and no confirmation code.",
                ),
              ],
            ]}
          />

          <h3 className="mt-2 font-bold">{t("كيف يقرأ النظام رقمك", "How the system reads your number")}</h3>
          <p className="text-muted">
            {t(
              "الرقم السوداني يُكتب محلياً بصفر في أوله، وصيغته الدولية تحذف ذلك الصفر. النظام يتولى هذا بدل أن يرفض رقمك:",
              "A Sudanese number is written locally with a leading zero, and the international form drops that zero. The system deals with this instead of rejecting your number:",
            )}
          </p>
          <Table
            head={[t("ما تكتبه", "What you type"), t("النتيجة", "Result")]}
            rows={[
              ["0912345678", t("مقبول — الصفر الأول يُحذف تلقائياً", "Accepted — the leading zero is removed automatically")],
              ["0912 345 678", t("مقبول — المسافات والشُرَط تُتجاهل", "Accepted — spaces and dashes are ignored")],
              ["٠٩١٢٣٤٥٦٧٨", t("مقبول — الأرقام العربية تُحوَّل", "Accepted — Arabic-Indic digits are converted")],
              ["+249912345678", t("مقبول — الرقم الدولي الملصوق يعمل", "Accepted — a pasted international number works")],
              [
                "091234567",
                t(
                  "مرفوض — ويقول لك كم رقماً تحتاج الدولة وكم أدخلتَ",
                  "Rejected — and it tells you how many digits the country needs and how many you entered",
                ),
              ],
            ]}
          />
          <p>
            {t(
              "الرفض مقصود: حساب أُنشئ برقم فيه خطأ مطبعي لا يستطيع صاحبه الدخول إليه مرة أخرى.",
              "The rejection is deliberate: an account created with a mistyped number is one its owner can never sign in to again.",
            )}
          </p>

          <h3 className="mt-2 font-bold">{t("التسجيل بالبريد الإلكتروني", "Signing up with email")}</h3>
          <p>
            {t(
              "بديل متاح من الرابط أسفل صفحة التسجيل، ومفيد للمغتربين الذين يفضّلونه.",
              "An alternative available from the link at the bottom of the sign-up page, useful for Sudanese abroad who prefer it.",
            )}
          </p>
          <Note title={t("رسالة التفعيل ليست احتيالاً", "The activation email is not a scam")} tone="warn">
            <p>
              {t(
                "إن وصلتك رسالة تفعيل عند التسجيل بالبريد فستكون بالإنجليزية وباسم خدمة الاستضافة التقنية (Supabase) لا باسم سوداقري. هذا طبيعي ومتوقّع — افتحها واضغط الرابط.",
                "If you receive an activation email when you sign up by email, it will come in the name of the technical hosting service (Supabase), not Sudagri. That is normal and expected — open it and press the link.",
              )}
            </p>
          </Note>

          <Note title={t("فرق مهم بين الطريقتين", "An important difference between the two")} tone="flag">
            {en ? (
              <p>
                An email account can be recovered if you forget its password. A
                phone account{" "}
                <strong>cannot be recovered yet</strong> — there is no text
                message carrying a code and no email to receive a link. So if
                you will be running the platform, use an email account.
              </p>
            ) : (
              <p>
                حساب البريد يمكن استرجاعه إن نسيت كلمة مروره. حساب الجوال{" "}
                <strong>لا يمكن استرجاعه بعد</strong> — لا رسالة نصية تحمل رمزاً
                ولا بريد يصله رابط. فإن كنت ستدير المنصة، اجعل حسابك بالبريد.
              </p>
            )}
          </Note>
        </Section>

        {/* ---------------- nav ---------------- */}
        <Section id="nav" title={title("nav")} who={[ALL]}>
          {en ? (
            <p className="text-muted">
              Everything is behind the <strong>Menu</strong> button at the top
              of the page, divided into groups that change with your status.
            </p>
          ) : (
            <p className="text-muted">
              كل شيء خلف زرّ <strong>القائمة</strong> أعلى الصفحة، مقسّم إلى
              مجموعات تتغيّر بحسب حالتك.
            </p>
          )}
          <Table
            head={[t("المجموعة", "Group"), t("ما بداخلها", "What it contains"), t("تظهر لـ", "Shown to")]}
            rows={[
              [
                t("الزراعة", "Farming"),
                t("الرئيسية · حاسبة الاحتياج المائي · هذا الدليل", "Home · Water requirement calculator · This guide"),
                t("الجميع", "Everyone"),
              ],
              [
                t("التعدين", "Mining"),
                t("قسم التعدين · سجلّ إثبات المنشأ", "Mining section · Proof-of-origin register"),
                t("الجميع", "Everyone"),
              ],
              [
                t("حسابك", "Your account"),
                t("تسجيل الدخول · إنشاء حساب", "Sign in · Create account"),
                t("غير المسجّلين", "Signed-out visitors"),
              ],
              [
                t("أرضي", "My land"),
                t("أراضيّ · مواسمي · ارفع فرصة", "My lands · My seasons · Submit an opportunity"),
                t("المسجّلين", "Signed-in users"),
              ],
              [
                t("استثماري", "My investments"),
                t("محفظتي · خطط استثمارك", "My portfolio · Plan your investment"),
                t("المسجّلين", "Signed-in users"),
              ],
              [
                t("الإدارة", "Admin"),
                t(
                  "لوحة المشاريع · مراجعة الفرص · التحليلات · العملاء المحتملون",
                  "Projects panel · Opportunity review · Analytics · Leads",
                ),
                t("الإداريين فقط", "Administrators only"),
              ],
            ]}
          />
          <p>
            {t(
              "وفي أعلى القائمة زرّ ثابت لفتح المساعد. وبجانب زرّ القائمة يظهر للمسجّلين جرس الإشعارات وعليه عدد ما لم تقرأه — وتصلك عند كل حدث يخصّك: رفع أرضك للمراجعة، اعتمادها أو رفضها مع سببه، ورفع فرصتك واعتمادها أو رفضها.",
              "At the top of the menu is a fixed button that opens the assistant. Next to the menu button, signed-in users see the notification bell with the number of unread notices — you get one for every event that concerns you: your land submitted for review, approved or rejected with the reason, and your opportunity submitted, approved or rejected.",
            )}
          </p>
        </Section>

        {/* ---------------- assistant ---------------- */}
        <Section
          id="assistant"
          title={title("assistant")}
          who={[FARMER, INVESTOR, MINER]}
        >
          <p className="text-muted">
            {t(
              "زرّ عائم في كل صفحة، وأول عنصر في القائمة. اسأله بالعربية عن أي محصول أو ماشية أو تربة أو ريّ أو آفة أو تعدين.",
              "A floating button on every page, and the first item in the menu. Ask it about any crop, livestock, soil, irrigation, pest or mining question.",
            )}
          </p>
          <h3 className="font-bold">{t("من أين تأتي الإجابة", "Where the answer comes from")}</h3>
          <p className="text-muted">
            {t(
              "المساعد لا يمرّ بمحرك الذكاء الاصطناعي إلا عند الضرورة. يجرّب بالترتيب:",
              "The assistant only goes to the AI model when it has to. It tries, in order:",
            )}
          </p>
          <Steps
            items={[
              [
                t("جواب من المنصة نفسها", "An answer from the platform itself"),
                t(
                  "أسئلة مثل «ما المطروح للاستثمار؟» أو «كم يحتاج القمح من المياه؟» تُجاب من بيانات المنصة وحساباتها مباشرة — فورية، بلا تكلفة، ويستحيل أن تُختلق.",
                  "Questions such as “What is open for investment?” or “How much water does wheat need?” are answered straight from the platform's data and calculations — instant, free, and impossible to make up.",
                ),
              ],
              [
                t("مُدخل من قاعدة المعرفة", "A knowledge base entry"),
                t(
                  "إن كان هناك مُدخل موثّق يجيب على سؤالك بدقة، يُعرض هو.",
                  "If a documented entry answers your question precisely, that entry is shown.",
                ),
              ],
              [
                t("إجابة محفوظة", "A saved answer"),
                t(
                  "الزوار يكرّرون أسئلة بعضهم، فالسؤال المُجاب سابقاً يُخدَم من الذاكرة.",
                  "Visitors repeat each other's questions, so a question answered before is served from memory.",
                ),
              ],
              [
                t("محرك المعرفة العامة", "The general-knowledge model"),
                t(
                  "وما بقي يُرسل للنموذج الذكي، وتبدأ إجابته بعبارة صريحة تقول إن المصدر خارج قاعدة المنصة المتحقق منها.",
                  "Anything left goes to the AI model, and its answer opens with a plain statement that the source is outside the platform's verified base.",
                ),
              ],
            ]}
          />
          <Note title={t("ماذا لو تعطّل المحرك الذكي؟", "What if the AI model is down?")}>
            <p>
              {t(
                "لا تخرج بيدين فارغتين: يعرض المساعد أقرب المُدخلات الموثّقة لسؤالك، موسومة بأنها تقريبية. التعطّل يكلّفك الإجابات العامة فقط، لا المساعد كله.",
                "You don't leave empty-handed: the assistant shows the documented entries closest to your question, marked as approximate. An outage costs you only the general answers, not the whole assistant.",
              )}
            </p>
          </Note>
          <h3 className="font-bold">{t("قواعد تحكم إجاباته", "Rules that govern its answers")}</h3>
          <ul className="list-disc space-y-1.5 ps-5 text-muted">
            <li>
              {t(
                "لا يختلق فرصة استثمارية ولا سعر حصة ولا عائداً غير موجود في البيانات.",
                "It never invents an investment opportunity, a share price or a return that is not in the data.",
              )}
            </li>
            <li>
              {t(
                "يفرّق بين «هل أستطيع الاستثمار في الجزيرة؟» — سؤال عن حالة المنصة — و«حدّثني عن الزراعة في الجزيرة؟» وهو سؤال معرفة يستحق إجابة وافية.",
                "It tells apart “Can I invest in the Gezira?” — a question about the platform's status — and “Tell me about farming in the Gezira”, a knowledge question that deserves a full answer.",
              )}
            </li>
            <li>
              {t(
                "يذكر الدولة المرجعية للمعلومة، وينبّه متى تحتاج تحققاً محلياً.",
                "It names the reference country for the information and warns when it needs local checking.",
              )}
            </li>
            <li>{t("لا يعطي نصيحة مالية قاطعة.", "It does not give definitive financial advice.")}</li>
          </ul>
          <p className="text-muted">
            {t(
              "وكل سؤال يُسجَّل بلا هويّة صاحبه، ليعرف الفريق ما تعجز قاعدة المعرفة عن الإجابة عنه فيكتبه.",
              "Every question is logged without the asker's identity, so the team can see what the knowledge base cannot answer and write it.",
            )}
          </p>
        </Section>

        {/* ---------------- water ---------------- */}
        <Section
          id="water"
          title={title("water")}
          who={[FARMER, INVESTOR]}
        >
          <p className="text-muted">
            {t(
              "تعمل بلا تسجيل، وتجيب على السؤال الذي تُبنى عليه بقية الأرقام: كم متراً مكعباً يحتاج هذا المحصول في هذه المنطقة بهذه الطريقة؟",
              "It works without signing up, and answers the question every other number rests on: how many cubic metres does this crop need, in this region, with this method?",
            )}
          </p>
          <Table
            head={[t("ما تُدخله", "What you enter"), t("الخيارات المتاحة", "Available options")]}
            rows={[
              [t("المحصول", "Crop"), CROPS.map(crop).join(" · ")],
              [t("المنطقة", "Region"), STATIONS.map(station).join(" · ")],
              [t("شهر الزراعة", "Planting month"), t("أي شهر من السنة", "Any month of the year")],
              [
                t("طريقة الري", "Irrigation method"),
                (Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[])
                  .map(irrigation)
                  .join(" · "),
              ],
              [t("المساحة", "Area"), t("بالفدان", "In feddans (1 feddan ≈ 0.42 ha)")],
            ]}
          />
          <h3 className="font-bold">{t("ما تحصل عليه", "What you get")}</h3>
          <ul className="list-disc space-y-1.5 ps-5 text-muted">
            <li>{t("احتياج الفدان للموسم كاملاً بالمتر المكعب.", "The water need per feddan for the whole season, in cubic metres.")}</li>
            <li>{t("الإجمالي لمساحتك كلها.", "The total for your whole area.")}</li>
            <li>
              {t(
                "ذروة الطلب اليومي باللتر في الثانية — وهي التي تحدد حجم المضخة.",
                "Peak daily demand in litres per second — the figure that sets the pump size.",
              )}
            </li>
            <li>{t("جدول شهري باستهلاك المحصول في كل شهر.", "A monthly table of the crop's water use.")}</li>
            <li>{t("نطاق العائد المتوقع لهذا المحصول.", "The expected return range for this crop.")}</li>
          </ul>
          <h3 className="font-bold">{t("كيف يُحسب", "How it is calculated")}</h3>
          <p>
            {t(
              "على معيار منشور تستطيع مراجعته: ورقة منظمة الأغذية والزراعة رقم ٥٦ (FAO-56). يُحسب البخر–نتح المرجعي من الحرارة وخط العرض، ثم يُضرب في معامل المحصول في كل مرحلة، ثم يُطرح منه المطر الفعّال، ثم يُقسم على كفاءة طريقة الري.",
              "On a published standard you can check: the Food and Agriculture Organization's Paper No. 56 (FAO-56). Reference evapotranspiration is calculated from temperature and latitude, multiplied by the crop coefficient at each stage, effective rainfall is subtracted, and the result is divided by the efficiency of the irrigation method.",
            )}
          </p>
          <Table
            head={[t("طريقة الري", "Irrigation method"), t("كفاءة الإيصال", "Delivery efficiency")]}
            rows={(Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[]).map(
              (m) => [irrigation(m), pct(IRRIGATION_EFFICIENCY[m])],
            )}
          />
          <p className="text-muted">
            {t(
              "أي أن الغمر يوصل للنبات جزءاً من كل متر مكعب تضخّه، والتنقيط أعلى كفاءة وأعلى تكلفة تأسيس.",
              "In other words, flood irrigation delivers only part of every cubic metre you pump to the plant; drip is more efficient and costs more to set up.",
            )}
          </p>
          <Note title={t("بيانات المناخ تقديرية لا مقيسة", "Climate data are estimates, not measurements")} tone="flag">
            <p>
              {t(
                "الأرقام الشهرية للحرارة والمطر معدّلات إرشادية للتخطيط، وليست قراءات محطة رصد على أرضك. استعملها لتحديد حجم المشروع ورتبة الأرقام، وتحقّق محلياً قبل شراء مضخة بناءً عليها.",
                "The monthly temperature and rainfall figures are guideline averages for planning, not readings from a weather station on your land. Use them to size the project and get the order of magnitude, and check locally before buying a pump on the strength of them.",
              )}
            </p>
          </Note>
        </Section>

        {/* ---------------- lands ---------------- */}
        <Section id="lands" title={title("lands")} who={[FARMER]}>
          <p className="text-muted">
            {t(
              "الأرض المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً. التسجيل مجاني ولا يظهر لأحد حتى تعتمده الإدارة.",
              "Registered land is the basis of every season and every opportunity you put forward later. Registration is free and is shown to no one until the team approves it.",
            )}
          </p>
          <Table
            head={[t("البيان", "Field"), t("التفصيل", "Details")]}
            rows={[
              [t("الاسم والموقع", "Name and location"), t("اسم الأرض · الولاية · المحلية · القرية", "Land name · State · Locality · Village")],
              [t("صفة الحيازة", "Tenure"), t("ملك · إيجار · وغيرها", "Owned · Leased · Other")],
              [
                t("الإحداثيات", "Coordinates"),
                t(
                  "خط العرض وخط الطول — وجودهما يرفع درجة التوثيق",
                  "Latitude and longitude — having them raises the documentation score",
                ),
              ],
              [t("المساحة", "Area"), t("بالفدان", "In feddans")],
              [
                t("المنطقة المناخية", "Climate zone"),
                t(
                  "أقرب محطة، وعليها يُبنى حساب المياه لهذه الأرض",
                  "The nearest station, on which the water calculation for this land is based",
                ),
              ],
              [
                t("مصدر المياه", "Water source"),
                (Object.keys(WATER_SOURCE_LABEL) as WaterSource[])
                  .map(waterSource)
                  .join(" · "),
              ],
              [
                t("المياه المتاحة للفدان", "Water available per feddan"),
                t(
                  "بالمتر المكعب — الرقم الذي ستُقاس عليه كفاية المياه",
                  "In cubic metres — the figure water adequacy is measured against",
                ),
              ],
              [
                t("البُعد عن السوق", "Distance to market"),
                t("بالكيلومتر إلى أقرب طريق يعمل طوال السنة", "In kilometres to the nearest all-year road"),
              ],
              [t("ملاحظات", "Notes"), t("وصف التربة · ما زُرع سابقاً", "Soil description · What was grown before")],
            ]}
          />
          <h3 className="font-bold">{t("المستندات الأربعة", "The four documents")}</h3>
          <p className="text-muted">
            {t(
              "إثبات حيازة أو عقد إيجار · صورة للأرض · تصريح أو موافقة · تقرير معاينة. المقبول: صور JPG أو PNG أو WEBP أو HEIC، أو ملف PDF، حتى ١٠ ميغابايت. والصور تُضغط في متصفحك قبل الرفع حتى لا تستهلك باقتك.",
              "Proof of tenure or a lease · A photo of the land · A permit or approval · An inspection report. Accepted: JPG, PNG, WEBP or HEIC images, or a PDF file, up to 10 MB. Photos are compressed in your browser before upload so they don't use up your data bundle.",
            )}
          </p>
          <Note title={t("لماذا تُطلب صورة من موقع الأرض تحديداً", "Why a photo taken on the land itself")}>
            <p>
              {t(
                "الصورة الملتقطة في الموقع تحمل داخلها تاريخ التقاطها وغالباً إحداثياتها. المنصة تقرأ هذين الحقلين وتحفظهما قبل ضغط الصورة، لأن الضغط يمحوهما — وكان من غير الأمانة أن نقول إن الصورة الميدانية أقوى دليل ثم نمحو ما يجعلها كذلك.",
                "A photo taken on site carries the date it was taken and often its coordinates. The platform reads and saves those two fields before compressing the photo, because compression erases them — it would have been dishonest to call a field photo the strongest evidence and then erase what makes it so.",
              )}
            </p>
          </Note>
          <Table
            head={[t("حالة التحقق", "Verification status"), t("ما تعنيه", "What it means")]}
            rows={[
              [t("غير محقّقة", "Unverified"), t("سجّلتها ولم تُرسل للمراجعة بعد", "You registered it and it has not been sent for review yet")],
              [t("قيد المراجعة", "Under review"), t("عند الإدارة الآن", "With the team now")],
              [t("محقّقة", "Verified"), t("اعتُمدت", "Approved")],
              [t("مرفوضة", "Rejected"), t("مع ملاحظة تشرح السبب وما ينقص", "With a note explaining why and what is missing")],
            ]}
          />
          <p className="text-muted">
            {t(
              "وبجانب الحالة عدّاد التوثيق (مثلاً ٢/٤)، يُحسب آلياً من الملفات المرفوعة فعلاً فلا يقول أكثر مما تسنده الملفات.",
              "Next to the status is the documentation counter (for example 2/4), calculated automatically from the files actually uploaded, so it never claims more than the files support.",
            )}
          </p>
        </Section>

        {/* ---------------- seasons ---------------- */}
        <Section
          id="seasons"
          title={title("seasons")}
          who={[FARMER, INVESTOR]}
        >
          <p className="text-muted">
            {t(
              "قلب المنصة: خطة موسم تُشتقّ من نموذج المياه بدل أن تُكتب بالتقدير، ومال يُصرف على مراحل مقابل أدلة. تختار المحصول والمنطقة وتاريخ الزراعة وطريقة الري والمساحة والميزانية للفدان، فيبني النظام الخطة كاملة: مراحل بتواريخ حقيقية، ونصيب كل مرحلة من المياه، ونصيبها من الميزانية.",
              "The heart of the platform: a season plan derived from the water model instead of written by guesswork, and money released in stages against evidence. You choose the crop, region, planting date, irrigation method, area and budget per feddan, and the system builds the whole plan: stages with real dates, each stage's share of the water and its share of the budget.",
            )}
          </p>

          <div className="flex w-full overflow-hidden rounded-xl border border-border">
            {STAGE_ORDER.map((k) => (
              <div
                key={k}
                style={{ flex: STAGE_TEMPLATES[k].budgetShare * 100 }}
                className="border-e border-border bg-primary/10 py-2.5 text-center text-[0.65rem] font-bold text-primary last:border-e-0"
              >
                {pct(STAGE_TEMPLATES[k].budgetShare)}
              </div>
            ))}
          </div>

          <Table
            head={[t("المرحلة", "Stage"), t("الميزانية", "Budget"), t("ما يُنجَز فيها", "What is done in it")]}
            rows={STAGE_ORDER.map((k) => [
              en ? STAGE_EN[k].name : STAGE_TEMPLATES[k].name,
              pct(STAGE_TEMPLATES[k].budgetShare),
              (en ? STAGE_EN[k].activities : STAGE_TEMPLATES[k].activities).join(" · "),
            ])}
          />
          <p className="text-muted">
            {t(
              "التوزيع يتبع الواقع: التحضير والزراعة يأخذان النصيب الأكبر لأن المستلزمات تُشترى قبل أن ينبت شيء، والحصاد يأخذ نصيباً معتبراً لأن العمالة تبلغ ذروتها فيه.",
              "The split follows reality: preparation and planting take the largest share because inputs are bought before anything grows, and harvest takes a sizeable share because labour peaks then.",
            )}
          </p>

          <h3 className="font-bold">{t("بوابة الصرف", "The release gate")}</h3>
          <Note title={t("شرطان معاً، لا واحد", "Two conditions together, not one")}>
            {en ? (
              <>
                <p>
                  <strong>1. The previous stage is approved.</strong> The order
                  is deliberate — releasing the harvest budget while the crop is
                  still in the ground is exactly the failure this condition
                  prevents.
                </p>
                <p>
                  <strong>2. This stage has evidence uploaded.</strong> Photos,
                  invoices or an inspection report — at least one.
                </p>
                <p className="border-t border-border pt-2 font-bold text-primary">
                  Both met → the stage&apos;s share is released. Either missing
                  → it stays held, and the system tells you the exact reason.
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong>١. المرحلة السابقة معتمدة.</strong> الترتيب مقصود —
                  الإفراج عن ميزانية الحصاد والمحصول ما يزال في الأرض هو بالضبط
                  الخلل الذي يمنعه هذا الشرط.
                </p>
                <p>
                  <strong>٢. لهذه المرحلة أدلة مرفوعة.</strong> صور أو فواتير أو
                  تقرير معاينة — واحد على الأقل.
                </p>
                <p className="border-t border-border pt-2 font-bold text-primary">
                  تحقّق الشرطان ← يُفرَج عن نصيب المرحلة. تخلّف أحدهما ← يبقى
                  محجوزاً، ويكتب النظام لك السبب بالحرف.
                </p>
              </>
            )}
          </Note>
          <p>
            {t(
              "المستثمر يخاطر بمرحلة واحدة في كل مرة، والمزارع يُدفع له فور إثبات العمل بدل أن ينتظر نهاية خصومة.",
              "The investor risks one stage at a time, and the farmer is paid as soon as the work is proved instead of waiting for the end of a dispute.",
            )}
          </p>

          <h3 className="font-bold">{t("دفتر الحسابات", "The ledger")}</h3>
          <p className="text-muted">
            {en
              ? `You record every entry with its amount and description under one of the categories: ${Object.keys(LEDGER_LABEL)
                  .map((k) => LEDGER_EN[k] ?? LEDGER_LABEL[k as keyof typeof LEDGER_LABEL])
                  .join(" · ")}. It shows you spending against the planned budget, each category's share of cost, net profit and net profit per feddan, and how your result compares with the expected median for this crop.`
              : `تسجّل فيه كل قيد بمبلغه ووصفه تحت أحد البنود: ${Object.values(LEDGER_LABEL).join(" · ")}. ويعرض لك المصروف مقابل الميزانية المخططة، ونسبة كل بند من التكلفة، وصافي الربح وصافي ربح الفدان، ومقارنة نتيجتك بالوسيط المتوقع لهذا المحصول.`}
          </p>
          <p>
            {t(
              "وحين تُعتمد كل المراحل يظهر زرّ «أغلق الموسم واحتسبه في سجلي» — وهو ما يحوّل موسمك إلى سجل يُقاس عليه.",
              "When every stage is approved, a “Close the season and count it in my record” button appears — that is what turns your season into a record you can be measured by.",
            )}
          </p>
        </Section>

        {/* ---------------- trust ---------------- */}
        <Section
          id="trust"
          title={title("trust")}
          who={[FARMER, INVESTOR]}
        >
          <p className="text-muted">
            {t(
              "لكل منفّذ صفحة عامة تعرض درجته من ١٠٠ ومواسمه، محسوبة مما فعله فعلاً — لا من تقييم كتبه عن نفسه ولا من انطباعات.",
              "Every operator has a public page showing their score out of 100 and their seasons, calculated from what they actually did — not from a self-assessment or impressions.",
            )}
          </p>
          <Weights factors={TRUST_FACTORS} locale={locale} />
          <Table
            head={[t("المرتبة", "Level"), t("متى", "When")]}
            rows={[
              [t("لا سجل بعد", "No record yet"), t("لم يُكمل أي موسم — ولا يُعطى رقماً بدل ذلك", "Has not completed a season — and is not given a number instead")],
              [t("سجل قيد البناء", "Record in progress"), t("أقل من موسمين مكتملين، أو درجة دون ٦٠", "Fewer than two completed seasons, or a score below 60")],
              [t("سجل ثابت", "Steady record"), t("٦٠ فأكثر", "60 or more")],
              [t("سجل موثوق", "Trusted record"), t("٨٠ فأكثر", "80 or more")],
            ]}
          />
          <Note title={t("لماذا لا تُمنح درجة كاملة من أول موسم", "Why a full score is not given from the first season")}>
            <p>
              {t(
                "الدرجة تُسحب نحو المنتصف ما دام السجل رقيقاً، ولا تُصدَّق كاملةً قبل ثلاثة مواسم مكتملة. موسم واحد موفّق لا يصنع سجلاً، ومن لا سجل له يُقال عنه «لا سجل بعد» — لا صفر يظلمه ولا رقم جميل يخدع من يقرأه.",
                "The score is pulled towards the middle while the record is thin, and is not trusted in full before three completed seasons. One good season does not make a record, and someone with no record is described as “No record yet” — not a zero that wrongs them, nor a flattering number that misleads the reader.",
              )}
            </p>
          </Note>
          <p className="text-muted">
            {t(
              "وتفاصيل مصروفات المزارع تبقى خاصة به: ما يظهر على صفحته العامة مجاميع فقط، لا فواتيره.",
              "The details of a farmer's spending stay private: their public page shows totals only, not their invoices.",
            )}
          </p>
        </Section>

        {/* ---------------- opportunity ---------------- */}
        <Section id="opportunity" title={title("opportunity")} who={[FARMER]}>
          <p className="text-muted">
            {t(
              "تعرض فيها مشروعاً على الإدارة للمراجعة — لا شيء يُنشر مباشرة. وأثناء تعبئة النموذج تُحسب الدرجة أمامك وتتحرك مع كل تعديل، فترى ما يرفعها وما يخفضها قبل الإرسال. وهذه معاينة فقط؛ الدرجة المعتمدة يعيد الخادم حسابها.",
              "Here you put a project to the team for review — nothing is published directly. While you fill in the form the score is calculated in front of you and moves with every change, so you see what raises it and what lowers it before you send. This is only a preview; the server recalculates the official score.",
            )}
          </p>
          <Weights factors={RISK_FACTORS} locale={locale} />
          <p className="text-muted">
            {t(
              "وكل عامل يعيد سببه مكتوباً: درجة لا يستطيع المزارع مناقشتها هي درجة لا يستطيع إصلاحها، ولا يستطيع المستثمر تدقيقها. وكفاية المياه تحديداً محسوبة من نموذج FAO-56 لا مأخوذة على الثقة.",
              "Every factor gives its reason in writing: a score the farmer cannot argue with is one they cannot fix, and one the investor cannot audit. Water adequacy in particular is calculated from the FAO-56 model, not taken on trust.",
            )}
          </p>
          <Note title={t("مانعان يوقفان النشر مهما كانت الدرجة", "Two blockers that stop publication whatever the score")} tone="warn">
            <p>
              {t(
                "أن تكون المياه المتاحة لا تغطي احتياج المحصول — فالمشروع غير قابل للتنفيذ بهذه الأرقام أصلاً. أو أن يكون التوثيق ناقصاً. ومع أيّهما يُعطَّل زرّ الاعتماد نفسه في لوحة الإدارة.",
                "The available water does not cover the crop's need — the project cannot work on these numbers at all. Or the documentation is incomplete. With either one, the approve button itself is disabled in the admin panel.",
              )}
            </p>
          </Note>
        </Section>

        {/* ---------------- investor ---------------- */}
        <Section
          id="investor"
          title={title("investor")}
          who={[INVESTOR]}
        >
          <p className="text-muted">
            {openProjects > 0
              ? en
                ? `${openProjects} projects are listed on the home page now.`
                : `معروض الآن ${openProjects} مشروعاً على الصفحة الرئيسية.`
              : t(
                  "الصفحة الرئيسية فارغة من المشاريع اليوم عن قصد: لا يُعرض مشروع قبل أن يكتمل إثبات حيازة أرضه، وتُجرى معاينة ميدانية، وتُصدر الجهة الزراعية موافقتها. سجّل اهتمامك عبر المساعد لتُبلَّغ عند طرح أول مشروع موثّق.",
                  "The home page has no projects today, on purpose: no project is listed until proof of its land tenure is complete, a field inspection is done, and the agricultural authority has given its approval. Register your interest through the assistant to be told when the first documented project is listed.",
                )}
          </p>
          <p>
            {t(
              "وصفحة كل مشروع تعرض: الموقع والمساحة، وسعر الحصة والحصص المتبقية، ونسبة التمويل، ومستوى المخاطرة، والتقارير الميدانية بصورها، ونموذج الاستثمار.",
              "Each project's page shows: location and area, the share price and shares remaining, the funding percentage, the risk level, field reports with their photos, and the investment form.",
            )}
          </p>

          <h3 className="font-bold">{t("خطط استثمارك", "Plan your investment")}</h3>
          <p className="text-muted">
            {t(
              "تجيب على أسئلة قصيرة تحدد تحمّلك للمخاطرة، وتُدخل المبلغ، فيقترح النظام توزيعه على المشاريع المفتوحة:",
              "You answer a few short questions that set your risk tolerance and enter the amount, and the system suggests how to spread it across the open projects:",
            )}
          </p>
          <Table
            head={[
              t("ملفك", "Your profile"),
              t("مخاطرة منخفضة", "Low risk"),
              t("متوسطة", "Medium"),
              t("مرتفعة", "High"),
            ]}
            rows={(
              [
                [t("متحفّظ", "Cautious"), "low"],
                [t("متوازن", "Balanced"), "medium"],
                [t("مُقدِم", "Bold"), "high"],
              ] as [string, RiskProfile][]
            ).map(([label, profile]) => [
              label,
              pct(RISK_WEIGHTS[profile].low),
              pct(RISK_WEIGHTS[profile].medium),
              pct(RISK_WEIGHTS[profile].high),
            ])}
          />
          <p className="text-muted">
            {t(
              "التوزيع آلي ويحترم الحصص المتاحة فعلاً في كل مشروع — وليس توصية مالية شخصية.",
              "The split is automatic and respects the shares actually available in each project — it is not personal financial advice.",
            )}
          </p>

          <h3 className="font-bold">{t("نطاق العائد بدل الرقم الواحد", "A return range instead of a single number")}</h3>
          <p>
            {t(
              "المنصة لا تعرض «عائداً سنوياً متوقعاً» رقماً واحداً لأنه يخفي بالضبط ما يحتاج المستثمر معرفته. تعرض بدله: السيناريو المتشائم (أسوأ عُشر المواسم)، والوسيط، والسيناريو المتفائل (أفضل عُشر)، واحتمال أن ينتهي الموسم عند نقطة التعادل أو دونها.",
              "The platform does not show an “expected annual return” as a single number, because that hides exactly what an investor needs to know. Instead it shows: the pessimistic scenario (the worst tenth of seasons), the median, the optimistic scenario (the best tenth), and the probability that the season ends at break-even or below.",
            )}
          </p>
          <Note title={t("الأرقام متحفّظة عن قصد", "The numbers are conservative on purpose")} tone="flag">
            <p>
              {t(
                "الدراسات التي روجعت قبل بناء المنصة افترضت إيراداً بين ٣٠٠٠ و٥٠٠٠ دولار للفدان — أي أربعة إلى ستة أضعاف ما تعطيه الحبوب المروية في السودان فعلاً. أرقام سوداقري مبنية على اقتصاديات واقعية، وستبدو أقل بريقاً من أي عرض آخر قد يصلك. هذا مقصود.",
                "The studies reviewed before the platform was built assumed revenue of $3,000 to $5,000 per feddan — four to six times what irrigated grain actually earns in Sudan. Sudagri's numbers are built on realistic economics and will look less exciting than any other offer you may receive. That is intended.",
              )}
            </p>
          </Note>
        </Section>

        {/* ---------------- mining ---------------- */}
        <Section
          id="mining"
          title={title("mining")}
          who={[MINER]}
        >
          <p className="text-muted">
            {t(
              "قسم مستقل تماماً عن الزراعة، ولا تختلط معرفته بالمحاصيل في أي صفحة.",
              "A section entirely separate from farming; its knowledge is never mixed with crops on any page.",
            )}
          </p>
          <Note title={t("قبل أي شيء", "Before anything else")} tone="warn">
            <p>
              {t(
                "حرق ملغم الزئبق في مكان مغلق أو قرب السكن يسمّم من فيه لا العامل وحده، والضرر العصبي منه لا يُشفى. والنزول لإنقاذ مصاب في حفرة بلا تهوية يقتل المُنقِذ أيضاً — أغلب حوادث الاختناق تأخذ اثنين لا واحداً.",
                "Burning mercury amalgam indoors or near homes poisons everyone there, not just the worker, and the nerve damage it causes does not heal. Going down to rescue someone in an unventilated pit kills the rescuer too — most suffocation accidents take two people, not one.",
              )}
            </p>
          </Note>
          <Note title={t("هذا سجلّ لا سوق", "This is a register, not a market")} tone="flag">
            <p>
              {t(
                "لا سعر ولا مشترٍ ولا عمولة ولا وساطة — تسجيل معلومات فقط. القيمة في هذا القطاع انتقلت أصلاً من امتلاك الذهب إلى إثبات مصدره، ومن يبني هذا الإثبات الآن يكون جاهزاً ببيانات سنوات حين تُفتح قناة قانونية، لا بنظام فارغ.",
                "No price, no buyer, no commission, no brokering — only recording information. Value in this sector has already shifted from holding gold to proving where it came from, and whoever builds that proof now will be ready with years of data when a legal channel opens, not with an empty system.",
              )}
            </p>
          </Note>
          <Steps
            items={[
              [
                t("سجّل الموقع", "Register the site"),
                t(
                  "اسمه وولايته وإحداثياته، وهل له ترخيص، وهل زاره مفتّش مستقل.",
                  "Its name, state and coordinates, whether it is licensed, and whether an independent inspector has visited.",
                ),
              ],
              [
                t("سجّل الشحنة", "Register the lot"),
                t(
                  "رقمها المرجعي، وتاريخ الاستخراج، والوزن بالجرام، والعيار، وطريقة الاستخلاص.",
                  "Its reference number, extraction date, weight in grams, purity, and recovery method.",
                ),
              ],
              [
                t("أضف حلقات الحيازة", "Add the custody links"),
                t(
                  "كل انتقال: من مَن إلى مَن، وبأي صفة، ومتى، وبأي وزن وعيار، ومع أدلته.",
                  "Every transfer: from whom to whom, in what capacity, when, at what weight and purity, with its evidence.",
                ),
              ],
              [
                t("اقرأ ما وجده السجل", "Read what the register found"),
                t(
                  "يفحص سلسلتك آلياً، ويعطيك درجة توثيق من ١٠٠، ويسمّي كل خلل باسمه.",
                  "It checks your chain automatically, gives you a documentation score out of 100, and names every flaw.",
                ),
              ],
            ]}
          />
          <Note title={t("حلقات الحيازة لا تُعدَّل بعد إضافتها", "Custody links cannot be edited once added")}>
            <p>
              {t(
                "تُضاف حلقة جديدة ولا يُغيَّر ما مضى — لأن سجلاً قابلاً للتعديل لا يُثبت شيئاً.",
                "A new link is added and the past is not changed — because a register that can be edited proves nothing.",
              )}
            </p>
          </Note>
          <h3 className="font-bold">{t("ميزان الكتلة", "Mass balance")}</h3>
          <p>
            {t(
              "التنقية تُزيل الشوائب، فمحتوى الذهب الصافي على امتداد السلسلة يمكن أن ينقص فقط. فإن ارتفع، فقد دخلت الشحنةَ مادةٌ لم تُسجَّل قط — وهذه بصمة ذهب غير موثّق يُخلط بشحنة موثّقة. لذلك يُسجَّل الوزن والعيار عند كل حلقة لا عند البداية وحدها.",
              "Refining removes impurities, so the fine gold content along the chain can only go down. If it goes up, material that was never recorded has entered the lot — the fingerprint of undocumented gold being mixed into a documented lot. That is why weight and purity are recorded at every link, not only at the start.",
            )}
          </p>
          <Table
            head={[t("مكوّن الدرجة", "Score component"), t("الوزن", "Weight")]}
            rows={[
              [t("المنشأ — ترخيص، إحداثيات، معاينة مستقلة", "Origin — licence, coordinates, independent inspection"), t("٤٠٪", "40%")],
              [t("سلامة السلسلة — تسلسل، تواريخ، أدلة، ميزان كتلة", "Chain integrity — sequence, dates, evidence, mass balance"), t("٤٠٪", "40%")],
              [t("طريقة الاستخلاص", "Recovery method"), t("٢٠٪", "20%")],
            ]}
          />
          <p className="text-muted">
            {t(
              "وأي علامة حمراء قاطعة — وجود مسلح في الموقع أو قربه، أو عمالة أطفال، أو سلسلة مكسورة — تسقُف الدرجة عند ٢٥ مهما اكتمل باقي التوثيق. والفحوص تتبع إرشادات منظمة التعاون الاقتصادي والتنمية للعناية الواجبة في سلاسل توريد المعادن من المناطق المتأثرة بالنزاع. والدرجة تصف اكتمال التوثيق فقط، لا قيمة الشحنة ولا سعرها.",
              "Any hard red flag — armed presence at or near the site, child labour, or a broken chain — caps the score at 25 however complete the rest of the documentation is. The checks follow the OECD Due Diligence Guidance for mineral supply chains from conflict-affected areas. The score describes only how complete the documentation is, not the value or price of the lot.",
            )}
          </p>
        </Section>

        {/* ---------------- admin ---------------- */}
        <Section id="admin" title={title("admin")} who={[t("للإداريين فقط", "Administrators only")]}>
          <p className="text-muted">
            {t(
              "تظهر مجموعة «الإدارة» في القائمة لمن كانت صفته إدارية فقط، وكل صفحة فيها تتحقق من الصفة عند الخادم لا في المتصفح.",
              "The “Admin” group appears in the menu only for users with an admin role, and every page in it checks the role on the server, not in the browser.",
            )}
          </p>
          <Table
            head={[t("الصفحة", "Page"), t("ما فيها", "What it contains")]}
            rows={[
              [
                t("لوحة المشاريع", "Projects panel"),
                t(
                  "إنشاء المشاريع وتعديلها، وتأكيد طلبات الاستثمار، ونشر التقارير الميدانية — ومؤشر صحة النظام بآخر فحص دوري وما رصده.",
                  "Creating and editing projects, confirming investment requests, publishing field reports — and the system health indicator with the latest scheduled check and what it found.",
                ),
              ],
              [
                t("مراجعة الفرص", "Opportunity review"),
                t(
                  "كل فرصة مرفوعة ومعها درجتها مُعاد حسابها من بياناتها لا كما أرسلها المتصفح، وتفصيل العوامل. القراران: اعتمد وانشر، أو ارفض بسبب يصل صاحبها في إشعاره.",
                  "Every submitted opportunity with its score recalculated from its data rather than as the browser sent it, and the factor breakdown. The two decisions: approve and publish, or reject with a reason that reaches the submitter in a notification.",
                ),
              ],
              [
                t("التحليلات", "Analytics"),
                t(
                  "فجوات قاعدة المعرفة (أسئلة لم يجد لها المسترجِع مُدخلاً — وكل سطر منها مُدخل ينقصك)، وأكثر ما يسأل عنه الزوار، وتغطية القاعدة.",
                  "Knowledge base gaps (questions the retriever found no entry for — every line is an entry you are missing), what visitors ask most, and the base's coverage.",
                ),
              ],
              [
                t("العملاء المحتملون", "Leads"),
                t(
                  "من سجّل اهتمامه عبر المساعد. الإدخال مفتوح والقراءة للإدارة وحدها.",
                  "People who registered interest through the assistant. Anyone can submit; only the team can read.",
                ),
              ],
            ]}
          />
        </Section>

        {/* ---------------- privacy ---------------- */}
        <Section id="privacy" title={title("privacy")} who={[ALL]}>
          <p className="text-muted">
            {t(
              "الفصل بين البيانات مفروض في قاعدة البيانات نفسها لا في شيفرة الصفحات، أي أن الحماية لا تسقط لو أخطأت صفحة في ترشيح ما تعرضه.",
              "Data separation is enforced in the database itself, not in the page code, so the protection does not fail if a page makes a mistake filtering what it shows.",
            )}
          </p>
          <Table
            head={[t("البيان", "Data"), t("من يراه", "Who sees it")]}
            rows={[
              [
                t("قاعدة المعرفة · الحاسبة · المشاريع المنشورة", "Knowledge base · Calculator · Published projects"),
                t("الجميع بلا تسجيل", "Everyone, without signing up"),
              ],
              [t("أراضيك ومستنداتها", "Your lands and their documents"), t("أنت والإدارة", "You and the team")],
              [t("دفتر حسابات موسمك وفواتيره", "Your season ledger and invoices"), t("أنت وحدك", "Only you")],
              [t("مجاميع مواسمك ودرجة ثقتك", "Your season totals and trust score"), t("الجميع — مجاميع فقط", "Everyone — totals only")],
              [t("استثماراتك", "Your investments"), t("أنت والإدارة", "You and the team")],
              [t("إشعاراتك", "Your notifications"), t("أنت وحدك", "Only you")],
              [t("بيانات العملاء المحتملين", "Lead details"), t("الإدارة وحدها", "The team only")],
            ]}
          />
          <Note
            title={t(
              "رقم جوالك اليوم مُعرِّف لا رقم مُتحقَّق منه",
              "Your phone number is an identifier today, not a verified number",
            )}
            tone="flag"
          >
            <p>
              {t(
                "ما دام إرسال الرسائل النصية غير مُفعّل، فالمنصة لا تستطيع إثبات أن الرقم يخصّك، ولن يُعرض في أي مكان على أنه «موثَّق». وهذا مقبول في مرحلة التسجيل، ولن يكون مقبولاً يوم تتحرك أموال حقيقية.",
                "As long as text messaging is not switched on, the platform cannot prove the number is yours, and it will never be shown anywhere as “verified”. That is acceptable at the sign-up stage, and will not be acceptable on the day real money moves.",
              )}
            </p>
          </Note>
        </Section>

        {/* ---------------- limits ---------------- */}
        <Section id="limits" title={title("limits")} who={[ALL]}>
          <p className="text-muted">
            {t(
              "ما لا تفعله سوداقري، مكتوباً صراحة، لأن معرفته جزء من استعمالها الصحيح.",
              "What Sudagri does not do, written plainly, because knowing it is part of using it properly.",
            )}
          </p>
          {en ? (
            <ul className="list-disc space-y-2 ps-5">
              <li>
                <strong>It is not final agricultural advice.</strong> The
                knowledge base is a synthesis of experience from leading
                countries, and every entry carries its reference country and a
                note saying when it needs local checking. Your soil, water and
                market remain the judge.
              </li>
              <li>
                <strong>It is not financial advice.</strong> It shows the facts,
                return ranges and the probability of loss; the decision is
                yours.
              </li>
              <li>
                <strong>It does not sell or broker gold.</strong> The register
                only keeps information.
              </li>
              <li>
                <strong>Climate figures are estimates for planning</strong>, not
                readings from a weather station on your land.
              </li>
              {!INVESTMENT_LIVE && (
                <li>
                  <strong>There is no open investment today</strong>, and it
                  will not open before there are legally documented projects
                  and a real arrangement for holding funds.
                </li>
              )}
            </ul>
          ) : (
            <ul className="list-disc space-y-2 ps-5">
              <li>
                <strong>ليست استشارة زراعية نهائية.</strong> قاعدة المعرفة توليف من
                تجارب دول رائدة، وكل مُدخل يحمل دولته المرجعية وملاحظة تقول متى
                يحتاج تحققاً محلياً. تربتك ومياهك وسوقك تبقى الحَكَم.
              </li>
              <li>
                <strong>ليست نصيحة مالية.</strong> تعرض الحقائق ونطاقات العائد
                واحتمال الخسارة، والقرار قرارك.
              </li>
              <li>
                <strong>لا تبيع ذهباً ولا تتوسّط فيه.</strong> السجل يحفظ معلومات
                فقط.
              </li>
              <li>
                <strong>أرقام المناخ تقديرية للتخطيط</strong>، لا قراءات محطة رصد
                على أرضك.
              </li>
              {!INVESTMENT_LIVE && (
                <li>
                  <strong>لا يوجد استثمار مفتوح اليوم</strong>، ولن يُفتح قبل
                  مشاريع موثّقة قانونياً وترتيب حقيقي لحفظ الأموال.
                </li>
              )}
            </ul>
          )}
        </Section>
      </div>

      <footer className="mt-12 border-t border-border pt-6 text-sm text-muted">
        <p>
          {t(
            "أرقام هذا الدليل مقروءة من المنصة نفسها وقت فتحك للصفحة، لا منسوخة يدوياً — فما تغيّر في المنصة يتغيّر هنا معه.",
            "The numbers in this guide are read from the platform itself when you open the page, not copied by hand — so whatever changes on the platform changes here with it.",
          )}
        </p>
        <p className="mt-3">
          {t("بقي سؤال؟", "Still have a question?")}{" "}
          <Link href="/" className="text-primary underline">
            {t("اسأل مساعد سوداقري", "Ask the Sudagri assistant")}
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
