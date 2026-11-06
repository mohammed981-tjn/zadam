/**
 * What the live maps draw over the ground (البند ١٤٧): the same data the
 * printed maps draw — the week's rain and heat, soil, the arc canal, minerals,
 * roads and power — as GeoJSON for LiveMap.
 *
 * Colours: the owner did not want red or orange on the platform, and when
 * asked whether data maps were an exception (23 October) did not make one. So
 * where a printed map used them — the heat scale, a few soils, metals, thermal
 * power, the high-voltage lines — the live map uses the platform's own: beige
 * into pink for heat, earth browns and plum for the rest. The printed maps
 * keep theirs.
 *
 * Each layer is built on the server and handed to the page as plain data, so
 * the minerals and power files never reach the browser as code.
 */

import type { MapOverlay } from "@/components/map/LiveMap";
import { isobands, classRegions, clipToSudan, townValues } from "@/lib/mapDraw";
import { SUDAN_BORDER, localizeLayer, type Layer, type RainGrid } from "@/lib/rainMap";
import { PLACES, ROUTE } from "@/lib/arcCanal";
import { MINERALS, GROUPS } from "@/components/MineralsMap";
import { INFRA, FUEL_INK } from "@/components/InfraMap";
import { WRB } from "@/lib/soilClasses";
import { digits } from "@/components/RainMap";
import { COMMODITY_EN, SITE_STATUS_EN, SITE_WHAT_EN, inEnglish, placeName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features });
/** About a hundred metres: enough for a country map, and a third of the bytes. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const pt = ([lon, lat]: readonly [number, number] | [number, number]): [number, number] => [r3(lon), r3(lat)];

/** Heat in the platform's colours: beige into pink, no orange. */
export const HEAT = ["#f3f1e6", "#d9ecd2", "#a8d8a8", "#6fbf7d", "#3fae66", "#1f7a3d"];

/** Soils whose usual WRB colour is red or orange, in earth browns and plum instead. */
const SOIL_SAFE: Record<string, string> = {
  Nitisols: "#6e3b2a",
  Ferralsols: "#9b4a6a",
  Acrisols: "#c4a07a",
  Plinthosols: "#7a5a44",
  Luvisols: "#a07a5c",
  Lixisols: "#c9a98a",
};

const GROUP_SAFE: Record<string, string> = { metal: "#8a4f7d" };
const FUEL_SAFE: Record<string, string> = { thermal: "#1f7a3d" };
/** The grid by voltage, backbone first: plum shades where the printed map has reds. */
const POWER = [
  { min: 400, colour: "#4b2470", width: 3 },
  { min: 200, colour: "#6d4a9c", width: 2.2 },
  { min: 0, colour: "#9a86c4", width: 1.4 },
];

const bandColour = (layer: Layer, k: number) => {
  if (layer.key === "tmax") return HEAT[Math.min(k, HEAT.length - 1)];
  const fill = layer.bands[k]?.fill ?? "#cccccc";
  if (layer.key === "soil") {
    const name = Object.entries(WRB).find(([, w]) => w.fill === fill)?.[0];
    if (name && SOIL_SAFE[name]) return SOIL_SAFE[name];
  }
  // The first band of rain is «the card colour»: on a map, no paint at all.
  return fill.startsWith("var(") ? "rgba(0,0,0,0)" : fill;
};

/** One theme the map screen offers: its chip, its key, and what it draws. */
export type MapTheme = {
  key: string;
  emoji: string;
  title: string;
  /** One line on what the colours are. */
  note: string;
  /** A second line: the dates, or what the layer is not. */
  sub?: string;
  unit?: string;
  /** Swatches, low to high. */
  legend?: { colour: string; label: string }[];
  /** Line and point keys: what each colour or mark is. */
  key2?: { colour: string; label: string; shape: "line" | "dot" | "dash" }[];
  /** A grid layer replaces the last; the others are laid over whatever is shown. */
  group: "grid" | "over";
  overlays: MapOverlay[];
  /** Said on the map when the layer has nothing to show yet. */
  empty?: { text: string; href: string; link: string };
};

