import Link from "next/link";
import { Suspense } from "react";
import { PHOTOS } from "@/lib/photos";
import { PhotoBoard, QuickTabs, type BoardTile, type QuickTab } from "@/components/HomeBoard";
import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import Icon from "@/components/Icon";
import RainHomeCard from "@/components/RainHomeCard";
import HeroVideo from "@/components/HeroVideo";
import SeasonStrip from "@/components/SeasonStrip";
import MarketTicker from "@/components/MarketTicker";
import { CROPS, STATIONS } from "@/lib/agronomy";
import type { Project } from "@/types/database";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

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
const BOARD: (BoardTile & { en: Pick<BoardTile, "alt" | "title" | "note"> })[] = [
  {
    photo: PHOTOS.solarPump,
    alt: "مزارع عند مضخة تعمل بالطاقة الشمسية تصبّ الماء في ترعة إلى جوار حقل بصل",
    title: "كم يحتاج محصولك من الماء؟",
    note: "احسبه على مناخ ولايتك وطريقة ريّك — مجاناً وبلا تسجيل.",
    en: {
      alt: "A farmer at a solar-powered pump pouring water into a canal beside an onion field",
      title: "How much water does your crop need?",
      note: "Work it out for your state's climate and your irrigation method — free, no sign-up.",
    },
    href: "/tools/water",
  },
  {
    photo: PHOTOS.geziraFarmer,
    alt: "مزارع يقف عند حقل ذرة إلى جوار ترعة ريّ ترابية",
    title: "سجّل أرضك ووثّق موسمك",
    note: "أرضٌ موثّقة وموسمٌ بأدلّته — يحتاج حساباً.",
    en: { alt: "A farmer standing by a sorghum field next to an earth irrigation canal", title: "Register your land and record your season", note: "Verified land and a season with its evidence — needs an account." },
    href: "/signup",
  },
  {
    photo: PHOTOS.grainSoil,
    alt: "كفّان تغرفان حبوباً من جوال، وإلى جوارهما عيّنة تربة ودفتر",
    title: "قاعدة المعرفة",
    note: "محاصيلُ وتربةٌ وماء — كلُّ مُدخلٍ بمصدره.",
    en: { alt: "Two hands scooping grain from a sack, with a soil sample and a notebook beside them", title: "Knowledge base", note: "Crops, soil and water — every entry with its source." },
    href: "/knowledge",
  },
  {
    photo: PHOTOS.womenHarvest,
    alt: "نساء يحصدن الفول السوداني ويغربلنه في سلّة من السعف",
    title: "النفير",
    note: "العملُ المشترك: نفيرٌ وفزعةٌ وشورى وجودية.",
    en: { alt: "Women harvesting groundnuts and sifting them in a palm-leaf basket", title: "Nafir", note: "Working together: nafir, faza, shura and judiyya." },
    href: "/nafir",
  },
  {
    photo: PHOTOS.canalRegulator,
    alt: "قنطرة ريّ على ترعة",
    title: "الترع",
    note: "أعضاءُ كلّ ترعة ونوباتُ مائها وواجبُ صيانتها.",
    en: {
      alt: "An irrigation regulator on a canal",
      title: "Canals",
      note: "Each canal's members, its water turns and its upkeep duty.",
    },
    href: "/nafir/canals",
  },
  {
    photo: PHOTOS.landSurvey,
    alt: "مسّاح يحمل جهاز تحديد مواقع على أرض متشقّقة وجرّار يحرث خلفه",
    title: "الخدمات التعاقدية",
    note: "حراثةٌ ومساحةٌ وريّ بسعرٍ معلن.",
    en: { alt: "A surveyor holding a GPS unit on cracked land with a tractor ploughing behind him", title: "Contract services", note: "Ploughing, surveying and irrigation at a published price." },
    href: "/services",
  },
  {
    photo: PHOTOS.vetHerd,
    alt: "طبيب بيطري يحقن بقرة ذات سنام وراعيها يمسك قرنها",
    title: "خدماتٌ للقطيع",
    note: "تطعيمٌ وعلاجٌ من مقدّمي خدمةٍ مسجّلين.",
    en: { alt: "A vet injecting a humped cow while its herder holds its horn", title: "Services for the herd", note: "Vaccination and treatment from registered providers." },
    href: "/services",
  },
  {
    photo: PHOTOS.herdCanal,
    alt: "قطيع بقر ذي سنام يسير بمحاذاة ترعة في الغبار",
    title: "الإنتاج الحيواني",
    note: "علفُ القطيع وميزانيّتُه مرحلةً مرحلة — يحتاج حساباً.",
    en: { alt: "A herd of humped cattle walking along a canal in the dust", title: "Livestock production", note: "Feed and budget for the herd, stage by stage — needs an account." },
    href: "/signup",
  },
  {
    photo: PHOTOS.exportStore,
    alt: "مخزن فيه جوالات سمسم وصمغ عربي وعمّال يحمّلون شاحنة",
    title: "ممرّ الصادر",
    note: "الصمغُ والسمسمُ والماشية — حصصُها وأسواقُها.",
    en: { alt: "A store with sacks of sesame and gum arabic, and workers loading a truck", title: "Export corridor", note: "Gum, sesame and livestock — their quotas and markets." },
    href: "/export",
  },
  {
    photo: PHOTOS.dateHarvest,
    alt: "رجل على نخلة يُنزل سلّة تمر ورجال يتلقّونها والنيل خلفهم",
    title: "عروض التصدير",
    note: "العروضُ المنشورة بمستنداتها.",
    en: { alt: "A man in a palm tree lowering a basket of dates to men below, the Nile behind them", title: "Export offers", note: "Published offers with their documents." },
    href: "/export/market",
  },
  {
    photo: PHOTOS.irrigatedPlain,
    alt: "سهل مرويّ من الجوّ بشبكة حقول هندسية",
    title: "دراسة الجدوى",
    note: "أين آخرُ مخرجٍ آمن قبل أن تُنفق أكثر.",
    en: { alt: "An irrigated plain from the air, a grid of geometric fields", title: "Feasibility study", note: "Where the last safe exit is, before you spend more." },
    href: "/tools/feasibility",
  },
  {
    photo: PHOTOS.nileDam,
    alt: "سدّ خرسانيّ على نهر واسع وخزانه خلفه",
    title: "القناة القوسية",
    note: "المسارُ والتضاريسُ والتربةُ والكلفة.",
    en: { alt: "A concrete dam on a wide river with its reservoir behind it", title: "The Arc Canal", note: "Route, terrain, soil and cost." },
    href: "/arc-canal",
  },
  {
    photo: PHOTOS.miningSieve,
    alt: "معدّنون بخوذات وكمّامات يغربلون التراب عند بئر خشبية",
    title: "التعدين",
    note: "قسمٌ مستقلّ، لا يختلط بالزراعة.",
    en: { alt: "Miners in helmets and masks sieving soil at a wooden shaft", title: "Mining", note: "A separate section, kept apart from farming." },
    href: "/mining",
  },
];

