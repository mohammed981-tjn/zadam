import { createClient } from "@/lib/supabase/server";
import {
  FAOSTAT_ITEM,
  HECTARES_PER_FEDDAN,
  NEAREST_PEER,
  PEER_AREAS,
} from "@/lib/cropBenchmark";
import { tr, type Locale } from "@/lib/i18n";

/** kg/ha → kg/feddan, the unit a Sudanese farmer weighs a harvest in. */
const perFeddan = (kgPerHa: number) => kgPerHa * HECTARES_PER_FEDDAN;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * «أين تقف غلّةُ هذا المحصول؟» — السودان، ومصر، ووسيطُ النظراء، من FAOSTAT.
 *
 * WHY THESE THREE AND NOT THE WORLD'S BEST
 *
 * `cropBenchmark.ts` explains it at length: the world maximum for tomatoes is a
 * Belgian glasshouse, and showing it to a farmer in Kassala says nothing except
 * that the platform does not understand him. So the season page shows Sudan's
 * own national figure, Egypt as the single sharpest comparison (same river,
 * same climate band, irrigated), and the median of arid open-field peers.
 *
 * "YOUR YIELD" APPEARS ONLY ONCE IT EXISTS
 *
 * The harvested weight is typed when the season is closed (`harvest_kg`, added
 * 24 September 2026). Until then there is nothing to compare, and printing a
 * blank tile where the farmer's own number belongs would be a form pretending
 * to be a result — so the tile is simply absent. When present it is labelled
 * as declared: nothing weighs it.
 *
 * WHY THE LATEST YEAR ONLY
 *
 * The loaded QCL domain carries yields for 2023 and 2024 only (checked 24
 * September 2026), so an eight-year trend line cannot be drawn honestly yet.
 * When the earlier years are loaded, the trend belongs here.
 */
export default async function YieldBenchmark({
  cropKey,
  declaredKgPerFeddan = null,
  locale = "ar",
}: {
  cropKey: string;
  /** من `seasons.harvest_kg` ÷ الأفدنة — يصرّح به المزارع عند الإقفال. */
  declaredKgPerFeddan?: number | null;
  locale?: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const n0 = (v: number) =>
    Math.round(v).toLocaleString(locale === "en" ? "en-GB" : "ar");

  const item = FAOSTAT_ITEM[cropKey];
  if (!item) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faostat_observations")
    .select("area, year, value")
    .eq("domain", "QCL")
    .eq("element", "Yield")
    .eq("item", item)
    .in("area", ["Sudan", ...PEER_AREAS]);

  if (error || !data || data.length === 0) return null;

  const rows = data as { area: string; year: number; value: number | string }[];
  const latestYear = Math.max(...rows.map((r) => r.year));
  const at = (area: string, year = latestYear) => {
    const r = rows.find((x) => x.area === area && x.year === year);
    return r ? Number(r.value) : null;
  };

  const sudan = at("Sudan");
  if (sudan === null) return null;
  const sudanPrev = at("Sudan", latestYear - 1);
  const egypt = at(NEAREST_PEER);
  const peers = median(
    PEER_AREAS.map((a) => at(a)).filter((v): v is number => v !== null),
  );

  const tiles: { label: string; kg: number; note?: string; own?: boolean }[] = [
    ...(declaredKgPerFeddan !== null
      ? [
          {
            label: t("غلّتك", "Your yield"),
            kg: declaredKgPerFeddan / HECTARES_PER_FEDDAN,
            note: t(
              "كما صرّحتَ بها عند الإقفال",
              "As you declared it when closing the season",
            ),
            own: true,
          },
        ]
      : []),
    {
      label: t(`السودان ${latestYear}`, `Sudan ${latestYear}`),
      kg: sudan,
      note:
        sudanPrev !== null
          ? `${latestYear - 1}: ${n0(perFeddan(sudanPrev))} ${t("كجم/فدان", "kg/feddan")}`
          : undefined,
    },
    ...(egypt !== null
      ? [
          {
            label: t("مصر", "Egypt"),
            kg: egypt,
            note: t("النيلُ نفسه، مرويّاً", "The same Nile, irrigated"),
          },
        ]
      : []),
    ...(peers !== null
      ? [
          {
            label: t("وسيطُ النظراء", "Peer median"),
            kg: peers,
            note: t(
              "دولٌ جافّة، زراعةٌ مكشوفة",
              "Arid countries, open-field farming",
            ),
          },
        ]
      : []),
  ];

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-bold">
        {t("أين تقف غلّةُ هذا المحصول؟", "Where does this crop's yield stand?")}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-xl p-3 ${tile.own ? "border border-primary/40 bg-primary/5" : "bg-background"}`}
          >
            <p className="text-xs text-muted">{tile.label}</p>
            <p className="figure text-lg font-black text-primary">
              {n0(perFeddan(tile.kg))}{" "}
              <span className="text-xs font-medium text-muted">
                {t("كجم/فدان", "kg/feddan")}
              </span>
            </p>
            {tile.note && <p className="text-[11px] text-muted">{tile.note}</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-6 text-muted">
        {t(
          "المتوسّطُ الوطنيّ يجمع المطريّ والمرويّ معاً، فقارِن به بحذر. وحين تحصد، زِن محصولك واقسمه على الأفدنة — ذلك هو الرقم الذي يُقارَن بهذه. المصدر: FAOSTAT، منظمة الأغذية والزراعة.",
          "The national average combines rainfed and irrigated farming, so compare with it carefully. When you harvest, weigh your crop and divide it by the feddans — that is the figure to compare with these. Source: FAOSTAT, Food and Agriculture Organization of the UN.",
        )}
      </p>
    </section>
  );
}