/** A layer of the week's grid (rain, heat, evaporation, height, soil) as filled bands, with each town's value. */
function gridTheme(grid: RainGrid, given: Layer, locale: Locale): MapOverlay[] {
  const layer = localizeLayer(given, locale);
  const bands = layer.key === "soil" ? classRegions(grid.cells, true) : isobands(grid.cells, layer, true);
  if (!bands) return [];
  const withUnit = layer.unit && layer.numbers !== false ? ` ${layer.unit}` : "";
  const label = (k: number) => {
    const b = layer.bands[k];
    return b ? `${layer.title}: ${b.label}${withUnit}` : layer.title;
  };
  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: { colour: bandColour(layer, bands.base), title: label(bands.base), detail: layer.note },
      geometry: { type: "Polygon", coordinates: [SUDAN_BORDER.map(pt)] },
    },
    ...bands.bands.map(
      (b): GeoJSON.Feature => ({
        type: "Feature",
        properties: { colour: bandColour(layer, b.band), title: label(b.band), detail: layer.note },
        // Cut at the border: the countries around are shown as they are.
        geometry: { type: "MultiPolygon", coordinates: clipToSudan(b.shapes) },
      }),
    ),
  ];
  // The value at each labelled town, as a delivery app shows a price on its pin.
  const towns = townValues(grid.cells, given).filter((x) => x.value != null);
  const fmt = (v: number) => (layer.key === "rain" && v < 0.5 ? digits(0, locale) : digits(v, locale));
  return [
    { kind: "fill", id: `grid-${layer.key}`, under: true, data: fc(features), color: ["get", "colour"], opacity: 0.62 },
    ...(towns.length
      ? [
          {
            kind: "pins" as const,
            id: `towns-${layer.key}`,
            pins: towns.map((x) => ({
              lon: x.lon,
              lat: x.lat,
              text: fmt(x.value!),
              name: placeName(x.name, locale),
              title: `${placeName(x.name, locale)}: ${fmt(x.value!)}${withUnit}`,
              detail: layer.note,
            })),
          },
        ]
      : []),
  ];
}

/** Verified lands, counted per square at its centre — never a dot on anyone's field. */
function landsTheme(grid: RainGrid, locale: Locale): MapOverlay[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const cells = grid.cells.filter((c) => c.lands);
  if (!cells.length) return [];
  return [
    {
      kind: "pins",
      id: "lands",
      tone: "green",
      pins: cells.map((c) => ({
        lon: c.lon,
        lat: c.lat,
        text: digits(c.lands!, locale),
        title: t(`${digits(c.lands!, locale)} أرضٌ موثّقة في هذا المربّع`, `${c.lands} verified land${c.lands === 1 ? "" : "s"} in this square`),
        detail: t("مربّعٌ عرضه نحو ١٦٧ كم. موقع كل أرضٍ في صفحتها، لمن يأذن له صاحبها.", "A square about 167 km across. Each land's place is on its own page, for whom its owner allows."),
      })),
    },
  ];
}

/** The arc canal from Jebel Aulia, as its route was drawn. */
function canalTheme(locale: Locale): MapOverlay[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return [
    {
      kind: "line",
      id: "canal",
      color: "#1f7a3d",
      width: 5,
      data: fc([
        {
          type: "Feature",
          properties: {
            title: t("قناة الأرك المقترحة", "The proposed arc canal"),
            detail: t("من خزّان جبل أولياء، نصف دائرةٍ طولها نحو ٩٤ كم.", "From the Jebel Aulia reservoir, a half circle about 94 km long."),
          },
          geometry: { type: "LineString", coordinates: ROUTE.map((p) => pt([p.lon, p.lat])) },
        },
      ]),
    },
    // Its two ends and the cities it passes, named as the study's map names them.
    {
      kind: "pins",
      id: "canal-places",
      pins: PLACES.map((p) => ({ lon: p.lon, lat: p.lat, text: placeName(p.name, locale) })),
    },
  ];
}

/** Mines, quarries and oilfields, coloured by what they yield. */
function mineralsTheme(locale: Locale): MapOverlay[] {
  const en = locale === "en";
  return [
    {
      kind: "points",
      id: "minerals",
      radius: 6,
      color: ["get", "colour"],
      data: fc(
        MINERALS.sites.map((s) => ({
          type: "Feature",
          // The words of the mining page's list, shortened to a card.
          properties: {
            colour: GROUP_SAFE[s.group] ?? GROUPS[s.group].ink,
            title: en
              ? `${inEnglish(COMMODITY_EN, s.commodityAr, locale)} — ${s.name}`
              : `${s.commodityAr} — ${s.place ?? s.name}`,
            detail: (en
              ? [
                  inEnglish(SITE_WHAT_EN, s.what, locale),
                  s.state ? `${placeName(s.state, locale)} state` : null,
                  s.status ? inEnglish(SITE_STATUS_EN, s.status, locale) : null,
                ]
              : [s.what, s.state ? `ولاية ${s.state}` : null, s.status]
            )
              .filter(Boolean)
              .join(" · "),
          },
          geometry: { type: "Point", coordinates: pt([s.lon, s.lat]) },
        })),
      ),
    },
  ];
}

