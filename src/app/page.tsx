import Link from "next/link";
import { Suspense } from "react";
import { PHOTOS } from "@/lib/photos";
import { PhotoBoard, QuickTabs, type BoardTile, type QuickTab } from "@/components/HomeBoard";
import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import Icon from "@/components/Icon";
import RainHomeCard from "@/components/RainHomeCard";
import HeroVideo from "@/components/HeroVideo";
import { CROPS, STATIONS } from "@/lib/agronomy";
import type { Project } from "@/types/database";

/**
 * الصفحة الأولى — ما تملكه المنصّة، لا ما تعد به.
 *
 * The page used to open with a sentence about serving every Sudanese farmer and
 * investor, which is the one thing a visitor cannot check — and which every
 * platform at this stage says. So the hero now leads with the four numbers that
 * are true today: the FAOSTAT observations loaded, the reviewed entries, the
 * crops carrying FAO-56 coefficients, the climate stations. A figure a reader
 * can go and verify does more for trust than any adjective, and it is the same
 * argument the rest of the site makes.
 *
 * Two of the four are counted from the database at request time rather than
 * written into the copy, with `head: true` so the count costs no rows on the
 * wire. A number in prose goes stale, and a landing page quietly overstating
 * its own content is precisely the failure this platform criticises elsewhere.
 */

const n0 = (v: number) => v.toLocaleString("en-US");

/**
 * بطاقاتُ اللوحة — كلُّ واحدةٍ تقود إلى ما يُفتح للزائر بلا حساب.
 * الأرضُ والقطيعُ يحتاجان حساباً، فبابُهما `/signup` الذي يقول ذلك صراحةً،
 * لا `/lands` التي تُحوِّل بصمتٍ إلى شاشة الدخول. والأولى، حاسبةُ الماء،
 * أكبرُها: هي ما يأتي المزارعون من أجله.
 */
const BOARD: BoardTile[] = [
  {
    photo: PHOTOS.solarPump,
    alt: "مزارع عند مضخة تعمل بالطاقة الشمسية تصبّ الماء في ترعة إلى جوار حقل بصل",
    title: "كم يحتاج محصولك من الماء؟",
    note: "احسبه على مناخ ولايتك وطريقة ريّك — مجاناً وبلا تسجيل.",
    href: "/tools/water",
  },
  {
    photo: PHOTOS.geziraFarmer,
    alt: "مزارع يقف عند حقل ذرة إلى جوار ترعة ريّ ترابية",
    title: "سجّل أرضك ووثّق موسمك",
    note: "أرضٌ موثّقة وموسمٌ بأدلّته — يحتاج حساباً.",
    href: "/signup",
  },
  {
    photo: PHOTOS.grainSoil,
    alt: "كفّان تغرفان حبوباً من جوال، وإلى جوارهما عيّنة تربة ودفتر",
    title: "قاعدة المعرفة",
    note: "محاصيلُ وتربةٌ وماء — كلُّ مُدخلٍ بمصدره.",
    href: "/knowledge",
  },
  {
    photo: PHOTOS.womenHarvest,
    alt: "نساء يحصدن الفول السوداني ويغربلنه في سلّة من السعف",
    title: "النفير",
    note: "العملُ المشترك: نفيرٌ وفزعةٌ وشورى وجودية.",
    href: "/nafir",
  },
  {
    photo: PHOTOS.canalRegulator,
    alt: "قنطرة ريّ على ترعة",
    title: "الترع",
    note: "أعضاءُ كلّ ترعة ونوباتُ مائها وواجبُ صيانتها.",
    href: "/nafir/canals",
  },
  {
    photo: PHOTOS.landSurvey,
    alt: "مسّاح يحمل جهاز تحديد مواقع على أرض متشقّقة وجرّار يحرث خلفه",
    title: "الخدمات التعاقدية",
    note: "حراثةٌ ومساحةٌ وريّ بسعرٍ معلن.",
    href: "/services",
  },
  {
    photo: PHOTOS.vetHerd,
    alt: "طبيب بيطري يحقن بقرة ذات سنام وراعيها يمسك قرنها",
    title: "خدماتٌ للقطيع",
    note: "تطعيمٌ وعلاجٌ من مقدّمي خدمةٍ مسجّلين.",
    href: "/services",
  },
  {
    photo: PHOTOS.herdCanal,
    alt: "قطيع بقر ذي سنام يسير بمحاذاة ترعة في الغبار",
    title: "الإنتاج الحيواني",
    note: "علفُ القطيع وميزانيّتُه مرحلةً مرحلة — يحتاج حساباً.",
    href: "/signup",
  },
  {
    photo: PHOTOS.exportStore,
    alt: "مخزن فيه جوالات سمسم وصمغ عربي وعمّال يحمّلون شاحنة",
    title: "ممرّ الصادر",
    note: "الصمغُ والسمسمُ والماشية — حصصُها وأسواقُها.",
    href: "/export",
  },
  {
    photo: PHOTOS.dateHarvest,
    alt: "رجل على نخلة يُنزل سلّة تمر ورجال يتلقّونها والنيل خلفهم",
    title: "عروض التصدير",
    note: "العروضُ المنشورة بمستنداتها.",
    href: "/export/market",
  },
  {
    photo: PHOTOS.irrigatedPlain,
    alt: "سهل مرويّ من الجوّ بشبكة حقول هندسية",
    title: "دراسة الجدوى",
    note: "أين آخرُ مخرجٍ آمن قبل أن تُنفق أكثر.",
    href: "/tools/feasibility",
  },
  {
    photo: PHOTOS.nileDam,
    alt: "سدّ خرسانيّ على نهر واسع وخزانه خلفه",
    title: "القناة القوسية",
    note: "المسارُ والتضاريسُ والتربةُ والكلفة.",
    href: "/arc-canal",
  },
  {
    photo: PHOTOS.miningSieve,
    alt: "معدّنون بخوذات وكمّامات يغربلون التراب عند بئر خشبية",
    title: "التعدين",
    note: "قسمٌ مستقلّ، لا يختلط بالزراعة.",
    href: "/mining",
  },
];

