import Link from "next/link";
import RainMap from "@/components/RainMap";
import { fetchRainGrid } from "@/lib/rainMap";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/**
 * توقّع الأمطار في الرئيسية، تحت الواجهة مباشرةً (طلب المالك، 24 سبتمبر).
 *
 * It used to live only under the water calculator, where it was found by the
 * people who already knew to look. Rain is the one thing every visitor — the
 * farmer, the herder, the trader — wants to know this week, so the map itself
 * comes to the front page and the whole card opens the full page.
 *
 * Same cached request as /rain, so the homepage adds no upstream call. If the
 * forecast cannot be fetched the card disappears rather than showing an
 * apology above the photos.
 */
export default async function RainHomeCard() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const grid = await fetchRainGrid();
  if (!grid) return null;

  const wettest = grid.cells
    .filter((c) => c.labelled)
    .reduce((a, c) => (c.rainMm > a.rainMm ? c : a));

  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 xl:max-w-7xl">
      <Link
        href="/rain"
        className="group block rounded-2xl border border-border bg-card p-5 shadow-card transition hover:shadow-raised sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">
            {t("توقّع الأمطار — الأيام السبعة القادمة", "Rain forecast — the next seven days")}
          </h2>
          <span aria-hidden className="text-2xl text-primary transition rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1">
            {locale === "en" ? "→" : "←"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {wettest.rainMm >= 1
            ? t(
                `أعلى مجموعٍ متوقّع ${Math.round(wettest.rainMm).toLocaleString("ar")} مم. اضغط لتفاصيل كل منطقة.`,
                `Highest expected total: ${Math.round(wettest.rainMm)} mm. Tap for each region's details.`,
              )
            : t("لا مطر يُعتدّ به متوقَّع هذا الأسبوع. اضغط للتفاصيل.", "No significant rain expected this week. Tap for details.")}
        </p>
        <div className="mx-auto mt-4 max-w-xl">
          <RainMap grid={grid} locale={locale} />
        </div>
      </Link>
    </section>
  );
}