/** Roads, railway, power lines by voltage, and power stations. */
function infraTheme(locale: Locale): MapOverlay[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  // One feature per kind of line, not one per segment: the same lines in a third of the bytes.
  const multi = (rows: [number, number][][], properties: Record<string, unknown>): GeoJSON.Feature => ({
    type: "Feature",
    properties,
    geometry: { type: "MultiLineString", coordinates: rows.map((l) => l.map(pt)) },
  });
  return [
    {
      kind: "line",
      id: "roads",
      color: "#a1673f",
      width: 1.8,
      data: fc([multi(INFRA.roads, { title: t("طريقٌ رئيسيّ", "Main road") })]),
    },
    {
      kind: "line",
      id: "rail",
      color: "#1f2937",
      width: 1.8,
      dash: [2, 1.5],
      data: fc([multi(INFRA.rail, { title: t("سكّة حديد", "Railway") })]),
    },
    {
      kind: "line",
      id: "power",
      color: ["get", "colour"],
      width: ["get", "width"],
      data: fc(
        POWER.map((p, i) =>
          multi(
            INFRA.power.filter((l) => l.kv >= p.min && (i === 0 || l.kv < POWER[i - 1].min)).map((l) => l.line),
            {
              colour: p.colour,
              width: p.width,
              title: t(
                i === 0 ? "خطّ كهرباء ٤٠٠ كيلوفولت فأكثر" : i === 1 ? "خطّ كهرباء ٢٢٠–٢٣٠ كيلوفولت" : "خطّ كهرباء أقلّ من ٢٠٠ كيلوفولت",
                i === 0 ? "Power line, 400 kV and over" : i === 1 ? "Power line, 220–230 kV" : "Power line, under 200 kV",
              ),
            },
          ),
        ),
      ),
    },
    {
      kind: "points",
      id: "stations",
      radius: 7,
      color: ["get", "colour"],
      data: fc(
        INFRA.stations.map((s) => ({
          type: "Feature",
          properties: {
            colour: FUEL_SAFE[s.fuel] ?? FUEL_INK[s.fuel].ink,
            title:
              (locale === "en" ? s.name : (s.nameAr ?? s.name)) +
              (s.mw ? (locale === "en" ? ` — ${Math.round(s.mw)} MW` : ` — ${digits(s.mw, locale)} ميغاواط`) : ""),
            detail: t(FUEL_INK[s.fuel].label, FUEL_INK[s.fuel].en),
          },
          geometry: { type: "Point", coordinates: pt([s.lon, s.lat]) },
        })),
      ),
    },
  ];
}

const SHORT_GROUP: Record<keyof typeof GROUPS, [string, string]> = {
  gold: ["ذهب وفضّة", "Gold and silver"],
  metal: ["معادن فلزّيّة", "Metals"],
  fuel: ["نفط", "Oil"],
  industrial: ["معادن صناعيّة", "Industrial minerals"],
};
const SHORT_FUEL: Record<keyof typeof FUEL_INK, [string, string]> = {
  hydro: ["محطّة مائيّة", "Hydro station"],
  thermal: ["محطّة حراريّة", "Thermal station"],
  biomass: ["محطّة كتلة حيويّة", "Biomass station"],
};

const dayMonth = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ar", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Khartoum",
  });

/** The week's dates as the map's key says them («من 6 نوفمبر إلى 12 نوفمبر»); none without a grid. Shared by /map and /api/app/map. */
export function mapWeekDates(grid: RainGrid | null, locale: Locale): string | undefined {
  if (!grid) return undefined;
  return tr(
    locale,
    `من ${dayMonth(grid.from, locale)} إلى ${dayMonth(grid.to, locale)}`,
    `From ${dayMonth(grid.from, locale)} to ${dayMonth(grid.to, locale)}`,
  );
}

const EMOJI: Record<string, string> = { rain: "🌧️", tmax: "🌡️", et0: "💨", elev: "⛰️", soil: "🟤", lands: "🌾" };

