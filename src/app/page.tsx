import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import KnowledgeCard from "@/components/KnowledgeCard";
import Icon, { type IconName } from "@/components/Icon";
import NewsStrip from "@/components/NewsStrip";
import { CROPS, STATIONS } from "@/lib/agronomy";
import type { KnowledgeEntry, Project } from "@/types/database";

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

export default async function Home() {
  const supabase = await createClient();

  const [
    { data: projects },
    { data: knowledge },
    { count: kbCount },
    { count: faoCount },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    // Mining lives in its own section — mixing it into the agricultural feed
    // is exactly what confuses a visitor who came for one of the two.
    supabase
      .from("knowledge_entries")
      .select("*")
      .neq("crop", "تعدين")
      // Regional reference material the assistant reads but the pages do not
      // show. Without this the newest foreign entries would displace every
      // Sudan-specific one a visitor came here for.
      .eq("assistant_only", false)
      .order("created_at", { ascending: false })
      .limit(6),
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

  const tools: { href: string; icon: IconName; title: string; body: string }[] = [
    {
      href: "/tools/water",
      icon: "droplet",
      title: "حاسبة الاحتياج المائي",
      body: "بمنهجية FAO-56 على مناخ ولايتك ومحصولك وطريقة ريّك — بالمتر المكعّب للفدان، وبشهر الذروة الذي تُحسب عليه الطلمبة لا بالمتوسّط.",
    },
    {
      href: "/tools/feasibility",
      icon: "chart",
      title: "دراسة الجدوى المرحلية",
      body: "تقسّم المشروع مراحل، وتحسب عند كل مرحلة الغلّة التي تتعادل بها — فتعرف أين آخر مخرج آمن قبل أن تُنفق أكثر.",
    },
    {
      href: "/knowledge",
      icon: "book",
      title: "قاعدة المعرفة",
      body: "تجارب زراعية موثّقة من دول رائدة، كلٌّ منها بدولته المرجعية وبتنبيهٍ متى تحتاج المعلومة تحققاً محلياً قبل تطبيقها.",
    },
    {
      href: "/arc-canal",
      icon: "spark",
      title: "دراسة القناة القوسية",
      body: "قياسٌ وحساب: ٤١ ارتفاعاً من SRTM، وتربةٌ من SoilGrids، وقناةٌ محجَّمة بمعادلة مانينغ، وكلفةٌ مبنيّة من الكميّات.",
    },
  ];

  return (
    <div>
      {/* جديدُ المنصّة — ولا يظهر شيءٌ منه حين لا خبر، فتبقى الصفحةُ كما هي. */}
      <NewsStrip />

      {/* ───────────────────────── الواجهة ───────────────────────── */}
      <section className="mesh border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
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
            سودجري منصّة معرفة زراعية وبيانات للسودان. لا يُعرض رقمٌ دون مصدره
            ومنهجه: الغلّة من FAOSTAT، والمناخ من NASA POWER، والتربة من
            SoilGrids، والاحتياج المائي محسوبٌ بمحرّك FAO-56 داخل المنصّة نفسها.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/tools/water"
              className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground shadow-raised transition hover:opacity-90"
            >
              جرّب حاسبة المياه
            </Link>
            {/* والمزارعُ له بابٌ في الواجهة لا في أسفل الصفحة وحدها: الزرّان
                السابقان يقودان إلى قراءةٍ وحساب، وكلاهما لا يقول لمن يزرع إنّ
                هنا شيئاً يفعله. */}
            <Link
              href="/signup"
              className="rounded-xl border border-primary/40 bg-card px-5 py-3 font-medium shadow-card transition hover:shadow-raised"
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

      {/* ───────────────────────── الحالة ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="reveal flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5">
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

      {/* ───────────────────────── المزارع ─────────────────────────
       *
       * القسمُ الذي لم يكن، وصفرُ الأراضي هو أثرُه.
       *
       * Everything above and below this section speaks to a reader: calculators
       * to try, studies to read, a knowledge base to browse. Nothing on the page
       * told a farmer that the platform had anything for them to *do* — no land,
       * no season, no evidence, no passport. And the database agrees: six people
       * registered, and in the platform's whole life **not one plot of land has
       * ever been recorded**.
       *
       * So this is placed above the tools rather than below the projects. The
       * chain it describes is the product; the calculators are the doorway.
       */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
          <h2 className="font-bold" style={{ fontSize: "var(--text-title)" }}>
            وإن كنت تزرع: من أرضك إلى المشتري
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">
            المزارعُ في السودان لا ينقصه محصول — ينقصه أن{" "}
            <strong className="text-foreground">يُثبت</strong> ما زرعه. سودجري
            تبني لك سجلّاً يقرأه المشتري والمموّل: أرضٌ موثّقة، وموسمٌ بمراحله
            وأدلّته، ودرجةٌ محسوبةٌ من فعلك لا من كلامك.
          </p>

          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "١",
                t: "سجّل أرضك",
                b: "الموقع والمساحة والحيازة، ومستنداتها. يراجعها موظّفٌ ويوثّقها — وما لم يُوثَّق لا يُعرض.",
              },
              {
                n: "٢",
                t: "وثّق موسمك",
                b: "سبعُ مراحل من التحضير إلى الحصاد، ولا تُعتمد مرحلةٌ بلا ملفٍّ مرفوع — صورةٍ أو فاتورة.",
              },
              {
                n: "٣",
                t: "يتكوّن جوازُ مزرعتك",
                b: "سجلٌّ عامّ بإذنك وحدك: أرضُك الموثّقة، ومواسمُك، ودرجةُ ثقةٍ محسوبةٌ ممّا وثّقته فعلاً.",
              },
              {
                n: "٤",
                t: "اعرض للتصدير",
                b: "بمستنداتِ الممرّ الذي تقصده، والمنصّةُ تقول لك ما نقص قبل أن تُرسل — لا على الحدود.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <span className="figure text-lg font-black text-primary">
                  {s.n}
                </span>
                <h3 className="mt-1 font-bold">{s.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.b}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground shadow-raised transition hover:opacity-90"
            >
              سجّل أرضك
            </Link>
            <Link
              href="/guide"
              className="rounded-xl border border-border bg-card px-5 py-3 font-medium shadow-card transition hover:shadow-raised"
            >
              كيف تسير الخطوات
            </Link>
          </div>

          {/* ولا يُوعَد بمشترٍ. المنصّةُ تشهد بأنّ الدليل موجودٌ ومراجَع، وهذا
              كلُّ ما تملك أن تشهد به — ووعدُ بيعٍ لا نملكه يُفقد ثقةَ أوّل من
              يصدّقه. */}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            وما نشهد به هو أنّ <strong>أدلّتك موجودةٌ ومراجَعة</strong> — لا أنّ
            بيعاً سيقع ولا بسعرٍ بعينه. ذلك يبقى تفاوضَك أنت.
          </p>
        </div>
      </section>

      {/* ───────────────────────── الأدوات ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-2 font-bold" style={{ fontSize: "var(--text-title)" }}>
          ما يعمل اليوم
        </h2>
        <p className="mb-8 max-w-2xl text-muted">
          أربع أدوات مبنيّة على البيانات أعلاه، تعمل الآن ولا تحتاج حساباً.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="reveal group rounded-2xl border border-border bg-card p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
            >
              <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon name={t.icon} />
              </div>
              <h3 className="mb-2 text-lg font-bold">{t.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{t.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ───────────────────────── التعدين ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <Link
          href="/mining"
          className="reveal flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition hover:shadow-raised"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Icon name="pickaxe" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold">قسم التعدين — منفصل عمداً</h3>
            <p className="text-sm leading-relaxed text-muted">
              السلامة في الحفر، والاستخلاص بلا زئبق، وجيولوجيا الذهب في السودان.
            </p>
          </div>
          <span aria-hidden className="ms-auto text-muted">
            ←
          </span>
        </Link>
      </section>

      {/* ───────────────────────── المشاريع ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="mb-6 font-bold" style={{ fontSize: "var(--text-title)" }}>
          المشاريع المتاحة
        </h2>
        {!projects || projects.length === 0 ? (
          <div className="reveal rounded-2xl border border-dashed border-border p-10 text-center">
            <Icon
              name="wheat"
              className="mx-auto mb-3 size-8 text-muted opacity-60"
            />
            <h3 className="mb-2 font-bold">لا توجد مشاريع مطروحة بعد</h3>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
              لا يُعرض مشروع حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة
              ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر المساعد وسنبلغك
              أوّل ما يُطرح مشروع موثّق.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(projects as Project[]).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* ───────────────────────── المعرفة ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-bold" style={{ fontSize: "var(--text-title)" }}>
            أحدث ما في قاعدة المعرفة
          </h2>
          <Link href="/knowledge" className="text-sm text-primary underline">
            القاعدة كاملة ←
          </Link>
        </div>
        {!knowledge || knowledge.length === 0 ? (
          <p className="text-muted">قاعدة المعرفة قيد الإعداد حالياً.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(knowledge as KnowledgeEntry[]).map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
