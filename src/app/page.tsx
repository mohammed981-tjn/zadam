import Link from "next/link";
import { getImageProps } from "next/image";
import { Suspense } from "react";
import HeroBackdrop from "@/components/HeroBackdrop";
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
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { loadProjectLands } from "@/lib/landOffers";
import RoleHome, { RoleHomeSkeleton } from "@/components/RoleHome";

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
    href: "/lands/new",
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
    href: "/herds",
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

/** The wide poster's width: the whole window, less the 16rem side column from `lg` (DesktopSidebar). */
const HERO_SIZES = "(min-width: 1024px) calc(100vw - 16rem), 100vw";

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

  /*
   * The hero's poster, art-directed (Next's `getImageProps`, as its image guide shows it): the tall frame on a
   * phone, the wide one from `md`, both through the image optimiser. `fetchPriority="high"` and no lazy loading:
   * it is the largest thing the first screen paints.
   */
  const { srcSet: heroWide } = getImageProps({
    src: "/video/hero-wide.jpg",
    alt: "",
    width: 1280,
    height: 720,
    sizes: HERO_SIZES,
  }).props;
  const { props: heroPoster } = getImageProps({
    src: "/video/hero-tall.jpg",
    alt: "",
    width: 540,
    height: 960,
    sizes: "100vw",
    fetchPriority: "high",
    loading: "eager",
  });

  /*
   * Who is reading (backlog 206): a signed-in person meets what concerns them where a visitor meets the hero. Asked
   * beside the page's own reads, not before them; with no session cookie it answers without a network call.
   */
  const [{ data: { user } }, { data: projects }, { count: kbCount }, { count: faoCount }, { data: kbLatest }, { data: openLands }, projectLands] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("projects")
      .select(VISITOR_COLUMNS.projects)
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
    // أراضٍ موثّقة معروضة على المستثمرين (البند ١٢٩): فرصٌ أيضاً، وإن لم يُكتب مشروع.
    supabase.rpc("investor_open_lands"),
    // وشارةُ «على أرضٍ موثّقة» هنا كما في «المشاريع» و«الفرص» (المالك، 22 أكتوبر).
    loadProjectLands(supabase),
  ]);
  const openLandCount = ((openLands ?? []) as unknown[]).length;
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
      label: t("محصولاً بمعاملات FAO‑56", "crops with FAO‑56 coefficients"),
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
      {/* ───────────────────────── الواجهة ─────────────────────────
       * A film behind the headline (the owner, 6 November 2026): fifteen silent seconds of water, fields and the
       * people who work them, looping, with the headline, the line under it and the two doors in white over a
       * scrim of the logo's forest green (`.hero-video` and `.hero-scrim` in globals.css, which say why the type
       * holds 8.5:1 over any frame). The poster is sent as a real <picture>, the tall cut on a phone and the wide
       * one from `md`, and it is the page's largest paint; the film fades in over it (HeroBackdrop), or never
       * does for a reader who asked for less motion or to save data. The films with sound stay below.
       *
       * Signed in, the role home takes the hero's place (backlog 206) and streams in its own boundary; everything
       * below it is the same page for everyone.
       */}
      {user ? (
        <Suspense fallback={<RoleHomeSkeleton locale={locale} />}>
          <RoleHome userId={user.id} locale={locale} />
        </Suspense>
      ) : (
      <section className="hero-video">
        <picture>
          <source media="(min-width: 768px)" srcSet={heroWide} sizes={HERO_SIZES} />
          <img
            {...heroPoster}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        </picture>
        <HeroBackdrop />

        <div className="flex min-h-[30rem] flex-col justify-end md:min-h-[34rem] lg:min-h-[38rem]">
          <div className="hero-scrim pt-28 md:pt-32">
            <div className="mx-auto max-w-6xl px-5 pb-9 sm:pb-12">
              <div className="max-w-[38rem]">
                <p className="hero-pill mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold">
                  {/* The logo's sun, as a dot. */}
                  <span aria-hidden className="size-2 rounded-full bg-gold" />
                  {t("معرفة زراعية وبيانات مفتوحة — للسودان", "Agricultural knowledge and open data — for Sudan")}
                </p>

                <h1 className="font-black leading-[1.2]" style={{ fontSize: "var(--text-display)" }}>
                  {t("كل رقمٍ هنا يمكنك أن تعيد حسابه بنفسك", "Every number here is one you can recompute yourself")}
                </h1>
                {/* خطُّ النيل (البند ١٠٦): يُرسم مرّةً تحت العنوان — بذهب شمس الشعار على الأخضر. */}
                <svg className="nile-line mt-3 h-4 w-52 max-w-full" viewBox="0 0 400 24" fill="none" aria-hidden>
                  <path d="M4 14c40-12 70 10 110 0s70-12 110 0 70 10 110 0 40-8 62-4" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" />
                </svg>

                <p className="mt-4 text-base leading-relaxed sm:text-lg">
                  {t(
                    "سوداقري منصّة معرفة زراعية وبيانات للسودان. لا يُعرض رقمٌ دون مصدره ومنهجه: الغلّة من FAOSTAT، والمناخ من NASA POWER، والتربة من SoilGrids، والاحتياج المائي محسوبٌ بمحرّك FAO-56 داخل المنصّة نفسها.",
                    "Sudagri is an agricultural knowledge and data platform for Sudan. No number is shown without its source and method: yields from FAOSTAT, climate from NASA POWER, soil from SoilGrids, and crop water needs computed by an FAO-56 engine on the platform itself.",
                  )}
                </p>

                {/* Equal widths, one under the other on a phone: the sun's gold for the farmer's door, a white
                    outline for the study. */}
                <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                  <Link
                    href="/lands/new"
                    className="rounded-2xl bg-gold px-6 py-3.5 text-center font-extrabold text-gold-ink shadow-float transition hover:opacity-90 active:scale-[0.98]"
                  >
                    {t("سجّل أرضك ووثّق موسمك", "Register your land and record your season")}
                  </Link>
                  <Link
                    href="/arc-canal"
                    className="rounded-2xl border-[1.5px] border-white/80 bg-white/10 px-6 py-3.5 text-center font-bold text-white transition hover:bg-white/20"
                  >
                    {t("اقرأ دراسة القناة القوسية", "Read the Arc Canal study")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ───────────────────────── الأفلام ─────────────────────────
       * الفيديو والشعارُ في إطارٍ واحد: يعمل المقطعُ مرّةً ثمّ يظهر الشعار
       * مكانه (المالك، 26 سبتمبر: «ادمجهم»). والإطارُ كبيرٌ بطلبه («الفيديو
       * أكبر»)، وتحته بطاقةٌ لكلّ فيلم (البند ١٢١).
       */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <HeroVideo />
      </section>

      {/* ───────────────────────── الأرقام ─────────────────────────
       * Cards rather than one strip: the number in pink, a green dot by its
       * label. auto-fit, because the count is not fixed — a count that fails
       * drops its card, and a fixed grid would leave an empty cell.
       */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6">
        <dl className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}>
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <dt className="flex items-center gap-1.5 text-xs font-bold text-muted">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-leaf" />
                {s.label}
              </dt>
              <dd className="figure mt-1 text-3xl font-black text-primary">{s.value}</dd>
              <dd className="mt-1 text-xs leading-relaxed text-muted">{s.note}</dd>
            </div>
          ))}
        </dl>
      </section>
      {/* شريطُ التوب السوداني (البند ١٠٦) بدل الخطّ الرفيع بين الواجهة وما بعدها. */}
      <div className="toub-rule" aria-hidden />

      {/* ───────────────────────── التبويبات ─────────────────────────
       * طلب المالك (25 سبتمبر): الرئيسيّةُ واجهةٌ ثمّ لوحة. والأخبار خرجت منها
       * إلى صفحتها `/news`، ولها هنا تبويبٌ أوّل بدل شريطٍ بين الأقسام.
       */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <QuickTabs tabs={tabs} label={t("تبويبات سريعة", "Quick links")} />
        <div className="mt-4 flex flex-col gap-3">
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
      {!(projects && projects.length > 0) && openLandCount > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <Link
            href="/projects"
            className="flex items-start gap-3 rounded-2xl border border-leaf/30 bg-leaf/5 p-5 transition hover:border-leaf"
          >
            <Icon name="shield" className="mt-0.5 size-5 shrink-0 text-leaf" />
            <p className="text-sm leading-relaxed">
              <strong className="font-bold">
                {t(
                  `${openLandCount.toLocaleString("ar-EG")} ${openLandCount === 1 ? "أرضٌ موثّقة تبحث" : "أراضٍ موثّقة تبحث"} عن شريك`,
                  `${openLandCount} verified ${openLandCount === 1 ? "plot is" : "plots are"} looking for a partner`,
                )}
              </strong>{" "}
              {t(
                "— مشاركةً بالمحصول أو إيجاراً أو تمويلاً، بلا اسم صاحبها ولا موقعها حتى يقبل. تصفّحها ←",
                "— crop sharing, lease or finance, without the owner's name or its location until they accept. Browse them →",
              )}
            </p>
          </Link>
        </section>
      )}

      {!(projects && projects.length > 0) && openLandCount === 0 && (
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
            {(projects as unknown as Project[]).map((project) => (
              <ProjectCard key={project.id} project={project} locale={locale} verifiedLand={projectLands.get(project.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
