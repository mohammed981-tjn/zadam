import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { card } from "@/lib/ui";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "احسب | سوداقري", "Calculate | Sudagri"),
    description: tr(
      locale,
      "حاسبات سوداقري في مكانٍ واحد: ماء الزرع على مناخ ولايتك، وجدوى الموسم مرحلةً مرحلة، والعملات مقابل الجنيه، ومحاصيل جديدة بجدواها.",
      "Sudagri's calculators in one place: crop water on your state's climate, a season's feasibility stage by stage, currencies against the pound, and new crops with their feasibility.",
    ),
  };
}

/**
 * «احسب» (the owner, 23 October): the fourth place in the bar along the bottom
 * of a phone, where «النفير» was. The calculators were each on their own page
 * with no page that gathered them; this is that page, and nothing is computed
 * here — every card opens the calculator that does it.
 */
const TOOLS: { href: string; emoji: string; ar: string; en: string; noteAr: string; noteEn: string }[] = [
  {
    href: "/tools/water",
    emoji: "💧",
    ar: "ماء الزرع",
    en: "Crop water",
    noteAr: "كم يحتاج محصولك من الماء على مناخ ولايتك وطريقة ريّك — بلا تسجيل.",
    noteEn: "How much water your crop needs on your state's climate and your irrigation — no sign-up.",
  },
  {
    href: "/tools/feasibility",
    emoji: "📊",
    ar: "جدوى الموسم",
    en: "Season feasibility",
    noteAr: "التكلفة والعائد مرحلةً مرحلة، بأسعار السوق من مصادرها.",
    noteEn: "Cost and return stage by stage, at sourced market prices.",
  },
  {
    href: "/rates",
    emoji: "💱",
    ar: "العملات",
    en: "Currencies",
    noteAr: "الدولار والريال وغيرهما مقابل الجنيه السوداني، كلٌّ بمصدره وتاريخه.",
    noteEn: "The dollar, the riyal and others against the Sudanese pound, each with its source and date.",
  },
  {
    href: "/tools/new-crops",
    emoji: "🌱",
    ar: "محاصيل جديدة",
    en: "New crops",
    noteAr: "محاصيل تستحقّ التجربة في السودان، ولكلٍّ منها دراسة جدوى.",
    noteEn: "Crops worth trying in Sudan, each with a feasibility study.",
  },
];

export default async function ToolsPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader icon="calculator" eyebrow={t("أدوات المزرعة", "Farm tools")} title={t("احسب", "Calculate")}>
        {t(
          "قبل أن تزرع أو تبيع أو تشارك: احسب الماء والجدوى والعملة. كلّ رقمٍ هنا بمصدره.",
          "Before you plant, sell or partner: work out the water, the feasibility and the currency. Every figure here has its source.",
        )}
      </PageHeader>

      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((x) => (
          <li key={x.href}>
            <Link href={x.href} className={`${card} flex h-full items-start gap-3 transition hover:border-rose`}>
              <span aria-hidden="true" className="text-3xl leading-none">
                {x.emoji}
              </span>
              <span>
                <strong className="block text-lg">{t(x.ar, x.en)}</strong>
                <span className="mt-1 block text-sm text-muted">{t(x.noteAr, x.noteEn)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
