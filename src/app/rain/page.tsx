import Link from "next/link";
import DailyRainTable from "@/components/DailyRainTable";
import InfraMap, { FUEL_INK, INFRA } from "@/components/InfraMap";
import RainMap from "@/components/RainMap";
import MapScreen from "@/components/map/MapScreen";
import { mapThemes } from "@/lib/mapLayers";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import WeekForecast from "@/components/WeekForecast";
import { SOIL_CLASSES, SOIL_FETCHED_AT, availableLayers, fetchDailyTable, fetchRainGrid, layerFor, localizeLayer } from "@/lib/rainMap";
import { placeName } from "@/lib/enNames";
import { WRB } from "@/lib/soilClasses";
import FilmPlayer from "@/components/FilmPlayer";
import { tr, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "توقّع الأمطار والخرائط | سوداقري", "Rain forecast and maps | Sudagri"),
    description: tr(
      locale,
      "خريطة السودان للأيام السبعة القادمة — المطر والحرارة وحاجة الجوّ من الماء — ومعها التضاريس والتربة والأراضي الموثّقة ومسار القناة القوسية، وجدول المطر يوماً بيوم لخمس عشرة مدينة.",
      "A map of Sudan for the next seven days — rain, heat and the air's demand for water — with terrain, soil, verified lands and the Arc Canal route, and a day-by-day rain table for fifteen towns.",
    ),
  };
}

