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
import { INVESTMENT_LIVE } from "@/lib/config";

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

export const metadata = {
  title: "دليل الاستخدام | سودجري",
  description:
    "شرح كامل لكل أداة في سودجري: المساعد، وحاسبة المياه، وتسجيل الأرض، وإدارة الموسم، وسجلّ إثبات المنشأ — وما يعمل الآن وما لم يُفتح بعد.",
};

const pct = (v: number) => `${Math.round(v * 100)}٪`;

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
  ["status", "ما يعمل الآن وما لم يُفتح بعد"],
  ["account", "إنشاء الحساب والدخول"],
  ["nav", "التنقّل داخل المنصة"],
  ["assistant", "مساعد سودجري"],
  ["water", "حاسبة الاحتياج المائي"],
  ["lands", "تسجيل الأرض وتوثيقها"],
  ["seasons", "إدارة الموسم الزراعي"],
  ["trust", "مؤشر ثقة المنفّذ"],
  ["opportunity", "رفع فرصة استثمارية"],
  ["investor", "للمستثمر: المشاريع والمحفظة"],
  ["mining", "التعدين وسجلّ إثبات المنشأ"],
  ["admin", "لوحة الإدارة"],
  ["privacy", "الخصوصية ومن يرى ماذا"],
  ["limits", "حدود المنصة"],
] as const;

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
        <thead className="bg-card text-right">
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
}: {
  factors: { key: string; label: string; weight: number; detail?: string }[];
}) {
  const sorted = [...factors].sort((a, b) => b.weight - a.weight);
  return (
    <ul className="flex flex-col gap-4">
      {sorted.map((f) => (
        <li key={f.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{f.label}</span>
            <span className="flex-none text-xs text-muted">
              {f.weight} من 100
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

const LIVE = <Pill tone="bg-primary/10 text-primary">يعمل</Pill>;
const SHUT = <Pill tone="bg-danger/10 text-danger">مغلق</Pill>;
const SOON = <Pill tone="bg-accent/15 text-accent">لاحقاً</Pill>;

export default async function GuidePage() {
  const supabase = await createClient();

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
        <p className="text-sm font-medium text-primary">دليل الاستخدام</p>
        <h1 className="mt-2 text-2xl font-black leading-snug sm:text-3xl">
          كل ما في سودجري، وكيف تستعمله
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          منصة واحدة تجمع معرفة زراعية موثّقة، وأدوات حساب حقيقية للمزارع،
          وسجلاً لإثبات منشأ الذهب — ومسار استثمار زراعي شفاف قيد البناء. هذا
          الدليل يشرح كل شاشة، وما تفعله بالضبط، وما لا تفعله.
        </p>
      </header>

      <nav
        aria-label="محتويات الدليل"
        className="rounded-2xl border border-border bg-card p-5"
      >
        <p className="mb-3 text-xs font-medium text-muted">المحتويات</p>
        <ol className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-sm transition hover:text-primary"
              >
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex flex-col gap-10">
        {/* ---------------- status ---------------- */}
        <Section id="status" title="ما يعمل الآن وما لم يُفتح بعد">
          <p className="text-muted">
            المنصة في مرحلة بناء، وهذا الجدول يقول أين وصل كل جزء. لا شيء هنا
            معروض على أنه جاهز وهو ليس كذلك.
          </p>
          <Table
            head={["الجزء", "الحالة", "ما يعنيه عملياً"]}
            rows={[
              [
                "قاعدة المعرفة",
                LIVE,
                `${knowledgeCount ?? 0} مُدخلاً، مفتوحة للجميع بلا تسجيل.`,
              ],
              ["مساعد سودجري", LIVE, "يجيب فوراً وبلا تسجيل."],
              ["حاسبة الاحتياج المائي", LIVE, "حساب كامل بلا تسجيل."],
              ["تسجيل الأراضي وتوثيقها", LIVE, "يتطلب حساباً."],
              ["تخطيط الموسم ودفتر الحسابات", LIVE, "يتطلب حساباً."],
              ["سجلّ إثبات المنشأ", LIVE, "يتطلب حساباً."],
              ["رفع فرصة للمراجعة", LIVE, "تُراجَع من الإدارة قبل أي نشر."],
              [
                "الاستثمار بالمال",
                INVESTMENT_LIVE ? LIVE : SHUT,
                INVESTMENT_LIVE
                  ? "مفتوح."
                  : "لا يمكن ضخّ أي مبلغ اليوم — الرفض مبني في الخادم لا في إخفاء زر.",
              ],
              [
                "المشاريع المطروحة",
                openProjects > 0 ? LIVE : SHUT,
                openProjects > 0
                  ? `${openProjects} مشروعاً معروضاً الآن.`
                  : "لا يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً.",
              ],
              [
                "التحقق من الجوال برسالة",
                SOON,
                "الرقم اليوم مُعرِّف اخترته أنت، لا رقم أثبتت المنصة ملكيتك له.",
              ],
            ]}
          />
          {!INVESTMENT_LIVE && (
            <Note title="لماذا الاستثمار مغلق؟" tone="flag">
              <p>
                لأن فتحه قبل وجود مشاريع موثّقة قانونياً وترتيب حقيقي لحفظ
                الأموال يعني جمع مال على وعد. المنصة تبني أولاً ما يُثبت المشروع
                — التوثيق، والمعاينة، وسجل المنفّذ، والأدلة المصوّرة — ثم تفتح
                الباب.
              </p>
            </Note>
          )}
        </Section>

        {/* ---------------- account ---------------- */}
        <Section id="account" title="إنشاء الحساب والدخول" who={["للجميع"]}>
          <p className="text-muted">
            المعرفة والحاسبة والمساعد لا تحتاج حساباً. الحساب مطلوب لتسجيل أرض،
            أو إدارة موسم، أو استخدام سجلّ الذهب.
          </p>

          <h3 className="font-bold">التسجيل برقم الجوال</h3>
          <Steps
            items={[
              ["افتح صفحة إنشاء حساب", "من القائمة ← حسابك ← إنشاء حساب."],
              [
                "اكتب اسمك الكامل",
                "هذا الاسم هو ما يظهر للمستثمرين على صفحة سجلّك إن أدرت مواسم.",
              ],
              [
                "اختر الدولة واكتب رقمك",
                "اكتبه كما تكتبه دائماً — المنصة تتكفّل بالباقي.",
              ],
              ["اختر كلمة مرور", "ستة أحرف على الأقل."],
              [
                "اضغط إنشاء الحساب",
                "يُفتح الحساب فوراً. لا رسالة تنتظرها ولا رمز تأكيد.",
              ],
            ]}
          />

          <h3 className="mt-2 font-bold">كيف يقرأ النظام رقمك</h3>
          <p className="text-muted">
            الرقم السوداني يُكتب محلياً بصفر في أوله، وصيغته الدولية تحذف ذلك
            الصفر. النظام يتولى هذا بدل أن يرفض رقمك:
          </p>
          <Table
            head={["ما تكتبه", "النتيجة"]}
            rows={[
              ["0912345678", "مقبول — الصفر الأول يُحذف تلقائياً"],
              ["0912 345 678", "مقبول — المسافات والشُرَط تُتجاهل"],
              ["٠٩١٢٣٤٥٦٧٨", "مقبول — الأرقام العربية تُحوَّل"],
              ["+249912345678", "مقبول — الرقم الدولي الملصوق يعمل"],
              [
                "091234567",
                "مرفوض — ويقول لك كم رقماً تحتاج الدولة وكم أدخلتَ",
              ],
            ]}
          />
          <p>
            الرفض مقصود: حساب أُنشئ برقم فيه خطأ مطبعي لا يستطيع صاحبه الدخول
            إليه مرة أخرى.
          </p>

          <h3 className="mt-2 font-bold">التسجيل بالبريد الإلكتروني</h3>
          <p>
            بديل متاح من الرابط أسفل صفحة التسجيل، ومفيد للمغتربين الذين
            يفضّلونه.
          </p>
          <Note title="رسالة التفعيل ليست احتيالاً" tone="warn">
            <p>
              إن وصلتك رسالة تفعيل عند التسجيل بالبريد فستكون بالإنجليزية وباسم
              خدمة الاستضافة التقنية (Supabase) لا باسم سودجري. هذا طبيعي
              ومتوقّع — افتحها واضغط الرابط.
            </p>
          </Note>

          <Note title="فرق مهم بين الطريقتين" tone="flag">
            <p>
              حساب البريد يمكن استرجاعه إن نسيت كلمة مروره. حساب الجوال{" "}
              <strong>لا يمكن استرجاعه بعد</strong> — لا رسالة نصية تحمل رمزاً
              ولا بريد يصله رابط. فإن كنت ستدير المنصة، اجعل حسابك بالبريد.
            </p>
          </Note>
        </Section>

        {/* ---------------- nav ---------------- */}
        <Section id="nav" title="التنقّل داخل المنصة" who={["للجميع"]}>
          <p className="text-muted">
            كل شيء خلف زرّ <strong>القائمة</strong> أعلى الصفحة، مقسّم إلى
            مجموعات تتغيّر بحسب حالتك.
          </p>
          <Table
            head={["المجموعة", "ما بداخلها", "تظهر لـ"]}
            rows={[
              ["الزراعة", "الرئيسية · حاسبة الاحتياج المائي · هذا الدليل", "الجميع"],
              ["التعدين", "قسم التعدين · سجلّ إثبات المنشأ", "الجميع"],
              ["حسابك", "تسجيل الدخول · إنشاء حساب", "غير المسجّلين"],
              ["أرضي", "أراضيّ · مواسمي · ارفع فرصة", "المسجّلين"],
              ["استثماري", "محفظتي · خطط استثمارك", "المسجّلين"],
              [
                "الإدارة",
                "لوحة المشاريع · مراجعة الفرص · التحليلات · العملاء المحتملون",
                "الإداريين فقط",
              ],
            ]}
          />
          <p>
            وفي أعلى القائمة زرّ ثابت لفتح المساعد. وبجانب زرّ القائمة يظهر
            للمسجّلين جرس الإشعارات وعليه عدد ما لم تقرأه — وتصلك عند كل حدث
            يخصّك: رفع أرضك للمراجعة، اعتمادها أو رفضها مع سببه، ورفع فرصتك
            واعتمادها أو رفضها.
          </p>
        </Section>

        {/* ---------------- assistant ---------------- */}
        <Section
          id="assistant"
          title="مساعد سودجري"
          who={["للمزارع", "للمستثمر", "للمعدّن"]}
        >
          <p className="text-muted">
            زرّ عائم في كل صفحة، وأول عنصر في القائمة. اسأله بالعربية عن أي
            محصول أو ماشية أو تربة أو ريّ أو آفة أو تعدين.
          </p>
          <h3 className="font-bold">من أين تأتي الإجابة</h3>
          <p className="text-muted">
            المساعد لا يمرّ بمحرك الذكاء الاصطناعي إلا عند الضرورة. يجرّب
            بالترتيب:
          </p>
          <Steps
            items={[
              [
                "جواب من المنصة نفسها",
                "أسئلة مثل «ما المطروح للاستثمار؟» أو «كم يحتاج القمح من المياه؟» تُجاب من بيانات المنصة وحساباتها مباشرة — فورية، بلا تكلفة، ويستحيل أن تُختلق.",
              ],
              [
                "مُدخل من قاعدة المعرفة",
                "إن كان هناك مُدخل موثّق يجيب على سؤالك بدقة، يُعرض هو.",
              ],
              [
                "إجابة محفوظة",
                "الزوار يكرّرون أسئلة بعضهم، فالسؤال المُجاب سابقاً يُخدَم من الذاكرة.",
              ],
              [
                "محرك المعرفة العامة",
                "وما بقي يُرسل للنموذج الذكي، وتبدأ إجابته بعبارة صريحة تقول إن المصدر خارج قاعدة المنصة المتحقق منها.",
              ],
            ]}
          />
          <Note title="ماذا لو تعطّل المحرك الذكي؟">
            <p>
              لا تخرج بيدين فارغتين: يعرض المساعد أقرب المُدخلات الموثّقة
              لسؤالك، موسومة بأنها تقريبية. التعطّل يكلّفك الإجابات العامة فقط،
              لا المساعد كله.
            </p>
          </Note>
          <h3 className="font-bold">قواعد تحكم إجاباته</h3>
          <ul className="list-disc space-y-1.5 pr-5 text-muted">
            <li>
              لا يختلق فرصة استثمارية ولا سعر حصة ولا عائداً غير موجود في
              البيانات.
            </li>
            <li>
              يفرّق بين «هل أستطيع الاستثمار في الجزيرة؟» — سؤال عن حالة المنصة —
              و«حدّثني عن الزراعة في الجزيرة؟» وهو سؤال معرفة يستحق إجابة وافية.
            </li>
            <li>
              يذكر الدولة المرجعية للمعلومة، وينبّه متى تحتاج تحققاً محلياً.
            </li>
            <li>لا يعطي نصيحة مالية قاطعة.</li>
          </ul>
          <p className="text-muted">
            وكل سؤال يُسجَّل بلا هويّة صاحبه، ليعرف الفريق ما تعجز قاعدة المعرفة
            عن الإجابة عنه فيكتبه.
          </p>
        </Section>

        {/* ---------------- water ---------------- */}
        <Section
          id="water"
          title="حاسبة الاحتياج المائي"
          who={["للمزارع", "للمستثمر"]}
        >
          <p className="text-muted">
            تعمل بلا تسجيل، وتجيب على السؤال الذي تُبنى عليه بقية الأرقام: كم
            متراً مكعباً يحتاج هذا المحصول في هذه المنطقة بهذه الطريقة؟
          </p>
          <Table
            head={["ما تُدخله", "الخيارات المتاحة"]}
            rows={[
              ["المحصول", CROPS.map((c) => c.name).join(" · ")],
              ["المنطقة", STATIONS.map((s) => s.name).join(" · ")],
              ["شهر الزراعة", "أي شهر من السنة"],
              [
                "طريقة الري",
                (Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[])
                  .map((m) => IRRIGATION_LABEL[m])
                  .join(" · "),
              ],
              ["المساحة", "بالفدان"],
            ]}
          />
          <h3 className="font-bold">ما تحصل عليه</h3>
          <ul className="list-disc space-y-1.5 pr-5 text-muted">
            <li>احتياج الفدان للموسم كاملاً بالمتر المكعب.</li>
            <li>الإجمالي لمساحتك كلها.</li>
            <li>
              ذروة الطلب اليومي باللتر في الثانية — وهي التي تحدد حجم المضخة.
            </li>
            <li>جدول شهري باستهلاك المحصول في كل شهر.</li>
            <li>نطاق العائد المتوقع لهذا المحصول.</li>
          </ul>
          <h3 className="font-bold">كيف يُحسب</h3>
          <p>
            على معيار منشور تستطيع مراجعته: ورقة منظمة الأغذية والزراعة رقم ٥٦
            (FAO-56). يُحسب البخر–نتح المرجعي من الحرارة وخط العرض، ثم يُضرب في
            معامل المحصول في كل مرحلة، ثم يُطرح منه المطر الفعّال، ثم يُقسم على
            كفاءة طريقة الري.
          </p>
          <Table
            head={["طريقة الري", "كفاءة الإيصال"]}
            rows={(Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[]).map(
              (m) => [IRRIGATION_LABEL[m], pct(IRRIGATION_EFFICIENCY[m])],
            )}
          />
          <p className="text-muted">
            أي أن الغمر يوصل للنبات جزءاً من كل متر مكعب تضخّه، والتنقيط أعلى
            كفاءة وأعلى تكلفة تأسيس.
          </p>
          <Note title="بيانات المناخ تقديرية لا مقيسة" tone="flag">
            <p>
              الأرقام الشهرية للحرارة والمطر معدّلات إرشادية للتخطيط، وليست
              قراءات محطة رصد على أرضك. استعملها لتحديد حجم المشروع ورتبة
              الأرقام، وتحقّق محلياً قبل شراء مضخة بناءً عليها.
            </p>
          </Note>
        </Section>

        {/* ---------------- lands ---------------- */}
        <Section id="lands" title="تسجيل الأرض وتوثيقها" who={["للمزارع"]}>
          <p className="text-muted">
            الأرض المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً. التسجيل مجاني
            ولا يظهر لأحد حتى تعتمده الإدارة.
          </p>
          <Table
            head={["البيان", "التفصيل"]}
            rows={[
              ["الاسم والموقع", "اسم الأرض · الولاية · المحلية · القرية"],
              ["صفة الحيازة", "ملك · إيجار · وغيرها"],
              ["الإحداثيات", "خط العرض وخط الطول — وجودهما يرفع درجة التوثيق"],
              ["المساحة", "بالفدان"],
              [
                "المنطقة المناخية",
                "أقرب محطة، وعليها يُبنى حساب المياه لهذه الأرض",
              ],
              [
                "مصدر المياه",
                (Object.keys(WATER_SOURCE_LABEL) as WaterSource[])
                  .map((w) => WATER_SOURCE_LABEL[w])
                  .join(" · "),
              ],
              [
                "المياه المتاحة للفدان",
                "بالمتر المكعب — الرقم الذي ستُقاس عليه كفاية المياه",
              ],
              ["البُعد عن السوق", "بالكيلومتر إلى أقرب طريق يعمل طوال السنة"],
              ["ملاحظات", "وصف التربة · ما زُرع سابقاً"],
            ]}
          />
          <h3 className="font-bold">المستندات الأربعة</h3>
          <p className="text-muted">
            إثبات حيازة أو عقد إيجار · صورة للأرض · تصريح أو موافقة · تقرير
            معاينة. المقبول: صور JPG أو PNG أو WEBP أو HEIC، أو ملف PDF، حتى ١٠
            ميغابايت. والصور تُضغط في متصفحك قبل الرفع حتى لا تستهلك باقتك.
          </p>
          <Note title="لماذا تُطلب صورة من موقع الأرض تحديداً">
            <p>
              الصورة الملتقطة في الموقع تحمل داخلها تاريخ التقاطها وغالباً
              إحداثياتها. المنصة تقرأ هذين الحقلين وتحفظهما قبل ضغط الصورة، لأن
              الضغط يمحوهما — وكان من غير الأمانة أن نقول إن الصورة الميدانية
              أقوى دليل ثم نمحو ما يجعلها كذلك.
            </p>
          </Note>
          <Table
            head={["حالة التحقق", "ما تعنيه"]}
            rows={[
              ["غير محقّقة", "سجّلتها ولم تُرسل للمراجعة بعد"],
              ["قيد المراجعة", "عند الإدارة الآن"],
              ["محقّقة", "اعتُمدت"],
              ["مرفوضة", "مع ملاحظة تشرح السبب وما ينقص"],
            ]}
          />
          <p className="text-muted">
            وبجانب الحالة عدّاد التوثيق (مثلاً ٢/٤)، يُحسب آلياً من الملفات
            المرفوعة فعلاً فلا يقول أكثر مما تسنده الملفات.
          </p>
        </Section>

        {/* ---------------- seasons ---------------- */}
        <Section
          id="seasons"
          title="إدارة الموسم الزراعي"
          who={["للمزارع", "للمستثمر"]}
        >
          <p className="text-muted">
            قلب المنصة: خطة موسم تُشتقّ من نموذج المياه بدل أن تُكتب بالتقدير،
            ومال يُصرف على مراحل مقابل أدلة. تختار المحصول والمنطقة وتاريخ
            الزراعة وطريقة الري والمساحة والميزانية للفدان، فيبني النظام الخطة
            كاملة: مراحل بتواريخ حقيقية، ونصيب كل مرحلة من المياه، ونصيبها من
            الميزانية.
          </p>

          <div className="flex w-full overflow-hidden rounded-xl border border-border">
            {STAGE_ORDER.map((k) => (
              <div
                key={k}
                style={{ flex: STAGE_TEMPLATES[k].budgetShare * 100 }}
                className="border-l border-border bg-primary/10 py-2.5 text-center text-[0.65rem] font-bold text-primary last:border-l-0"
              >
                {pct(STAGE_TEMPLATES[k].budgetShare)}
              </div>
            ))}
          </div>

          <Table
            head={["المرحلة", "الميزانية", "ما يُنجَز فيها"]}
            rows={STAGE_ORDER.map((k) => [
              STAGE_TEMPLATES[k].name,
              pct(STAGE_TEMPLATES[k].budgetShare),
              STAGE_TEMPLATES[k].activities.join(" · "),
            ])}
          />
          <p className="text-muted">
            التوزيع يتبع الواقع: التحضير والزراعة يأخذان النصيب الأكبر لأن
            المستلزمات تُشترى قبل أن ينبت شيء، والحصاد يأخذ نصيباً معتبراً لأن
            العمالة تبلغ ذروتها فيه.
          </p>

          <h3 className="font-bold">بوابة الصرف</h3>
          <Note title="شرطان معاً، لا واحد">
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
          </Note>
          <p>
            المستثمر يخاطر بمرحلة واحدة في كل مرة، والمزارع يُدفع له فور إثبات
            العمل بدل أن ينتظر نهاية خصومة.
          </p>

          <h3 className="font-bold">دفتر الحسابات</h3>
          <p className="text-muted">
            تسجّل فيه كل قيد بمبلغه ووصفه تحت أحد البنود:{" "}
            {Object.values(LEDGER_LABEL).join(" · ")}. ويعرض لك المصروف مقابل
            الميزانية المخططة، ونسبة كل بند من التكلفة، وصافي الربح وصافي ربح
            الفدان، ومقارنة نتيجتك بالوسيط المتوقع لهذا المحصول.
          </p>
          <p>
            وحين تُعتمد كل المراحل يظهر زرّ «أغلق الموسم واحتسبه في سجلي» — وهو
            ما يحوّل موسمك إلى سجل يُقاس عليه.
          </p>
        </Section>

        {/* ---------------- trust ---------------- */}
        <Section
          id="trust"
          title="مؤشر ثقة المنفّذ"
          who={["للمزارع", "للمستثمر"]}
        >
          <p className="text-muted">
            لكل منفّذ صفحة عامة تعرض درجته من ١٠٠ ومواسمه، محسوبة مما فعله فعلاً
            — لا من تقييم كتبه عن نفسه ولا من انطباعات.
          </p>
          <Weights factors={TRUST_FACTORS} />
          <Table
            head={["المرتبة", "متى"]}
            rows={[
              ["لا سجل بعد", "لم يُكمل أي موسم — ولا يُعطى رقماً بدل ذلك"],
              ["سجل قيد البناء", "أقل من موسمين مكتملين، أو درجة دون ٦٠"],
              ["سجل ثابت", "٦٠ فأكثر"],
              ["سجل موثوق", "٨٠ فأكثر"],
            ]}
          />
          <Note title="لماذا لا تُمنح درجة كاملة من أول موسم">
            <p>
              الدرجة تُسحب نحو المنتصف ما دام السجل رقيقاً، ولا تُصدَّق كاملةً
              قبل ثلاثة مواسم مكتملة. موسم واحد موفّق لا يصنع سجلاً، ومن لا سجل
              له يُقال عنه «لا سجل بعد» — لا صفر يظلمه ولا رقم جميل يخدع من
              يقرأه.
            </p>
          </Note>
          <p className="text-muted">
            وتفاصيل مصروفات المزارع تبقى خاصة به: ما يظهر على صفحته العامة
            مجاميع فقط، لا فواتيره.
          </p>
        </Section>

        {/* ---------------- opportunity ---------------- */}
        <Section id="opportunity" title="رفع فرصة استثمارية" who={["للمزارع"]}>
          <p className="text-muted">
            تعرض فيها مشروعاً على الإدارة للمراجعة — لا شيء يُنشر مباشرة. وأثناء
            تعبئة النموذج تُحسب الدرجة أمامك وتتحرك مع كل تعديل، فترى ما يرفعها
            وما يخفضها قبل الإرسال. وهذه معاينة فقط؛ الدرجة المعتمدة يعيد الخادم
            حسابها.
          </p>
          <Weights factors={RISK_FACTORS} />
          <p className="text-muted">
            وكل عامل يعيد سببه مكتوباً: درجة لا يستطيع المزارع مناقشتها هي درجة
            لا يستطيع إصلاحها، ولا يستطيع المستثمر تدقيقها. وكفاية المياه تحديداً
            محسوبة من نموذج FAO-56 لا مأخوذة على الثقة.
          </p>
          <Note title="مانعان يوقفان النشر مهما كانت الدرجة" tone="warn">
            <p>
              أن تكون المياه المتاحة لا تغطي احتياج المحصول — فالمشروع غير قابل
              للتنفيذ بهذه الأرقام أصلاً. أو أن يكون التوثيق ناقصاً. ومع أيّهما
              يُعطَّل زرّ الاعتماد نفسه في لوحة الإدارة.
            </p>
          </Note>
        </Section>

        {/* ---------------- investor ---------------- */}
        <Section
          id="investor"
          title="للمستثمر: المشاريع والمحفظة"
          who={["للمستثمر"]}
        >
          <p className="text-muted">
            {openProjects > 0
              ? `معروض الآن ${openProjects} مشروعاً على الصفحة الرئيسية.`
              : "الصفحة الرئيسية فارغة من المشاريع اليوم عن قصد: لا يُعرض مشروع قبل أن يكتمل إثبات حيازة أرضه، وتُجرى معاينة ميدانية، وتُصدر الجهة الزراعية موافقتها. سجّل اهتمامك عبر المساعد لتُبلَّغ عند طرح أول مشروع موثّق."}
          </p>
          <p>
            وصفحة كل مشروع تعرض: الموقع والمساحة، وسعر الحصة والحصص المتبقية،
            ونسبة التمويل، ومستوى المخاطرة، والتقارير الميدانية بصورها، ونموذج
            الاستثمار.
          </p>

          <h3 className="font-bold">خطط استثمارك</h3>
          <p className="text-muted">
            تجيب على أسئلة قصيرة تحدد تحمّلك للمخاطرة، وتُدخل المبلغ، فيقترح
            النظام توزيعه على المشاريع المفتوحة:
          </p>
          <Table
            head={["ملفك", "مخاطرة منخفضة", "متوسطة", "مرتفعة"]}
            rows={(
              [
                ["متحفّظ", "low"],
                ["متوازن", "medium"],
                ["مُقدِم", "high"],
              ] as [string, RiskProfile][]
            ).map(([label, profile]) => [
              label,
              pct(RISK_WEIGHTS[profile].low),
              pct(RISK_WEIGHTS[profile].medium),
              pct(RISK_WEIGHTS[profile].high),
            ])}
          />
          <p className="text-muted">
            التوزيع آلي ويحترم الحصص المتاحة فعلاً في كل مشروع — وليس توصية
            مالية شخصية.
          </p>

          <h3 className="font-bold">نطاق العائد بدل الرقم الواحد</h3>
          <p>
            المنصة لا تعرض «عائداً سنوياً متوقعاً» رقماً واحداً لأنه يخفي بالضبط
            ما يحتاج المستثمر معرفته. تعرض بدله: السيناريو المتشائم (أسوأ عُشر
            المواسم)، والوسيط، والسيناريو المتفائل (أفضل عُشر)، واحتمال أن ينتهي
            الموسم عند نقطة التعادل أو دونها.
          </p>
          <Note title="الأرقام متحفّظة عن قصد" tone="flag">
            <p>
              الدراسات التي روجعت قبل بناء المنصة افترضت إيراداً بين ٣٠٠٠ و٥٠٠٠
              دولار للفدان — أي أربعة إلى ستة أضعاف ما تعطيه الحبوب المروية في
              السودان فعلاً. أرقام سودجري مبنية على اقتصاديات واقعية، وستبدو أقل
              بريقاً من أي عرض آخر قد يصلك. هذا مقصود.
            </p>
          </Note>
        </Section>

        {/* ---------------- mining ---------------- */}
        <Section
          id="mining"
          title="التعدين وسجلّ إثبات المنشأ"
          who={["للمعدّن"]}
        >
          <p className="text-muted">
            قسم مستقل تماماً عن الزراعة، ولا تختلط معرفته بالمحاصيل في أي صفحة.
          </p>
          <Note title="قبل أي شيء" tone="warn">
            <p>
              حرق ملغم الزئبق في مكان مغلق أو قرب السكن يسمّم من فيه لا العامل
              وحده، والضرر العصبي منه لا يُشفى. والنزول لإنقاذ مصاب في حفرة بلا
              تهوية يقتل المُنقِذ أيضاً — أغلب حوادث الاختناق تأخذ اثنين لا
              واحداً.
            </p>
          </Note>
          <Note title="هذا سجلّ لا سوق" tone="flag">
            <p>
              لا سعر ولا مشترٍ ولا عمولة ولا وساطة — تسجيل معلومات فقط. القيمة
              في هذا القطاع انتقلت أصلاً من امتلاك الذهب إلى إثبات مصدره، ومن
              يبني هذا الإثبات الآن يكون جاهزاً ببيانات سنوات حين تُفتح قناة
              قانونية، لا بنظام فارغ.
            </p>
          </Note>
          <Steps
            items={[
              [
                "سجّل الموقع",
                "اسمه وولايته وإحداثياته، وهل له ترخيص، وهل زاره مفتّش مستقل.",
              ],
              [
                "سجّل الشحنة",
                "رقمها المرجعي، وتاريخ الاستخراج، والوزن بالجرام، والعيار، وطريقة الاستخلاص.",
              ],
              [
                "أضف حلقات الحيازة",
                "كل انتقال: من مَن إلى مَن، وبأي صفة، ومتى، وبأي وزن وعيار، ومع أدلته.",
              ],
              [
                "اقرأ ما وجده السجل",
                "يفحص سلسلتك آلياً، ويعطيك درجة توثيق من ١٠٠، ويسمّي كل خلل باسمه.",
              ],
            ]}
          />
          <Note title="حلقات الحيازة لا تُعدَّل بعد إضافتها">
            <p>
              تُضاف حلقة جديدة ولا يُغيَّر ما مضى — لأن سجلاً قابلاً للتعديل لا
              يُثبت شيئاً.
            </p>
          </Note>
          <h3 className="font-bold">ميزان الكتلة</h3>
          <p>
            التنقية تُزيل الشوائب، فمحتوى الذهب الصافي على امتداد السلسلة يمكن
            أن ينقص فقط. فإن ارتفع، فقد دخلت الشحنةَ مادةٌ لم تُسجَّل قط — وهذه
            بصمة ذهب غير موثّق يُخلط بشحنة موثّقة. لذلك يُسجَّل الوزن والعيار عند
            كل حلقة لا عند البداية وحدها.
          </p>
          <Table
            head={["مكوّن الدرجة", "الوزن"]}
            rows={[
              ["المنشأ — ترخيص، إحداثيات، معاينة مستقلة", "٤٠٪"],
              ["سلامة السلسلة — تسلسل، تواريخ، أدلة، ميزان كتلة", "٤٠٪"],
              ["طريقة الاستخلاص", "٢٠٪"],
            ]}
          />
          <p className="text-muted">
            وأي علامة حمراء قاطعة — وجود مسلح في الموقع أو قربه، أو عمالة أطفال،
            أو سلسلة مكسورة — تسقُف الدرجة عند ٢٥ مهما اكتمل باقي التوثيق.
            والفحوص تتبع إرشادات منظمة التعاون الاقتصادي والتنمية للعناية الواجبة
            في سلاسل توريد المعادن من المناطق المتأثرة بالنزاع. والدرجة تصف
            اكتمال التوثيق فقط، لا قيمة الشحنة ولا سعرها.
          </p>
        </Section>

        {/* ---------------- admin ---------------- */}
        <Section id="admin" title="لوحة الإدارة" who={["للإداريين فقط"]}>
          <p className="text-muted">
            تظهر مجموعة «الإدارة» في القائمة لمن كانت صفته إدارية فقط، وكل صفحة
            فيها تتحقق من الصفة عند الخادم لا في المتصفح.
          </p>
          <Table
            head={["الصفحة", "ما فيها"]}
            rows={[
              [
                "لوحة المشاريع",
                "إنشاء المشاريع وتعديلها، وتأكيد طلبات الاستثمار، ونشر التقارير الميدانية — ومؤشر صحة النظام بآخر فحص دوري وما رصده.",
              ],
              [
                "مراجعة الفرص",
                "كل فرصة مرفوعة ومعها درجتها مُعاد حسابها من بياناتها لا كما أرسلها المتصفح، وتفصيل العوامل. القراران: اعتمد وانشر، أو ارفض بسبب يصل صاحبها في إشعاره.",
              ],
              [
                "التحليلات",
                "فجوات قاعدة المعرفة (أسئلة لم يجد لها المسترجِع مُدخلاً — وكل سطر منها مُدخل ينقصك)، وأكثر ما يسأل عنه الزوار، وتغطية القاعدة.",
              ],
              [
                "العملاء المحتملون",
                "من سجّل اهتمامه عبر المساعد. الإدخال مفتوح والقراءة للإدارة وحدها.",
              ],
            ]}
          />
        </Section>

        {/* ---------------- privacy ---------------- */}
        <Section id="privacy" title="الخصوصية ومن يرى ماذا" who={["للجميع"]}>
          <p className="text-muted">
            الفصل بين البيانات مفروض في قاعدة البيانات نفسها لا في شيفرة
            الصفحات، أي أن الحماية لا تسقط لو أخطأت صفحة في ترشيح ما تعرضه.
          </p>
          <Table
            head={["البيان", "من يراه"]}
            rows={[
              [
                "قاعدة المعرفة · الحاسبة · المشاريع المنشورة",
                "الجميع بلا تسجيل",
              ],
              ["أراضيك ومستنداتها", "أنت والإدارة"],
              ["دفتر حسابات موسمك وفواتيره", "أنت وحدك"],
              ["مجاميع مواسمك ودرجة ثقتك", "الجميع — مجاميع فقط"],
              ["استثماراتك", "أنت والإدارة"],
              ["إشعاراتك", "أنت وحدك"],
              ["بيانات العملاء المحتملين", "الإدارة وحدها"],
            ]}
          />
          <Note title="رقم جوالك اليوم مُعرِّف لا رقم مُتحقَّق منه" tone="flag">
            <p>
              ما دام إرسال الرسائل النصية غير مُفعّل، فالمنصة لا تستطيع إثبات أن
              الرقم يخصّك، ولن يُعرض في أي مكان على أنه «موثَّق». وهذا مقبول في
              مرحلة التسجيل، ولن يكون مقبولاً يوم تتحرك أموال حقيقية.
            </p>
          </Note>
        </Section>

        {/* ---------------- limits ---------------- */}
        <Section id="limits" title="حدود المنصة" who={["للجميع"]}>
          <p className="text-muted">
            ما لا تفعله سودجري، مكتوباً صراحة، لأن معرفته جزء من استعمالها
            الصحيح.
          </p>
          <ul className="list-disc space-y-2 pr-5">
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
        </Section>
      </div>

      <footer className="mt-12 border-t border-border pt-6 text-sm text-muted">
        <p>
          أرقام هذا الدليل مقروءة من المنصة نفسها وقت فتحك للصفحة، لا منسوخة
          يدوياً — فما تغيّر في المنصة يتغيّر هنا معه.
        </p>
        <p className="mt-3">
          بقي سؤال؟{" "}
          <Link href="/" className="text-primary underline">
            اسأل مساعد سودجري
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
