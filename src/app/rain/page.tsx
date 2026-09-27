import Link from "next/link";
import DailyRainTable from "@/components/DailyRainTable";
import InfraMap, { FUEL_INK, INFRA } from "@/components/InfraMap";
import RainMap from "@/components/RainMap";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import WeekForecast from "@/components/WeekForecast";
import { SOIL_CLASSES, SOIL_FETCHED_AT, availableLayers, fetchDailyTable, fetchRainGrid, layerFor } from "@/lib/rainMap";
import { WRB } from "@/lib/soilClasses";

export const metadata = {
  title: "توقّع الأمطار والخرائط | سودجري",
  description:
    "خريطة السودان للأيام السبعة القادمة — المطر والحرارة وحاجة الجوّ من الماء — ومعها التضاريس والتربة والأراضي الموثّقة ومسار القناة القوسية، وجدول المطر يوماً بيوم لخمس عشرة مدينة.",
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
  const [grid, table] = await Promise.all([fetchRainGrid({ lands: true }), fetchDailyTable()]);

  // A layer with no values at all (elevation that could not be read, soil
  // before its survey has run) loses its tab rather than drawing an empty
  // map — except the lands, whose empty map is itself the answer.
  const available = grid ? availableLayers(grid) : [];
  const layer = available.find((l) => l.key === layerKey) ?? layerFor("rain");
  // Roads, rail and power: a web-only tab drawn from fixed data, not a
  // layer of the grid, so the app's /api/rain is unchanged.
  const infra = layerKey === "infra";
  const landCount = grid ? grid.cells.reduce((a, c) => a + (c.lands ?? 0), 0) : 0;

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
            {/* Two rows on a phone rather than seven squeezed tabs. */}
            <nav aria-label="طبقة الخريطة" className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {available.map((l) => {
                const active = !infra && l.key === layer.key;
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
              <Link
                href="/rain?layer=infra"
                scroll={false}
                aria-current={infra ? "page" : undefined}
                className={`rounded-full border px-1 py-1.5 text-center text-sm font-medium transition ${
                  infra ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"
                }`}
              >
                البنية
              </Link>
            </nav>
            {infra ? <InfraSection /> : (
            <>
            <h2 className="text-lg font-bold">{layer.note}</h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              {layer.key === "elev"
                ? "ثابتةٌ لا تتغيّر مع الطقس — بدقّة المربّع (١٦٠ كم)، للصورة العامة لا لمسح موقع."
                : layer.key === "soil"
                  ? "الصنف الغالب في خمس نقاطٍ من كل مربّع — صورةُ البلد العامة (سهل الطين في الجزيرة والقضارف، ورمال القوز في كردفان)، لا فحصُ تربة حقلك."
                  : layer.key === "lands"
                    ? "بعددها في كل مربّع — لا تضع الخريطة نقطةً على أرض أحد. موقع كل أرضٍ في صفحتها."
                    : `من ${dayMonth(grid.from)} إلى ${dayMonth(grid.to)}`}
            </p>
            <RainMap grid={grid} layer={layer} showCanal legend={layer.key !== "soil"} />
            {layer.key === "lands" && landCount === 0 && (
              <p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">
                لا أرضَ موثّقة معروضة بعد.{" "}
                <Link href="/signup" className="font-medium text-primary underline">سجّل أرضك</Link>{" "}
                فتظهر هنا حين تُوثَّق ويعرضها صاحبها.
              </p>
            )}
            {layer.key === "soil" && (
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {/* The soil layer's bands are SOIL_CLASSES in order. */}
                {SOIL_CLASSES.map((w, i) => (
                  <div key={w} className="flex gap-2">
                    <span className="mt-1 inline-block size-3.5 shrink-0 rounded-sm border border-border" style={{ background: layer.bands[i].fill }} />
                    <div>
                      <dt className="font-medium">{layer.bands[i].label}</dt>
                      {WRB[w]?.note && <dd className="text-xs text-muted">{WRB[w].note}</dd>}
                    </div>
                  </div>
                ))}
              </dl>
            )}
            </>
            )}
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
        المصدر: <span dir="ltr">Open-Meteo</span> (التوقّع والارتفاع)، والتربة من{" "}
        <span dir="ltr">ISRIC SoilGrids</span>
        {SOIL_FETCHED_AT && <> (قُرئت {SOIL_FETCHED_AT})</>}، وحدود السودان من{" "}
        <span dir="ltr">Natural Earth</span>.
      </p>
    </div>
  );
}

/** The roads, rail and power tab: the map, then the largest stations. */
function InfraSection() {
  return (
    <>
      <h2 className="text-lg font-bold">الطرق والسكك الحديدية والكهرباء</h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        كيف يصل المحصول إلى السوق وإلى بورتسودان، وأين تمرّ الشبكة لمن يفكّر في طلمبةٍ كهربائية بدل
        الديزل. بياناتٌ من قبل الحرب: الخطّ المرسوم خطٌّ بُني، لا خطٌّ يعمل اليوم بالضرورة.
      </p>
      <InfraMap />
      <h3 className="mt-6 font-bold">أكبر محطات الكهرباء</h3>
      <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {INFRA.stations.slice(0, 12).map((s) => (
          <li key={s.name} className="flex items-baseline gap-2">
            <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: FUEL_INK[s.fuel].ink }} aria-hidden />
            <span className="font-medium">{s.nameAr ?? <span dir="ltr">{s.name}</span>}</span>
            <span className="text-xs text-muted">
              {s.mw != null && `${Math.round(s.mw).toLocaleString("ar-SA")} ميغاواط`}
              {s.state && ` · ${s.state}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        المصدر: المسح الجيولوجي الأمريكي (<span dir="ltr">USGS</span>)، ٢٠٢١، ملكية عامة — الطرق والسكك من{" "}
        <span dir="ltr">OpenStreetMap</span>، والكهرباء من بيانات <span dir="ltr">African Energy</span>. تُعرض
        الطرق الرئيسية فقط.
      </p>
    </>
  );
}