/** ما يعود إليه الناس: بلمسةٍ واحدة، دون المرور بالصور. */
const TABS: (QuickTab & { en: string })[] = [
  { href: "/news", icon: "news", label: "الأخبار", en: "News" },
  { href: "/rain", icon: "cloud", label: "الأمطار", en: "Rain" },
  { href: "/guide", icon: "compass", label: "الدليل", en: "Guide" },
  { href: "/knowledge", icon: "book", label: "المعرفة", en: "Knowledge" },
  { href: "/tools/feasibility", icon: "chart", label: "الجدوى", en: "Feasibility" },
  { href: "/feedback", icon: "message", label: "ملاحظاتك", en: "Feedback" },
];

export default async function Home() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const tiles: BoardTile[] = BOARD.map(({ en, ...tile }) =>
    locale === "en" ? { ...tile, ...en } : tile,
  );
  const tabs: QuickTab[] = TABS.map(({ en, ...tab }) =>
    locale === "en" ? { ...tab, label: en } : tab,
  );
  const supabase = await createClient();

  const [{ data: projects }, { count: kbCount }, { count: faoCount }, { data: kbLatest }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("knowledge_entries").select("id", { count: "exact", head: true }),
    supabase
      .from("faostat_observations")
      .select("id", { count: "exact", head: true }),
    // آخرُ إضافةٍ إلى قاعدة المعرفة (البند ١٠٦): «آخر تحديث» من القاعدة نفسها لا تاريخٌ يُكتب باليد.
    supabase
      .from("knowledge_entries")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const kbLatestAt = (kbLatest?.[0] as { created_at?: string } | undefined)?.created_at;

  /*
   * Falling back to a literal when the count fails would print a number the
   * database did not confirm — on the one page whose argument is that the
   * numbers are real. A missing count drops its tile instead.
   */
  const stats: { value: string; label: string; note: string }[] = [
    faoCount
      ? {
          value: n0(faoCount),
          label: t("مشاهدة من FAOSTAT", "FAOSTAT observations"),
          note: t("غلّة وأسعار وتجارة، محمَّلة داخل المنصّة", "Yields, prices and trade, loaded on the platform"),
        }
      : null,
    kbCount
      ? {
          value: n0(kbCount),
          label: t("مُدخل معرفة مراجَع", "reviewed knowledge entries"),
          note: t("كلٌّ بمصدره ودولته المرجعية", "Each with its source and reference country"),
        }
      : null,
    {
      value: n0(CROPS.length),
      label: t("محصولاً بمعاملات FAO-56", "crops with FAO-56 coefficients"),
      note: t("أطوار النمو ومعاملات المحصول", "Growth stages and crop coefficients"),
    },
    {
      value: n0(STATIONS.length),
      label: t("محطة مناخية", "climate stations"),
      note: t("متوسّطات NASA POWER لعشرين سنة", "Twenty-year NASA POWER averages"),
    },
    // يسقط إن لم تُجب القاعدة — كالعدّادين أعلاه: لا تاريخَ لم تؤكّده.
    kbLatestAt
      ? {
          value: new Date(kbLatestAt).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
            day: "numeric",
            month: "long",
            timeZone: "Africa/Khartoum",
          }),
          label: t("آخر إضافة لقاعدة المعرفة", "latest knowledge-base entry"),
          note: t("تُغذّى كلَّ يومين من مصادر موثّقة", "Fed every two days from documented sources"),
        }
      : null,
  ].filter((s): s is { value: string; label: string; note: string } => s !== null);

  return (
    <div>
      {/* ───────────────────────── الواجهة ───────────────────────── */}
      <section className="mesh overflow-x-clip">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          {/*
            الفيديو والشعارُ في إطارٍ واحد: يعمل المقطعُ مرّةً ثمّ يظهر الشعار
            مكانه (المالك، 26 سبتمبر: «ادمجهم»). والشعارُ المنفصل تحت الإطار حُذف
            بطلبه («احذفها… واستفد من المساحة، الفيديو أكبر»)، فكبُر الإطار.
          */}
          <HeroVideo />

          <div className="mt-10">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose/10 px-3 py-1 text-sm font-bold text-rose">
            <Icon name="wheat" className="size-5" />
            {t("معرفة زراعية وبيانات مفتوحة — للسودان", "Agricultural knowledge and open data — for Sudan")}
          </p>

          <h1
            className="max-w-3xl font-black leading-[1.15]"
            style={{ fontSize: "var(--text-display)" }}
          >
            {t("كل رقمٍ هنا يمكنك أن تعيد حسابه", "Every number here is one you can recompute")}{" "}
            {/* The phrase the whole platform rests on, in the sunset (backlog 121). */}
            <span className="text-sunset">{t("بنفسك", "yourself")}</span>
          </h1>
          {/* خطُّ النيل (البند ١٠٦): يُرسم مرّةً تحت العنوان، أخضرَ ينساب إلى الكركدي. */}
          <svg className="nile-line mt-3 h-4 w-56 max-w-full" viewBox="0 0 400 24" fill="none" aria-hidden>
            <defs>
              <linearGradient id="nile" x1="1" x2="0">
                <stop offset="0" stopColor="var(--primary)" />
                <stop offset="1" stopColor="var(--rose)" />
              </linearGradient>
            </defs>
            <path d="M4 14c40-12 70 10 110 0s70-12 110 0 70 10 110 0 40-8 62-4" stroke="url(#nile)" strokeWidth="4" strokeLinecap="round" />
          </svg>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {t(
              "سوداقري منصّة معرفة زراعية وبيانات للسودان. لا يُعرض رقمٌ دون مصدره ومنهجه: الغلّة من FAOSTAT، والمناخ من NASA POWER، والتربة من SoilGrids، والاحتياج المائي محسوبٌ بمحرّك FAO-56 داخل المنصّة نفسها.",
              "Sudagri is an agricultural knowledge and data platform for Sudan. No number is shown without its source and method: yields from FAOSTAT, climate from NASA POWER, soil from SoilGrids, and crop water needs computed by an FAO-56 engine on the platform itself.",
            )}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {/* والمزارعُ له بابٌ في الواجهة لا في أسفل الصفحة وحدها، وحاسبةُ
                الماء أكبرُ بطاقات اللوحة. */}
            <Link
              href="/signup"
              className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground shadow-raised transition hover:opacity-90"
            >
              {t("سجّل أرضك ووثّق موسمك", "Register your land and record your season")}
            </Link>
            <Link
              href="/arc-canal"
              className="rounded-xl border border-border bg-card px-5 py-3 font-medium shadow-card transition hover:shadow-raised"
            >
              {t("اقرأ دراسة القناة القوسية", "Read the Arc Canal study")}
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
      {/* شريطُ التوب السوداني (البند ١٠٦) بدل الخطّ الرفيع بين الواجهة وما بعدها. */}
      <div className="toub-rule" aria-hidden />

      {/* ───────────────────────── التبويبات ─────────────────────────
       * طلب المالك (25 سبتمبر): الرئيسيّةُ واجهةٌ ثمّ لوحة. والأخبار خرجت منها
       * إلى صفحتها `/news`، ولها هنا تبويبٌ أوّل بدل شريطٍ بين الأقسام.
       */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <QuickTabs tabs={tabs} label={t("تبويبات سريعة", "Quick links")} />
        <div className="mt-3">
          <SeasonStrip locale={locale} />
          <MarketTicker locale={locale} />
        </div>
      </section>

      {/* ───────────────────────── توقّع الأمطار ─────────────────────────
       * الخريطةُ نفسها هنا، والبطاقةُ كلُّها تفتح صفحة /rain.
       */}
      <Suspense fallback={null}>
        <RainHomeCard />
      </Suspense>

      {/* ───────────────────────── اللوحة ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <h2 className="title-bar font-bold" style={{ fontSize: "var(--text-section)" }}>
          {t("أقسام سوداقري", "Sudagri's sections")}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {t("المس أيَّ بطاقة لتفتح قسمها.", "Tap any card to open its section.")}
        </p>
        <PhotoBoard
          tiles={tiles}
          enter={locale === "en" ? { label: "Open", arrow: "→" } : undefined}
        />
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
                {t("لا توجد فرص استثمار مطروحة حالياً", "No investment opportunities are open right now")}
              </strong>{" "}
              {t(
                "— ولن يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً. أمّا الأدوات وقاعدة المعرفة فتعمل الآن، مجاناً وبلا تسجيل.",
                "— and no project is listed before it is legally documented and inspected in the field. The tools and the knowledge base work now, free and without sign-up.",
              )}
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
              {t("المشاريع المتاحة", "Available projects")}
            </h2>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
              {t("كلّ المشاريع ←", "All projects →")}
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(projects as Project[]).map((project) => (
              <ProjectCard key={project.id} project={project} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
