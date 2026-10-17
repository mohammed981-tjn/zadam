import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SERVICE_CATALOGUE } from "@/lib/services";
import { STAGE_TEMPLATES } from "@/lib/season";
import PartnersShell from "@/components/partners/PartnersShell";
import { card } from "@/components/supply/SupplyShell";

/*
 * إجراءاتُ العمل — البند ١١١ (docs/studies/services-company-ar.md، القسم ٤).
 *
 * Sudagri as a services and information company for producers, in the order a
 * producer meets it. Each step links to the page where it happens, so the
 * page describes the platform by pointing at it. The counts are read from the
 * modules the platform runs on, not written here, so they cannot drift.
 *
 * No fee is named: what Sudagri charges is the owner's decision (section 9),
 * and the page says only where it will be written — in the contract, before
 * anyone signs.
 */

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "إجراءات العمل | سوداقري", "How we work | Sudagri"),
    description: tr(
      locale,
      "سوداقري شركة خدمات ومعلومات للمنتجين: من تسجيل الأرض إلى الحصاد والتعبئة والبيع، بإشرافٍ كامل وشركاتٍ زراعيّة شريكة، وكلُّ مرحلةٍ بدليلها.",
      "Sudagri is a services and information company for producers: from registering the land to harvest, packing and sale, with full supervision and partner farming companies, every stage backed by evidence.",
    ),
  };
}

