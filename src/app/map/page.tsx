import Link from "next/link";
import MapScreen from "@/components/map/MapScreen";
import { availableLayers, fetchRainGrid } from "@/lib/rainMap";
import { mapThemes } from "@/lib/mapLayers";
import { tr, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الخرائط | سوداقري", "Maps | Sudagri"),
    description: tr(
      locale,
      "خريطة السودان الحيّة: المطر والحرارة وحاجة الجوّ للأيام السبعة، والتضاريس والتربة والأراضي الموثّقة، وقناة الأرك والمعادن والطرق والكهرباء — على خريطةٍ أو صورة قمرٍ صناعيّ.",
      "Sudan's live map: rain, heat and the air's demand for the next seven days, terrain, soil and verified lands, the arc canal, minerals, roads and power — on a map or a satellite image.",
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
 * الخرائط (البند ١٤٧): كلّ ما ترسمه المنصّة على خريطةٍ واحدةٍ حيّة.
 *
 * The owner, 23 October: «ستبني شاشةً كاملة للخرائط تختار لها صفحة، وتكون
 * خريطتان يمكن تغييرهما: أقمارٌ اصطناعيّة أو الأخرى مثل خرائط تطبيقات التوصيل،
 * وتكون إبداعيّة». This is that page. The printed maps stay on their own
 * pages (/rain, /arc-canal, /mining), where they are the figures the text
 * explains and open with no script; this one is for looking around.
 *
 * The layers are built here, on the server, from the same week's grid /rain
 * reads (cached for three hours), and sent as plain shapes.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ layer?: string; over?: string }> }) {
  const { layer, over } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const grid = await fetchRainGrid({ lands: true });
  const dates = grid
    ? t(`من ${dayMonth(grid.from, locale)} إلى ${dayMonth(grid.to, locale)}`, `From ${dayMonth(grid.from, locale)} to ${dayMonth(grid.to, locale)}`)
    : undefined;
  const themes = mapThemes(grid, grid ? availableLayers(grid) : [], locale, dates);

  return (
    <div className="mx-auto max-w-6xl px-2 pb-10 pt-2 sm:px-4 xl:max-w-7xl">
      <h1 className="sr-only">{t("الخرائط", "Maps")}</h1>
      <MapScreen themes={themes} initial={layer ?? "rain"} initialOver={over ? over.split(",") : []} />

      {!grid && (
        <p className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
          {t(
            "تعذّر جلبُ توقّع الأسبوع الآن، فالطبقات الثابتة وحدها معروضة. أعد المحاولة بعد قليل.",
            "The week's forecast could not be fetched just now, so only the fixed layers are shown. Try again shortly.",
          )}
        </p>
      )}

      <section className="mx-auto mt-6 max-w-3xl px-2 text-sm leading-7">
        <h2 className="text-lg font-black">{t("عن هذه الخريطة", "About this map")}</h2>
        <p className="mt-1 text-muted">
          {t(
            "خريطة العالم كلّه، تتنقّل فيها كما في خرائط قوقل وتطبيقات التوصيل، و«موقعي» يضعك عليها بنقطةٍ زرقاء. وزرّ الأرضيّة على اليمين يبدّل بين الخريطة وصورة القمر الصناعيّ. والطبقات في الأعلى للسودان، لأنّ بياناتها عنه: طبقات الأسبوع تحلّ واحدتُها محلّ الأخرى، والقناة والمعادن والطرق تُضاف فوقها. المس أيّ لونٍ أو علامة لتقرأ ما هي.",
            "The whole world's map, moved around as in Google Maps and the delivery apps, and «My location» puts you on it with a blue dot. The ground button on the right switches between the map and the satellite image. The layers along the top are for Sudan, since their data is Sudan's: the week's layers replace one another, and the canal, minerals and roads are laid over them. Tap any colour or mark to read what it is.",
          )}
        </p>
        <p className="mt-2 text-muted">
          {t("ولكلّ طبقةٍ صفحتُها بالتفصيل:", "Each layer has its own page with the detail:")}{" "}
          <Link href="/rain" className="font-bold text-primary underline">
            {t("الأمطار والتربة", "Rain and soil")}
          </Link>
          {" · "}
          <Link href="/arc-canal" className="font-bold text-primary underline">
            {t("قناة الأرك", "The arc canal")}
          </Link>
          {" · "}
          <Link href="/mining" className="font-bold text-primary underline">
            {t("التعدين", "Mining")}
          </Link>
        </p>
        <p className="mt-3 text-xs text-muted">
          {locale === "en" ? (
            <>
              Sources: the forecast and elevation from Open-Meteo; soil from ISRIC SoilGrids; Sudan&apos;s border from
              Natural Earth; minerals, roads and power from the US Geological Survey (2021, pre-war). The map from
              OpenFreeMap and OpenStreetMap; the satellite image is EOxCloudless 2016 by EOX IT Services (modified
              Copernicus Sentinel data), at 10 metres — fields and canals, not houses.
            </>
          ) : (
            <>
              المصادر: التوقّع والارتفاع من <span dir="ltr">Open-Meteo</span>، والتربة من{" "}
              <span dir="ltr">ISRIC SoilGrids</span>، وحدود السودان من <span dir="ltr">Natural Earth</span>، والمعادن
              والطرق والكهرباء من المسح الجيولوجي الأمريكي (٢٠٢١، قبل الحرب). الخريطة من{" "}
              <span dir="ltr">OpenFreeMap</span> و<span dir="ltr">OpenStreetMap</span>، وصورة القمر الصناعيّ{" "}
              <span dir="ltr">EOxCloudless 2016</span> من <span dir="ltr">EOX</span> (بيانات{" "}
              <span dir="ltr">Copernicus Sentinel</span> معدّلة)، بدقّة ١٠ أمتار: تُرى فيها الحقول والترع، لا البيوت.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
