import Link from "next/link";
import DailyRainTable from "@/components/DailyRainTable";
import RainMap from "@/components/RainMap";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import WeekForecast from "@/components/WeekForecast";
import { LAYERS, fetchDailyTable, fetchRainGrid, layerFor } from "@/lib/rainMap";

export const metadata = {
  title: "توقّع الأمطار والخرائط | سودجري",
  description:
    "خريطة السودان للأيام السبعة القادمة — المطر والحرارة وحاجة الجوّ من الماء والتضاريس — وجدول المطر يوماً بيوم لخمس عشرة مدينة.",
};

const dayMonth = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("ar", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Khartoum",
  });

/**
 * Page order, top to bottom, is the order of the questions: where is the rain
 * this week (the map), on which day (the table), and is it enough (rain
 * against the air's demand, per station). The map's other layers sit behind
 * tabs on the same map rather than as four more maps down the page — one map
 * a phone screen tall is readable, four are a scroll.
 *
 * The tabs are links (?layer=), not a client-side switch: the page stays
 * script-free and a layer can be shared by its URL.
 */
export default async function RainPage({
  searchParams,
}: {
  searchParams: Promise<{ layer?: string }>;
}) {
  const { layer: layerKey } = await searchParams;
  const [grid, table] = await Promise.all([fetchRainGrid(), fetchDailyTable()]);

  // A layer with no values at all (elevation that could not be read) loses
  // its tab rather than drawing an empty map.
  const available = grid
    ? LAYERS.filter((l) => grid.cells.some((c) => l.value(c) != null))
    : [];
  const layer = available.find((l) => l.key === layerKey) ?? layerFor("rain");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">توقّع الأمطار والخرائط</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        الأيام السبعة القادمة على خريطة السودان، ثمّ يوماً بيوم لكل مدينة. هي
        توقّعاتٌ من نماذج الأرصاد لا قياسات، وتُحدَّث كل ثلاث ساعات.
      </p>
      <ShareWhatsApp
        path="/rain"
        text="توقّع الأمطار في السودان للأيام السبعة القادمة — خريطة وجدول بالأرقام:"
        className="my-3"
      />

      {/* ───────── الخريطة ───────── */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6">
        {grid ? (
          <>
            <nav
              aria-label="طبقة الخريطة"
              className="mb-4 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${available.length}, minmax(0, 1fr))` }}
            >
              {available.map((l) => {
                const active = l.key === layer.key;
                return (
                  <Link
                    key={l.key}
                    href={l.key === "rain" ? "/rain" : `/rain?layer=${l.key}`}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-1 py-1.5 text-center text-sm font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {l.title}
                  </Link>
                );
              })}
            </nav>
            <h2 className="text-lg font-bold">{layer.note}</h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              {layer.key === "elev"
                ? "ثابتةٌ لا تتغيّر مع الطقس — بدقّة المربّع (١٦٠ كم)، للصورة العامة لا لمسح موقع."
                : `من ${dayMonth(grid.from)} إلى ${dayMonth(grid.to)}`}
            </p>
            <RainMap grid={grid} layer={layer} />
          </>
        ) : (
          <p className="text-sm text-muted">
            تعذّر جلبُ التوقّع الآن. أعد المحاولة بعد قليل.
          </p>
        )}
      </section>

      {/* ───────── يوماً بيوم ───────── */}
      {table && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">المطر يوماً بيوم</h2>
          <p className="mb-4 mt-2 text-sm leading-7 text-muted">
            بالمليمتر لكل يوم، بألوان الخريطة نفسها. النقطة تعني أقلّ من ١ مم.
          </p>
          <DailyRainTable table={table} />
        </section>
      )}

      {/* ───────── المطر مقابل حاجة الجوّ ───────── */}
      <WeekForecast />

      <p className="mt-8 text-sm">
        تريد أن تعرف كم يحتاج محصولك من الماء بعد هذا المطر؟{" "}
        <Link href="/tools/water" className="font-medium text-primary underline">
          افتح حاسبة الاحتياج المائي
        </Link>
      </p>
      <p className="mt-2 text-xs text-muted">
        المصدر: <span dir="ltr">Open-Meteo</span> (التوقّع والارتفاع)، وحدود
        السودان من <span dir="ltr">Natural Earth</span>.
      </p>
    </div>
  );
}