export default async function HowWeWorkPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const n = (v: number) => v.toLocaleString(locale === "en" ? "en-US" : "ar");

  const steps: { title: string; body: string; links: { href: string; label: string }[] }[] = [
    {
      title: t("التسجيل", "Register"),
      body: t(
        "تسجّل أرضك مجّاناً: الموقع، والمساحة، ومصدر الماء، ومستندات الحيازة.",
        "You register your land for free: its location, area, water source and tenure documents.",
      ),
      links: [{ href: "/lands/new", label: t("سجّل أرضك", "Register your land") }],
    },
    {
      title: t("التوثيق والمعاينة", "Verification and inspection"),
      body: t(
        "معاينٌ يراجع المستندات ويزور الأرض. ولا تظهر الأرض لأحدٍ قبل ذلك.",
        "An inspector checks the documents and visits the land. No one sees the land before that.",
      ),
      links: [{ href: "/lands", label: t("أراضيّ ومستنداتها", "My land and its documents") }],
    },
    {
      title: t("التصنيف", "Classification"),
      body: t(
        "تدخل الأرض فهرسها ومجموعتها حسب الولاية، والمساحة، وصنف التربة من خريطة التربة بإحداثيّاتها، ومصدر الماء، والمحاصيل.",
        "The land joins its index and group by state, area, soil class (from the soil map at its coordinates), water source and crops.",
      ),
      links: [{ href: "/rain", label: t("خريطة التربة والمطر", "Soil and rain map") }],
    },
    {
      title: t("الخطّة والجدوى", "Plan and feasibility"),
      body: t(
        `تُبنى خطّة الموسم بمراحلها الـ${n(Object.keys(STAGE_TEMPLATES).length)}، ودراسة جدواه: المحصول، والماء، والميزانيّة.`,
        `The season plan is built with its ${Object.keys(STAGE_TEMPLATES).length} stages, and its feasibility study: the crop, the water and the budget.`,
      ),
      links: [
        { href: "/tools/feasibility", label: t("دراسة الجدوى المرحليّة", "Staged feasibility study") },
        { href: "/tools/water", label: t("حاسبة الماء", "Water calculator") },
      ],
    },
    {
      title: t("اختيار الخدمات", "Choose the services"),
      body: t(
        `تختار إحدى طريقتين: خدماتٍ منفردةً من الكتالوج (${n(SERVICE_CATALOGUE.length)} خدمة)، أو «الإشراف الكامل»، وفيه تختار سوداقري الشركات المطابقة لمجموعة أرضك.`,
        `You choose one of two ways: single services from the catalogue (${SERVICE_CATALOGUE.length} services), or “full supervision”, in which Sudagri chooses the companies that match your land’s group.`,
      ),
      links: [{ href: "/services", label: t("كتالوج الخدمات", "Services catalogue") }],
    },
    {
      title: t("العقد", "The contract"),
      body: t(
        "عقد خدمةٍ واحد بمراحله وتواريخه ومبالغه المحسوبة من الموسم، يُوقَّع قبل البذر.",
        "One service contract with its stages, dates and amounts worked out from the season, signed before sowing.",
      ),
      links: [{ href: "/contracts", label: t("عقودي", "My contracts") }],
    },
    {
      title: t("التنفيذ بالدليل", "Work, with evidence"),
      body: t(
        "التجهيز، ثمّ الزراعة، ثمّ الريّ والمتابعة، ثمّ الوقاية. كلّ مرحلةٍ تُثبَت بصورةٍ أو فاتورةٍ أو معاينة، ولا يُدفع نصيبها قبل اعتمادها.",
        "Preparation, then planting, then irrigation and follow-up, then crop protection. Each stage is proved by a photo, an invoice or an inspection, and its share is not paid before it is approved.",
      ),
      links: [{ href: "/seasons", label: t("مواسمي", "My seasons") }],
    },
    {
      title: t("الحصاد والتعبئة", "Harvest and packing"),
      body: t(
        "الحصاد، ثمّ الدراس والتنظيف، ثمّ التجفيف، ثمّ التعبئة، ثمّ التخزين أو النقل.",
        "Harvest, then threshing and cleaning, then drying, then packing, then storage or transport.",
      ),
      links: [{ href: "/services", label: t("خدمات ما بعد الحصاد", "Post-harvest services") }],
    },
    {
      title: t("البيع", "Sale"),
      body: t(
        "عبر سوق المحاصيل بأسعاره اليوم، أو عروض البيع والشراء، أو ممرّ الصادر.",
        "Through the crop market at today’s prices, buy and sell offers, or the export corridor.",
      ),
      links: [
        { href: "/market", label: t("سوق المحاصيل", "Crop market") },
        { href: "/market/offers", label: t("عروض البيع والشراء", "Buy and sell offers") },
        { href: "/export", label: t("ممرّ الصادر", "Export corridor") },
      ],
    },
    {
      title: t("الإغلاق", "Close"),
      body: t(
        "يُغلق الموسم بحسابٍ يراه كلّ طرف، ويُضاف إلى سجلّ المنفّذ ومؤشّر ثقته.",
        "The season closes with an account every party sees, and is added to the contractor’s record and trust score.",
      ),
      links: [{ href: "/seasons", label: t("مواسمي", "My seasons") }],
    },
  ];

  return (
    <PartnersShell active="/how-we-work">
      <h1 className="text-2xl font-black">{t("كيف نعمل معك — من البذرة إلى السوق", "How we work with you — from seed to market")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "سوداقري شركة خدماتٍ ومعلوماتٍ للمنتجين. نقف بينك وبين الشركات الزراعيّة، ونتابع أرضك من التجهيز إلى الحصاد والتعبئة. ونكسب من الخدمة والإشراف اللذين نقدّمهما، لا من حصّةٍ في أرضك.",
          "Sudagri is a services and information company for producers. We stand between you and the farming companies, and follow your land from preparation to harvest and packing. We earn from the service and supervision we provide, not from a share in your land.",
        )}
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            h: t("المعلومات", "Information"),
            p: t(
              "الجدوى، وحساب الماء، والمطر والتربة، والأسعار، والمساعد — مجّاناً.",
              "Feasibility, water requirements, rain and soil, prices and the assistant — free.",
            ),
            href: "/knowledge",
            link: t("قاعدة المعرفة", "Knowledge base"),
          },
          {
            h: t("الخدمات الفعليّة", "Field services"),
            p: t(
              "تنفّذها شركاتٌ شريكةٌ موثّقة، بعقد خدمةٍ مراحله مدفوعةٌ بعد الإثبات.",
              "Delivered by verified partner companies, under a service contract whose stages are paid after proof.",
            ),
            href: "/partners",
            link: t("الشركات الشريكة", "Partner companies"),
          },
          {
            h: t("الإشراف الكامل", "Full supervision"),
            p: t(
              "مشرفٌ من سوداقري يزور الأرض، ويعتمد كلّ مرحلةٍ بدليلها، ويكتب تقريراً شهريّاً لك.",
              "A Sudagri supervisor visits the land, approves each stage on its evidence and writes you a monthly report.",
            ),
            href: "/services",
            link: t("في كتالوج الخدمات", "In the services catalogue"),
          },
        ].map((b) => (
          <div key={b.h} className={card}>
            <h2 className="font-bold">{b.h}</h2>
            <p className="mt-1 text-sm leading-7 text-muted">{b.p}</p>
            <Link href={b.href} className="mt-2 inline-block text-sm text-primary underline">
              {b.link}
            </Link>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">{t("الخطوات العشر", "The ten steps")}</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className={`${card} flex gap-4`}>
              <span
                aria-hidden
                className="figure flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
              >
                {n(i + 1)}
              </span>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-7">{s.body}</p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {s.links.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className="text-primary underline">
                      {l.label}
                    </Link>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-bold">{t("أجر سوداقري", "Sudagri’s fee")}</h2>
        <p className="mt-1 text-sm leading-7">
          {t(
            "يُكتب أجر الإشراف والخدمة في العقد نفسه قبل التوقيع، فتعرفه قبل أن تلتزم بشيء. ولا نأخذ حصّةً من أرضك ولا من محصولك.",
            "The supervision and service fee is written into the contract itself before signing, so you know it before you commit to anything. We take no share of your land or your crop.",
          )}
        </p>
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="font-bold">{t("للشركات الزراعيّة", "For farming companies")}</h2>
        <p className="mt-1 text-sm leading-7">
          {t(
            "شركات الميكنة والريّ والمدخلات والحصاد والتعبئة والنقل والإرشاد: سجّل شركتك، واكتب اتّفاقاً مبدئيّاً يحدّد المزارع التي تخدمها — الولايات، ومصادر الماء، وأصناف التربة، وفئات المساحة، والمحاصيل. وبعد أن يفعّله المشرف تظهر لك المزارع المطابقة، بلا اسم صاحبها ولا موقعها حتى يقبل طلبك.",
            "Machinery, irrigation, input, harvest, packing, transport and extension companies: register your company and write a preliminary agreement naming the farms you serve — states, water sources, soil classes, area bands and crops. Once an administrator activates it, the matching farms appear for you, without the owner’s name or location until the owner accepts your request.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/partners/mine" className="rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground">
            {t("سجّل شركتك", "Register your company")}
          </Link>
          <Link href="/partners" className="rounded-xl border border-border px-4 py-2">
            {t("الشركات الشريكة", "Partner companies")}
          </Link>
        </div>
      </section>
    </PartnersShell>
  );
}