/** Every theme the map screen offers, in chip order: the week first, then what stays put. */
export function mapThemes(grid: RainGrid | null, layers: Layer[], locale: Locale, dates?: string): MapTheme[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const themes: MapTheme[] = [];
  if (grid) {
    for (const given of layers) {
      const layer = localizeLayer(given, locale);
      if (layer.key === "lands") {
        themes.push({
          key: "lands",
          emoji: EMOJI.lands,
          title: layer.title,
          note: layer.note,
          sub: t("بعددها في كل مربّع — لا تضع الخريطة نقطةً على أرض أحد.", "Counted per square — the map never puts a dot on anyone's land."),
          group: "grid",
          overlays: landsTheme(grid, locale),
          empty: {
            text: t("لا أرضَ موثّقة معروضة بعد.", "No verified land is listed yet."),
            href: "/lands/new",
            link: t("سجّل أرضك", "Register your land"),
          },
        });
        continue;
      }
      const sub =
        layer.key === "elev"
          ? t("ثابتةٌ لا تتغيّر مع الطقس، بدقّة المربّع (١٦٠ كم).", "Fixed; it does not change with the weather. At the square's resolution (160 km).")
          : layer.key === "soil"
            ? t("صورة البلد العامّة، لا فحصُ تربة حقلك.", "The country's overall picture, not a test of your field.")
            : dates;
      themes.push({
        key: layer.key,
        emoji: EMOJI[layer.key] ?? "🗺️",
        title: layer.title,
        note: layer.note,
        sub,
        unit: layer.numbers === false ? undefined : layer.unit,
        legend: layer.bands.map((b, k) => ({ colour: bandColour(layer, k), label: b.label })),
        group: "grid",
        overlays: gridTheme(grid, given, locale),
      });
    }
  }
  themes.push(
    {
      key: "canal",
      emoji: "〰️",
      title: t("قناة الأرك", "Arc canal"),
      note: t("مسار القناة القوسيّة المقترحة من جبل أولياء", "The proposed arc canal's route from Jebel Aulia"),
      key2: [{ colour: "#1f7a3d", label: t("مسار القناة", "Canal route"), shape: "line" }],
      group: "over",
      overlays: canalTheme(locale),
    },
    {
      key: "minerals",
      emoji: "⛏️",
      title: t("المعادن", "Minerals"),
      note: t("المناجم والحقول والرواسب المعروفة (المسح الجيولوجي الأمريكي، قبل الحرب)", "Mines, fields and known deposits (USGS, pre-war)"),
      // Short words: the key is a card over the map, not the mining page's list.
      key2: (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => ({
        colour: GROUP_SAFE[g] ?? GROUPS[g].ink,
        label: t(SHORT_GROUP[g][0], SHORT_GROUP[g][1]),
        shape: "dot" as const,
      })),
      group: "over",
      overlays: mineralsTheme(locale),
    },
    {
      key: "infra",
      emoji: "⚡",
      title: t("الطرق والكهرباء", "Roads and power"),
      note: t(
        "الطرق الرئيسيّة والسكّة الحديد وخطوط الكهرباء (بالكيلوفولت) ومحطّاتها، قبل الحرب",
        "Main roads, the railway, power lines (in kilovolts) and stations, pre-war",
      ),
      key2: [
        { colour: "#a1673f", label: t("طريقٌ رئيسيّ", "Main road"), shape: "line" },
        { colour: "#1f2937", label: t("سكّة حديد", "Railway"), shape: "dash" },
        { colour: POWER[0].colour, label: t("كهرباء ٤٠٠ فأكثر", "Power, 400+"), shape: "line" },
        { colour: POWER[1].colour, label: t("كهرباء ٢٢٠–٢٣٠", "Power, 220–230"), shape: "line" },
        { colour: POWER[2].colour, label: t("كهرباء أقلّ من ٢٠٠", "Power, under 200"), shape: "line" },
        ...(Object.keys(FUEL_INK) as (keyof typeof FUEL_INK)[]).map((f) => ({
          colour: FUEL_SAFE[f] ?? FUEL_INK[f].ink,
          label: t(SHORT_FUEL[f][0], SHORT_FUEL[f][1]),
          shape: "dot" as const,
        })),
      ],
      group: "over",
      overlays: infraTheme(locale),
    },
  );
  return themes;
}