const dayMonth = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ar", {
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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [grid, table] = await Promise.all([fetchRainGrid({ lands: true }), fetchDailyTable()]);

  // A layer with no values at all (elevation that could not be read, soil
  // before its survey has run) loses its tab rather than drawing an empty
  // map — except the lands, whose empty map is itself the answer.
  const available = grid ? availableLayers(grid) : [];
  const layer = available.find((l) => l.key === layerKey) ?? layerFor("rain");
  // The same layer in the reader's words, for the tabs and headings.
  const shown = localizeLayer(layer, locale);
  // Roads, rail and power: a web-only tab drawn from fixed data, not a
  // layer of the grid, so the app's /api/rain is unchanged.
  const infra = layerKey === "infra";
  const landCount = grid ? grid.cells.reduce((a, c) => a + (c.lands ?? 0), 0) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("توقّع الأمطار والخرائط", "Rain forecast and maps")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "الأيام السبعة القادمة على خريطة السودان، ثمّ يوماً بيوم لكل مدينة. هي توقّعاتٌ من نماذج الأرصاد لا قياسات، وتُحدَّث كل ثلاث ساعات.",
          "The next seven days on a map of Sudan, then day by day for each town. These are forecasts from weather models, not measurements, updated every three hours.",
        )}
      </p>
      <ShareWhatsApp
        path="/rain"
        text={t(
          "توقّع الأمطار في السودان للأيام السبعة القادمة — خريطة وجدول بالأرقام:",
          "Sudan's rain forecast for the next seven days — a map and a table with the numbers:",
        )}
        locale={locale}
        className="my-3"
      />

      <figure className="my-6">
        <FilmPlayer
          base="/video/rain-wide"
          poster="/video/rain-wide.jpg"
          label={t("فيلم سوداقري: مع أوّل مطرة", "A Sudagri film: with the first rain")}
        />
      </figure>

      {/* ───────── الخريطة الحيّة ───────── */}
      {/*
        The live map first (البند ١٤٧, «وستغيّر جميع الخرائط»): the same layers
        on a map or a satellite image, tapped for their values. The drawn map
        and its tabs follow, folded unless a tab was asked for: they print,
        open with no script, and are what the app's /api/rain also draws.
      */}
      <MapScreen
        themes={mapThemes(
          grid,
          available,
          locale,
          grid
            ? t(`من ${dayMonth(grid.from, locale)} إلى ${dayMonth(grid.to, locale)}`, `From ${dayMonth(grid.from, locale)} to ${dayMonth(grid.to, locale)}`)
            : undefined,
        ).filter((x) => x.group === "grid" || x.key === "infra" || x.key === "canal")}
        initial={infra ? "none" : (layerKey ?? "rain")}
        initialOver={infra ? ["infra"] : []}
        full="/map"
        className="mt-6 h-[75vh] min-h-96"
      />

      {/* ───────── الخريطة ───────── */}
      <details
        open={Boolean(layerKey)}
        className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6"
      >
        <summary className="cursor-pointer font-bold">
          {t("الخريطة المرسومة وطبقاتها — للطباعة وللاتصال الضعيف", "The drawn map and its layers — for printing and weak connections")}
        </summary>
        <div className="mt-4">
        {grid ? (
          <>
            {/* Two rows on a phone rather than seven squeezed tabs. */}
            <nav aria-label={t("طبقة الخريطة", "Map layer")} className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
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
                    {localizeLayer(l, locale).title}
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
                {t("البنية", "Infrastructure")}
              </Link>
            </nav>
            {infra ? <InfraSection locale={locale} /> : (
            <>
            <h2 className="text-lg font-bold">{shown.note}</h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              {layer.key === "elev"
                ? t(
                    "ثابتةٌ لا تتغيّر مع الطقس — بدقّة المربّع (١٦٠ كم)، للصورة العامة لا لمسح موقع.",
                    "Fixed; it does not change with the weather. At the resolution of one square (160 km), for the overall picture, not a site survey.",
                  )
                : layer.key === "soil"
                  ? t(
                      "الصنف الغالب في خمس نقاطٍ من كل مربّع — صورةُ البلد العامة (سهل الطين في الجزيرة والقضارف، ورمال القوز في كردفان)، لا فحصُ تربة حقلك.",
                      "The prevailing group across five points in each square — the country's overall picture (the clay plain of Gezira and Gedaref, the qoz sands of Kordofan), not a test of your own field's soil.",
                    )
                  : layer.key === "lands"
                    ? t(
                        "بعددها في كل مربّع — لا تضع الخريطة نقطةً على أرض أحد. موقع كل أرضٍ في صفحتها.",
                        "Counted per square — the map never puts a dot on anyone's land. Each land's location is on its own page.",
                      )
                    : t(
                        `من ${dayMonth(grid.from, locale)} إلى ${dayMonth(grid.to, locale)}`,
                        `From ${dayMonth(grid.from, locale)} to ${dayMonth(grid.to, locale)}`,
                      )}
            </p>
            <RainMap grid={grid} layer={layer} showCanal legend={layer.key !== "soil"} locale={locale} />
            {layer.key === "lands" && landCount === 0 && (
              <p className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">
                {t("لا أرضَ موثّقة معروضة بعد.", "No verified land is listed yet.")}{" "}
                <Link href="/lands/new" className="font-medium text-primary underline">{t("سجّل أرضك", "Register your land")}</Link>{" "}
                {t("فتظهر هنا حين تُوثَّق ويعرضها صاحبها.", "and it will appear here once it is verified and its owner lists it.")}
              </p>
            )}
            {layer.key === "soil" && (
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {/* The soil layer's bands are SOIL_CLASSES in order. */}
                {SOIL_CLASSES.map((w, i) => (
                  <div key={w} className="flex gap-2">
                    <span className="mt-1 inline-block size-3.5 shrink-0 rounded-sm border border-border" style={{ background: layer.bands[i].fill }} />
                    <div>
                      <dt className="font-medium">{shown.bands[i].label}</dt>
                      {WRB[w]?.note && (
                        <dd className="text-xs text-muted">{locale === "en" ? WRB[w].noteEn : WRB[w].note}</dd>
                      )}
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
            {t("تعذّر جلبُ التوقّع الآن. أعد المحاولة بعد قليل.", "The forecast could not be fetched just now. Please try again shortly.")}
          </p>
        )}
        </div>
      </details>

      {/* ───────── يوماً بيوم ───────── */}
      {table && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">{t("المطر يوماً بيوم", "Rain day by day")}</h2>
          <p className="mb-4 mt-2 text-sm leading-7 text-muted">
            {t(
              "بالمليمتر لكل يوم، بألوان الخريطة نفسها. النقطة تعني أقلّ من ١ مم.",
              "In millimetres per day, in the map's colours. A dot means less than 1 mm.",
            )}
          </p>
          <DailyRainTable table={table} locale={locale} />
        </section>
      )}

      {/* ───────── المطر مقابل حاجة الجوّ ───────── */}
      <WeekForecast />

      <p className="mt-8 text-sm">
        {t(
          "تريد أن تعرف كم يحتاج محصولك من الماء بعد هذا المطر؟",
          "Want to know how much water your crop needs after this rain?",
        )}{" "}
        <Link href="/tools/water" className="font-medium text-primary underline">
          {t("افتح حاسبة الاحتياج المائي", "Open the water requirement calculator")}
        </Link>
      </p>
      <p className="mt-2 text-xs text-muted">
        {locale === "en" ? (
          <>
            Source: Open-Meteo (forecast and elevation); soil from ISRIC SoilGrids
            {SOIL_FETCHED_AT && <> (read {SOIL_FETCHED_AT})</>}; Sudan&apos;s borders from Natural Earth.
          </>
        ) : (
          <>
            المصدر: <span dir="ltr">Open-Meteo</span> (التوقّع والارتفاع)، والتربة من{" "}
            <span dir="ltr">ISRIC SoilGrids</span>
            {SOIL_FETCHED_AT && <> (قُرئت {SOIL_FETCHED_AT})</>}، وحدود السودان من{" "}
            <span dir="ltr">Natural Earth</span>.
          </>
        )}
      </p>
    </div>
  );
}

/** The roads, rail and power tab: the map, then the largest stations. */
function InfraSection({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <>
      <h2 className="text-lg font-bold">{t("الطرق والسكك الحديدية والكهرباء", "Roads, railways and power")}</h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        {t(
          "كيف يصل المحصول إلى السوق وإلى بورتسودان، وأين تمرّ الشبكة لمن يفكّر في طلمبةٍ كهربائية بدل الديزل. بياناتٌ من قبل الحرب: الخطّ المرسوم خطٌّ بُني، لا خطٌّ يعمل اليوم بالضرورة.",
          "How a crop reaches the market and Port Sudan, and where the grid runs for anyone thinking of an electric pump instead of diesel. Pre-war data: a line drawn is a line that was built, not necessarily one working today.",
        )}
      </p>
      <InfraMap locale={locale} />
      <h3 className="mt-6 font-bold">{t("أكبر محطات الكهرباء", "The largest power stations")}</h3>
      <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {INFRA.stations.slice(0, 12).map((s) => (
          <li key={s.name} className="flex items-baseline gap-2">
            <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: FUEL_INK[s.fuel].ink }} aria-hidden />
            <span className="font-medium">
              {locale === "en" ? s.name : (s.nameAr ?? <span dir="ltr">{s.name}</span>)}
            </span>
            <span className="text-xs text-muted">
              {s.mw != null &&
                (locale === "en"
                  ? `${Math.round(s.mw).toLocaleString("en-GB")} MW`
                  : `${Math.round(s.mw).toLocaleString("ar-SA")} ميغاواط`)}
              {s.state && ` · ${placeName(s.state, locale)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        {locale === "en" ? (
          <>
            Source: the US Geological Survey (USGS), 2021, public domain — roads and rail from OpenStreetMap, and power
            from African Energy data. Only main roads are shown.
          </>
        ) : (
          <>
            المصدر: المسح الجيولوجي الأمريكي (<span dir="ltr">USGS</span>)، ٢٠٢١، ملكية عامة — الطرق والسكك من{" "}
            <span dir="ltr">OpenStreetMap</span>، والكهرباء من بيانات <span dir="ltr">African Energy</span>. تُعرض
            الطرق الرئيسية فقط.
          </>
        )}
      </p>
    </>
  );
}