/** ما يعود إليه الناس: بلمسةٍ واحدة، دون المرور بالصور. */
const TABS: QuickTab[] = [
  { href: "/news", icon: "news", label: "الأخبار" },
  { href: "/rain", icon: "cloud", label: "الأمطار" },
  { href: "/guide", icon: "compass", label: "الدليل" },
  { href: "/knowledge", icon: "book", label: "المعرفة" },
  { href: "/tools/feasibility", icon: "chart", label: "الجدوى" },
  { href: "/feedback", icon: "message", label: "ملاحظاتك" },
];

export default async function Home() {
  const supabase = await createClient();

  const [{ data: projects }, { count: kbCount }, { count: faoCount }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("knowledge_entries").select("id", { count: "exact", head: true }),
    supabase
      .from("faostat_observations")
      .select("id", { count: "exact", head: true }),
  ]);

  /*
   * Falling back to a literal when the count fails would print a number the
   * database did not confirm — on the one page whose argument is that the
   * numbers are real. A missing count drops its tile instead.
   */
  const stats: { value: string; label: string; note: string }[] = [
    faoCount
      ? {
          value: n0(faoCount),
          label: "مشاهدة من FAOSTAT",
          note: "غلّة وأسعار وتجارة، محمَّلة داخل المنصّة",
        }
      : null,
    kbCount
      ? {
          value: n0(kbCount),
          label: "مُدخل معرفة مراجَع",
          note: "كلٌّ بمصدره ودولته المرجعية",
        }
      : null,
    {
      value: n0(CROPS.length),
      label: "محصولاً بمعاملات FAO-56",
      note: "أطوار النمو ومعاملات المحصول",
    },
    {
      value: n0(STATIONS.length),
      label: "محطة مناخية",
      note: "متوسّطات NASA POWER لعشرين سنة",
    },
  ].filter((s): s is { value: string; label: string; note: string } => s !== null);

  return (
    <div>
      {/* ───────────────────────── الواجهة ───────────────────────── */}
      <section className="mesh overflow-x-clip border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          {/*
            الفيديو والشعارُ في إطارٍ واحد: يعمل المقطعُ مرّةً ثمّ يظهر الشعار
            مكانه (المالك، 26 سبتمبر: «ادمجهم»). والشعارُ المنفصل تحت الإطار حُذف
            بطلبه («احذفها… واستفد من المساحة، الفيديو أكبر»)، فكبُر الإطار.
          */}
          <HeroVideo />

          <div className="mt-10">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Icon name="wheat" className="size-5" />
            معرفة زراعية وبيانات مفتوحة — للسودان
          </p>

          <h1
            className="max-w-3xl font-black leading-[1.15]"
            style={{ fontSize: "var(--text-display)" }}
          >
            كل رقمٍ هنا يمكنك أن تعيد حسابه بنفسك
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            سوداقري منصّة معرفة زراعية وبيانات للسودان. لا يُعرض رقمٌ دون مصدره
            ومنهجه: الغلّة من FAOSTAT، والمناخ من NASA POWER، والتربة من
            SoilGrids، والاحتياج المائي محسوبٌ بمحرّك FAO-56 داخل المنصّة نفسها.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {/* والمزارعُ له بابٌ في الواجهة لا في أسفل الصفحة وحدها، وحاسبةُ
                الماء أكبرُ بطاقات اللوحة. */}
            <Link
              href="/signup"
              className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground shadow-raised transition hover:opacity-90"
            >
              سجّل أرضك ووثّق موسمك
            </Link>
            <Link
              href="/arc-canal"
              className="rounded-xl border border-border bg-card px-5 py-3 font-medium shadow-card transition hover:shadow-raised"
            >
              اقرأ دراسة القناة القوسية
            </Link>
          </div>
          </div>


          {/*
            The gap-px over a border-coloured background draws the hairlines
            between tiles without giving each tile its own border, so the strip
            reads as one instrument panel rather than four boxes.

            auto-fit rather than a fixed four columns, because the tile count is
            not fixed: a count that fails drops its tile, and a fixed grid then
            leaves an empty cell showing the border colour as a grey slab. That
            is not hypothetical — it is exactly what rendering this page in an
            environment that could not reach the database produced.
          */}
          <dl
            className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-card"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))" }}
          >
            {stats.map((s) => (
              <div key={s.label} className="bg-card p-5">
                <dt className="text-xs text-muted">{s.label}</dt>
                <dd className="figure mt-1 text-2xl font-black text-primary sm:text-3xl">
                  {s.value}
                </dd>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  {s.note}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────────────────────── التبويبات ─────────────────────────
       * طلب المالك (25 سبتمبر): الرئيسيّةُ واجهةٌ ثمّ لوحة. والأخبار خرجت منها
       * إلى صفحتها `/news`، ولها هنا تبويبٌ أوّل بدل شريطٍ بين الأقسام.
       */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <QuickTabs tabs={TABS} />
      </section>

      {/* ───────────────────────── توقّع الأمطار ─────────────────────────
       * الخريطةُ نفسها هنا، والبطاقةُ كلُّها تفتح صفحة /rain.
       */}
      <Suspense fallback={null}>
        <RainHomeCard />
      </Suspense>

      {/* ───────────────────────── اللوحة ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <h2 className="font-bold" style={{ fontSize: "var(--text-section)" }}>
          أقسام سوداقري
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">المس أيَّ بطاقة لتفتح قسمها.</p>
        <PhotoBoard tiles={BOARD} />
      </section>

      {/* ───────────────────────── الحالة ─────────────────────────
       * حين لا يُنشر مشروع فقط: كانت تظهر دائماً، فتقول «لا توجد فرص» فوق
       * قائمةِ المشاريع نفسها يوم يُنشر أوّلها.
       */}
      {!(projects && projects.length > 0) && (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5">
            <Icon name="shield" className="mt-0.5 size-5 shrink-0 text-accent" />
            <p className="text-sm leading-relaxed">
              <strong className="font-bold">
                لا توجد فرص استثمار مطروحة حالياً
              </strong>{" "}
              — ولن يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً. أمّا
              الأدوات وقاعدة المعرفة فتعمل الآن، مجاناً وبلا تسجيل.
            </p>
          </div>
        </section>
      )}

      {/* ───────────────────────── المشاريع ─────────────────────────
       * يظهر حين يُنشر مشروعٌ فقط.
       */}
      {projects && projects.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-bold" style={{ fontSize: "var(--text-title)" }}>
              المشاريع المتاحة
            </h2>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
              كلّ المشاريع ←
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(projects as Project[]).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
