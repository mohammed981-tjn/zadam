import soilData from "../../data/sudan-soil.json";
import { forecastUrl, parseOpenMeteo, type ForecastDay } from "./forecast";
import { WRB, wrbShort, wrbShortEn } from "./soilClasses";
import type { Locale } from "./i18n";
import { createPublicClient } from "./supabase/public";

/**
 * خريطة المطر: مجموعُ الأيام السبعة القادمة على شبكةٍ تغطّي السودان.
 *
 * WHY A GRID AND NOT THE STATIONS
 *
 * The station table answers "how much rain in Wad Madani". A farmer in
 * Gedaref or Blue Nile asks about a place with no station in that list, and
 * the rainy season is exactly where the stations are thinnest: the south and
 * the east. A regular grid of 1.5° cells (about 160 km) covers every state
 * with one Open-Meteo request, and colour carries the pattern while the number
 * in each cell carries the amount.
 *
 * 1.5° is a compromise with the phone screen. A finer grid is more exact, but
 * at 390px across the numbers stop fitting in their cells, and a map of
 * unreadable numbers is worse than a coarser map of readable ones.
 *
 * WHAT A CELL'S NUMBER IS
 *
 * The forecast at the cell's centre, summed over seven days. It is a model
 * value at a point, not an area average and not a measurement, so the page
 * says "توقّع" everywhere and never "هطل".
 *
 * THE BORDER — WITH HALAIB
 *
 * Natural Earth 1:50m (public domain), simplified to about 5 km, with the
 * Halaib Triangle joined to it from Natural Earth's disputed-areas layer
 * (1:10m). Natural Earth draws the de-facto line, which leaves Halaib to
 * Egypt; this is a Sudanese platform and draws Sudan as Sudan maps it, with
 * the triangle inside (the owner's instruction, 24 September 2026). The
 * grid reaches 23.5°N so the triangle has cells and a forecast of its own.
 */

export type LonLat = readonly [number, number];

export const SUDAN_BORDER: LonLat[] = [
  [34.08, 9.46], [33.87, 9.51], [33.96, 9.86], [33.91, 10.18], [33.38, 10.65], [33.13, 10.75],
  [33.17, 10.85], [33.07, 11.61], [33.2, 12.22], [32.72, 12.22], [32.74, 12.01], [32.07, 12.01],
  [32.34, 11.69], [32.34, 11.31], [32.42, 11.09], [31.93, 10.66], [31.65, 10.22], [31.15, 9.77],
  [30.76, 9.73], [30, 10.28], [29.6, 10.06], [29.6, 9.92], [29.47, 9.77], [28.98, 9.59],
  [28.84, 9.46], [28.85, 9.33], [28.05, 9.33], [27.88, 9.6], [27.07, 9.61], [26.66, 9.48],
  [25.92, 10.17], [25.8, 10.42], [25.07, 10.29], [25, 10.06], [24.78, 9.77], [24.78, 9.53],
  [24.67, 9.39], [24.53, 8.89], [24.21, 8.77], [24.15, 8.67], [23.58, 8.77], [23.47, 9.11],
  [23.62, 9.34], [23.65, 9.82], [23.31, 10.39], [22.86, 10.92], [22.92, 11.35], [22.59, 11.58],
  [22.58, 11.99], [22.47, 12.07], [22.35, 12.66], [21.93, 12.68], [21.83, 12.79], [21.99, 13.11],
  [22.23, 13.33], [22.13, 13.85], [22.51, 14.13], [22.5, 14.24], [22.38, 14.55], [22.67, 14.72],
  [22.76, 15], [22.93, 15.16], [22.93, 15.53], [23.01, 15.63], [23.11, 15.7], [23.97, 15.72],
  [23.98, 20], [24.98, 20], [24.98, 22], [31.21, 21.99], [31.4, 22.2], [31.49, 22.15],
  [31.43, 22], [34.08, 22], [34.15, 22.19], [34.68, 22.3], [34.94, 22.86], [35.21, 22.79],
  [35.62, 23.14], [35.85, 22.76], [36.23, 22.64], [36.44, 22.36], [36.78, 22.16], [36.89, 22.01],
  [36.93, 21.59], [37.26, 21.11], [37.26, 21.04], [37.15, 21.1], [37.14, 20.98], [37.23, 20.56],
  [37.19, 20.12], [37.25, 19.58], [37.47, 18.82], [38.61, 18], [38.22, 17.56], [37.55, 17.32],
  [37.41, 17.06], [37.01, 17.06], [36.89, 16.62], [36.91, 16.3], [36.43, 15.13], [36.52, 14.26],
  [36.39, 13.63], [36.16, 13.09], [36.12, 12.76], [35.67, 12.62], [35.11, 11.82], [34.93, 10.86],
  [34.77, 10.75], [34.57, 10.88], [34.34, 10.66], [34.27, 10.53], [34.31, 10.19], [34.08, 9.46],
];

/**
 * The stretch of the border that goes round the Halaib Triangle, from where the
 * 22°N line stops (34.08°E) to the Red Sea coast. The live map draws it as the
 * border and hides the dashed «disputed» line that OpenStreetMap lays along the
 * triangle's southern edge, which cut the triangle off from Sudan (البند ١٧٤).
 */
export const HALAIB_BORDER: LonLat[] = SUDAN_BORDER.slice(
  SUDAN_BORDER.findIndex(([lon, lat]) => lon === 34.08 && lat === 22),
  SUDAN_BORDER.findIndex(([lon, lat]) => lon === 36.89 && lat === 22.01) + 1,
);

export const CELL_DEG = 1.5;
export const LON_MIN = 21.75;
export const LON_MAX = 38.75;
export const LAT_MIN = 8.5;
export const LAT_MAX = 23.5;

/** Ray casting. Points exactly on an edge may land either side; cells never sit there. */
export function insideSudan([lon, lat]: LonLat, poly: LonLat[] = SUDAN_BORDER): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface RainCell {
  /** Centre of the cell — where it is drawn. */
  lon: number;
  lat: number;
  /**
   * Where the forecast is read and the number written: the centre when it is
   * inside the border, otherwise the middle of the part that is.
   */
  pLon: number;
  pLat: number;
  /**
   * True when at least a fifth of the cell is inside the border. Only these
   * carry a number. The others are slivers, drawn clipped to the border so
   * the country has no gaps, with no figure of their own.
   *
   * Reading the forecast at the inside part rather than at the centre is
   * what gives an edge region its own number. Halaib is the case that forced
   * it: the coast cuts its cells so that no centre falls on land, and a
   * centre-only rule left the triangle painted but silent.
   */
  labelled: boolean;
}

/**
 * The towns drawn on the map so a reader can find their own place, and the
 * side of the dot each name sits on — whichever is clear of its cell's number.
 * Chosen by hand for these seven and checked by looking: a seventh needs the
 * same look. They live here, not in the drawing, because the cell builder
 * keeps edge numbers off them.
 */
export const MAP_TOWNS: { name: string; lon: number; lat: number; above: boolean }[] = [
  { name: "الخرطوم", lon: 32.53, lat: 15.6, above: true },
  { name: "بورتسودان", lon: 37.22, lat: 19.62, above: true },
  { name: "القضارف", lon: 35.39, lat: 14.03, above: true },
  { name: "الأبيض", lon: 30.22, lat: 13.18, above: false },
  { name: "نيالا", lon: 24.88, lat: 12.05, above: true },
  { name: "دنقلا", lon: 30.48, lat: 19.17, above: false },
  { name: "حلايب", lon: 36.64, lat: 22.22, above: false },
];

/** How close (degrees) an edge number may come to a town's dot and name. */
const TOWN_CLEARANCE = 0.4;

const SAMPLES = 6;

/**
 * Every cell with any part inside Sudan, sampled on a 6×6 sub-grid. Built
 * once from the constants above, so the request and the drawing can never
 * disagree about which cells exist.
 */
export function buildCells(): RainCell[] {
  const cells: RainCell[] = [];
  const h = CELL_DEG / 2;
  for (let lat = LAT_MIN + h; lat < LAT_MAX; lat += CELL_DEG) {
    for (let lon = LON_MIN + h; lon < LON_MAX; lon += CELL_DEG) {
      const inside: LonLat[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const q: LonLat = [
            lon - h + ((i + 0.5) / SAMPLES) * CELL_DEG,
            lat - h + ((j + 0.5) / SAMPLES) * CELL_DEG,
          ];
          if (insideSudan(q)) inside.push(q);
        }
      }
      if (inside.length === 0) continue;
      const centreIn = insideSudan([lon, lat]);
      // The mean of the inside samples can itself fall outside a concave
      // shape; the inside sample nearest to it cannot.
      const mLon = inside.reduce((a, q) => a + q[0], 0) / inside.length;
      const mLat = inside.reduce((a, q) => a + q[1], 0) / inside.length;
      // Edge numbers keep clear of the town names; Port Sudan sits exactly
      // where its coastal cell's inside part is.
      const clear = inside.filter((q) =>
        MAP_TOWNS.every(
          (t) => Math.hypot(q[0] - t.lon, q[1] - t.lat) > TOWN_CLEARANCE,
        ),
      );
      const pool = clear.length > 0 ? clear : inside;
      const near = pool.reduce((best, q) =>
        (q[0] - mLon) ** 2 + (q[1] - mLat) ** 2 <
        (best[0] - mLon) ** 2 + (best[1] - mLat) ** 2
          ? q
          : best,
      );
      const [pLon, pLat] = centreIn ? [lon, lat] : near;
      cells.push({
        lon: round2(lon),
        lat: round2(lat),
        pLon: round2(pLon),
        pLat: round2(pLat),
        labelled: centreIn || inside.length >= (SAMPLES * SAMPLES) / 5,
      });
    }
  }
  return cells;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const RAIN_CELLS = buildCells();

export interface Band {
  min: number;
  label: string;
  fill: string;
  /** Text colour that reads on this fill. */
  ink: string;
}
/** One cell with everything the map can show. */
export interface GridCell extends RainCell {
  /** Seven-day totals and the week's hottest afternoon. */
  rainMm: number;
  et0Mm: number;
  tmaxC: number;
  /** Ground height at the centre, metres. Null when the elevation read failed. */
  elevM: number | null;
  /** Most probable soil group (WRB name), null before the soil survey has run. */
  soil: string | null;
  /** Verified lands listed on the platform inside this cell; null for none. */
  lands: number | null;
}

export type LayerKey = "rain" | "tmax" | "et0" | "elev" | "soil" | "lands";

export interface Layer {
  key: LayerKey;
  /** Tab label. */
  title: string;
  /** What the number in a cell is, in one line under the map. */
  note: string;
  unit: string;
  bands: Band[];
  value: (c: GridCell) => number | null;
  /**
   * False for a layer whose value is a class, not an amount — the soil
   * group's index means nothing written in a cell, so the colour and the
   * legend carry it alone.
   */
  numbers?: boolean;
  /**
   * Shown even when no cell has a value. The lands layer is empty until the
   * first land is listed, and an empty map that says so is the answer to
   * "where are the lands"; a missing tab is not.
   */
  always?: boolean;
}

/**
 * Sequential blues, light to dark, because more rain is more of one thing.
 * The first band is the card colour, so "no rain" reads as the absence of
 * paint in both themes rather than as a pale blue that suggests a little.
 */
export const RAIN_BANDS: Band[] = [
  { min: 0, label: "أقلّ من ١", fill: "var(--card)", ink: "var(--muted)" },
  { min: 1, label: "١–٥", fill: "#d4e8f6", ink: "#12324f" },
  { min: 5, label: "٥–١٥", fill: "#9cc9ea", ink: "#12324f" },
  { min: 15, label: "١٥–٣٠", fill: "#5a9fd4", ink: "#ffffff" },
  { min: 30, label: "٣٠–٦٠", fill: "#2a6db0", ink: "#ffffff" },
  { min: 60, label: "٦٠ فأكثر", fill: "#143f78", ink: "#ffffff" },
];

/**
 * THE OTHER LAYERS
 *
 * Each answers a question the platform's users already bring to it, from data
 * the rain request already returns or one more cached call:
 *
 *  - الحرارة: the week's hottest afternoon — heat stress at flowering, and
 *    how hard the herd is working for water.
 *  - حاجة الجوّ: FAO-56 reference evapotranspiration summed over the week,
 *    the same quantity the water calculator is built on. Browns, because more
 *    of it means drier air; a green ramp would read as "wetter".
 *  - التضاريس: ground height from Open-Meteo's elevation service (Copernicus
 *    DEM, 90 m) at each cell centre. At 160 km a cell it shows the shape of
 *    the country — the Nile valley, Jebel Marra, the Red Sea hills — not a
 *    site survey; the canal study's SRTM profile is the survey.
 */
/* ───────────────────────── التربة ───────────────────────── */

interface SoilRow {
  lon: number;
  lat: number;
  wrb: string | null;
  share: number | null;
}

const cellKey = (lon: number, lat: number) => `${lon.toFixed(2)},${lat.toFixed(2)}`;

const SOIL_ROWS = (soilData as { cells: SoilRow[] }).cells;
export const SOIL_FETCHED_AT = (soilData as { fetchedAt: string | null }).fetchedAt;
const SOIL_BY_CELL = new Map(SOIL_ROWS.filter((r) => r.wrb).map((r) => [cellKey(r.lon, r.lat), r.wrb!]));

/**
 * The groups that actually occur, commonest first — the legend lists these
 * and no others, so it is as long as the country needs and not the twenty
 * the classification has.
 */
export const SOIL_CLASSES: string[] = (() => {
  const n = new Map<string, number>();
  for (const w of SOIL_BY_CELL.values()) n.set(w, (n.get(w) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
})();

/**
 * THE SOIL AND LAND LAYERS
 *
 *  - التربة: the most probable WRB group across up to five SoilGrids points in
 *    each cell (scripts/fetch-sudan-soil.ts). A class, so it is coloured and
 *    named in the legend, with no figure in the cell.
 *  - الأراضي: how many verified, listed lands on the platform fall in each
 *    cell. Counted per cell on purpose — the map never puts a dot on
 *    anyone's field; the land's own page is where its place is shown, to
 *    whom its owner allows.
 */
const SOIL_LAYER: Layer = {
  key: "soil",
  title: "التربة",
  note: "صنف التربة الأرجح في كل مربّع",
  unit: "تصنيف WRB",
  numbers: false,
  bands: SOIL_CLASSES.map((w, i) => ({
    min: i,
    label: wrbShort(w),
    fill: WRB[w]?.fill ?? "#cccccc",
    ink: "#ffffff",
  })),
  value: (c) => {
    const i = c.soil ? SOIL_CLASSES.indexOf(c.soil) : -1;
    return i < 0 ? null : i;
  },
};

const LANDS_LAYER: Layer = {
  key: "lands",
  title: "الأراضي",
  note: "الأراضي الموثّقة المعروضة على المنصّة في كل مربّع",
  unit: "أرض",
  always: true,
  bands: [
    { min: 1, label: "١", fill: "#cfe8c4", ink: "#1f3318" },
    { min: 2, label: "٢–٤", fill: "#8fcb7a", ink: "#1f3318" },
    { min: 5, label: "٥–٩", fill: "#4c9a3f", ink: "#ffffff" },
    { min: 10, label: "١٠ فأكثر", fill: "#2a6424", ink: "#ffffff" },
  ],
  value: (c) => c.lands,
};

export const LAYERS: Layer[] = [
  {
    key: "rain",
    title: "المطر",
    note: "مجموع المطر المتوقّع في الأيام السبعة القادمة",
    unit: "مم في ٧ أيام",
    bands: RAIN_BANDS,
    value: (c) => c.rainMm,
  },
  {
    key: "tmax",
    title: "الحرارة",
    note: "أعلى درجة حرارة متوقّعة خلال الأيام السبعة",
    unit: "°م",
    bands: [
      { min: -99, label: "أقلّ من ٣٠", fill: "#fff3c4", ink: "#4a2a00" },
      { min: 30, label: "٣٠–٣٥", fill: "#fdd98a", ink: "#4a2a00" },
      { min: 35, label: "٣٥–٣٨", fill: "#f9b35c", ink: "#4a2a00" },
      { min: 38, label: "٣٨–٤١", fill: "#ef8a3c", ink: "#ffffff" },
      { min: 41, label: "٤١–٤٤", fill: "#d9572b", ink: "#ffffff" },
      { min: 44, label: "٤٤ فأكثر", fill: "#a8321d", ink: "#ffffff" },
    ],
    value: (c) => c.tmaxC,
  },
  {
    key: "et0",
    title: "حاجة الجوّ",
    note: "ما يأخذه الجوّ من حقلٍ معشوشب في الأيام السبعة القادمة (البخر-نتح المرجعي، توقّعٌ لا المعدّل الذي تقرؤه حاسبة الماء)",
    unit: "مم في ٧ أيام",
    bands: [
      { min: -99, label: "أقلّ من ٢٥", fill: "#f6ecd9", ink: "#3d2508" },
      { min: 25, label: "٢٥–٣٥", fill: "#e8cfa2", ink: "#3d2508" },
      { min: 35, label: "٣٥–٤٥", fill: "#d6ad6c", ink: "#3d2508" },
      { min: 45, label: "٤٥–٥٥", fill: "#bb8641", ink: "#ffffff" },
      { min: 55, label: "٥٥–٦٥", fill: "#935f25", ink: "#ffffff" },
      { min: 65, label: "٦٥ فأكثر", fill: "#6a3f14", ink: "#ffffff" },
    ],
    value: (c) => c.et0Mm,
  },
  {
    key: "elev",
    title: "التضاريس",
    note: "ارتفاع الأرض عن سطح البحر في وسط كل مربّع",
    unit: "متر",
    bands: [
      { min: -99, label: "أقلّ من ٣٠٠", fill: "#d9ead3", ink: "#1f3318" },
      { min: 300, label: "٣٠٠–٥٠٠", fill: "#b5d59b", ink: "#1f3318" },
      { min: 500, label: "٥٠٠–٧٠٠", fill: "#e6dca0", ink: "#3a3010" },
      { min: 700, label: "٧٠٠–١٠٠٠", fill: "#d1b276", ink: "#3a3010" },
      { min: 1000, label: "١٠٠٠–١٥٠٠", fill: "#a97d4f", ink: "#ffffff" },
      { min: 1500, label: "١٥٠٠ فأكثر", fill: "#7a5536", ink: "#ffffff" },
    ],
    value: (c) => c.elevM,
  },
  SOIL_LAYER,
  LANDS_LAYER,
];

/** Each layer's words in English, band labels in the bands' order. */
const LAYER_EN: Record<LayerKey, { title: string; note: string; unit: string; bands?: string[] }> = {
  rain: {
    title: "Rain",
    note: "Total rain expected over the next seven days",
    unit: "mm in 7 days",
    bands: ["< 1", "1–5", "5–15", "15–30", "30–60", "60+"],
  },
  tmax: {
    title: "Heat",
    note: "Highest temperature expected over the seven days",
    unit: "°C",
    bands: ["< 30", "30–35", "35–38", "38–41", "41–44", "44+"],
  },
  et0: {
    title: "Air demand",
    note: "What the air draws from a grass field over the coming seven days (reference evapotranspiration; a forecast, not the long-term average the water calculator reads)",
    unit: "mm in 7 days",
    bands: ["< 25", "25–35", "35–45", "45–55", "55–65", "65+"],
  },
  elev: {
    title: "Terrain",
    note: "Ground height above sea level at the centre of each square",
    unit: "metres",
    bands: ["< 300", "300–500", "500–700", "700–1000", "1000–1500", "1500+"],
  },
  soil: { title: "Soil", note: "Most likely soil group in each square", unit: "WRB classification" },
  lands: {
    title: "Lands",
    note: "Verified lands listed on the platform, per square",
    unit: "lands",
    bands: ["1", "2–4", "5–9", "10+"],
  },
};

/** The layer with its words in the reader's language; colours and values unchanged. */
export function localizeLayer(layer: Layer, locale: Locale): Layer {
  if (locale !== "en") return layer;
  const en = LAYER_EN[layer.key];
  return {
    ...layer,
    title: en.title,
    note: en.note,
    unit: en.unit,
    bands: layer.bands.map((b, i) => ({
      ...b,
      label: layer.key === "soil" ? wrbShortEn(SOIL_CLASSES[i]) : (en.bands?.[i] ?? b.label),
    })),
  };
}

/** The layers worth a tab for this grid: any with a value, and the lands layer always. */
export const availableLayers = (grid: RainGrid): Layer[] =>
  LAYERS.filter((l) => l.always || grid.cells.some((c) => l.value(c) != null));

export const layerFor = (key: string | undefined): Layer =>
  LAYERS.find((l) => l.key === key) ?? LAYERS[0];

export function bandIn(bands: Band[], v: number): Band {
  let b = bands[0];
  for (const band of bands) if (v >= band.min) b = band;
  return b;
}

export const bandFor = (mm: number): Band => bandIn(RAIN_BANDS, mm);

export interface RainGrid {
  cells: GridCell[];
  /** First and last forecast day, ISO dates. */
  from: string;
  to: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The key of the cell a point falls in, or null outside the grid. Cells are
 * squares from the grid's corner, so this is two floors, not a search.
 */
export function cellKeyAt(lon: number, lat: number): string | null {
  if (lon < LON_MIN || lon >= LON_MAX || lat < LAT_MIN || lat >= LAT_MAX) return null;
  const cLon = LON_MIN + (Math.floor((lon - LON_MIN) / CELL_DEG) + 0.5) * CELL_DEG;
  const cLat = LAT_MIN + (Math.floor((lat - LAT_MIN) / CELL_DEG) + 0.5) * CELL_DEG;
  return cellKey(cLon, cLat);
}

/**
 * The most probable soil group (WRB name) under a point, from the national
 * map's cell — null with no coordinates, off the grid, or where the survey
 * returned nothing. A 160 km cell, so it is the region's soil, not the field's.
 */
export function soilAt(lon: number | string | null, lat: number | string | null): string | null {
  if (lon == null || lat == null) return null;
  const k = cellKeyAt(Number(lon), Number(lat));
  return k ? (SOIL_BY_CELL.get(k) ?? null) : null;
}

/** Lands per cell from their coordinates; a land with none, or off the grid, is not counted. */
export function countLands(points: { latitude: number | string | null; longitude: number | string | null }[]) {
  const n = new Map<string, number>();
  for (const p of points) {
    if (p.latitude == null || p.longitude == null) continue;
    const k = cellKeyAt(Number(p.longitude), Number(p.latitude));
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return n;
}

/**
 * Sums each cell's seven days. A cell whose forecast came back empty is
 * dropped, not painted dry — "no data" and "no rain" must not share a colour.
 * Elevation, when given, is matched by position in the same cell order; soil
 * and land counts by the cell's position on the map.
 */
export function sumGrid(
  cells: RainCell[],
  json: unknown,
  elevations: (number | null)[] | null = null,
  lands: Map<string, number> | null = null,
): RainGrid | null {
  const perCell = parseOpenMeteo(json);
  const out: GridCell[] = [];
  let from = "";
  let to = "";
  cells.forEach((c, i) => {
    const days = perCell[i] ?? [];
    if (days.length === 0) return;
    from ||= days[0].date;
    const last = days[days.length - 1].date;
    if (last > to) to = last;
    out.push({
      ...c,
      rainMm: r1(days.reduce((a, d) => a + d.rainMm, 0)),
      et0Mm: r1(days.reduce((a, d) => a + d.et0Mm, 0)),
      tmaxC: r1(Math.max(...days.map((d) => d.tmaxC))),
      elevM: elevations?.[i] ?? null,
      soil: SOIL_BY_CELL.get(cellKey(c.lon, c.lat)) ?? null,
      lands: lands?.get(cellKey(c.lon, c.lat)) ?? null,
    });
  });
  return out.length > 0 ? { cells: out, from, to } : null;
}

/**
 * Ground height for every cell, one call, cached a month — the ground does
 * not move. Null on any failure; the map then simply has no terrain tab.
 */
async function fetchElevations(cells: RainCell[]): Promise<(number | null)[] | null> {
  try {
    const p = new URLSearchParams({
      latitude: cells.map((c) => c.pLat).join(","),
      longitude: cells.map((c) => c.pLon).join(","),
    });
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?${p}`, {
      next: { revalidate: 2_592_000 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("elevation: Open-Meteo answered", res.status);
      return null;
    }
    const json = (await res.json()) as { elevation?: (number | null)[] };
    return Array.isArray(json.elevation) ? json.elevation : null;
  } catch (e) {
    console.error("elevation: request failed", e);
    return null;
  }
}

/**
 * Verified, listed lands per cell. Asked with the anon key. The lands table is
 * no longer readable by strangers (backlog 127 — a row carried its village and
 * coordinates), so public_land_cells() snaps each land to its cell's centre
 * inside the database and returns counts; no coordinate leaves it. Null on any
 * failure; the lands layer then says it has nothing.
 */
async function fetchLandCounts(): Promise<Map<string, number> | null> {
  try {
    const { data, error } = await createPublicClient().rpc("public_land_cells");
    if (error) {
      console.error("rain map lands:", error.message);
      return null;
    }
    const counts = new Map<string, number>();
    for (const c of (data ?? []) as { longitude: number | string; latitude: number | string; lands: number }[]) {
      const k = cellKeyAt(Number(c.longitude), Number(c.latitude));
      if (k) counts.set(k, (counts.get(k) ?? 0) + Number(c.lands));
    }
    return counts;
  } catch (e) {
    console.error("rain map lands: request failed", e);
    return null;
  }
}

/**
 * How long the rain page waits for Open-Meteo. Eight seconds ran out six times
 * in the last week of September on cold requests for the 90-cell grid and the
 * town table, and the page then showed no map at all; a visitor who opened the
 * rain page would rather wait a little more for it. Vercel's function limit is
 * well above this.
 */
const PAGE_WAIT_MS = 15_000;

/**
 * One forecast request for the whole grid, cached three hours like the
 * station table, and the elevation beside it. The land count only when asked
 * for: the homepage card shows rain alone and should not query the database.
 *
 * Open-Meteo counts each location as a call: 90-odd cells refreshed eight times a
 * day is under 800 of the free tier's 10,000 daily calls.
 */
export async function fetchRainGrid({ lands = false } = {}): Promise<RainGrid | null> {
  try {
    const [res, elev, landCounts] = await Promise.all([
      fetch(
        forecastUrl(RAIN_CELLS.map((c) => ({ latitude: c.pLat, longitude: c.pLon }))),
        // A slow upstream must not hold the homepage: after 8 s the card is
        // simply left out. The rain page (the one that asks for lands) is
        // where the visitor came for the map, so it waits longer.
        { next: { revalidate: 10_800 }, signal: AbortSignal.timeout(lands ? PAGE_WAIT_MS : 8_000) },
      ),
      fetchElevations(RAIN_CELLS),
      lands ? fetchLandCounts() : Promise.resolve(null),
    ]);
    if (!res.ok) {
      console.error("rain map: Open-Meteo answered", res.status);
      return null;
    }
    return sumGrid(RAIN_CELLS, await res.json(), elev, landCounts);
  } catch (e) {
    console.error("rain map: request failed", e);
    return null;
  }
}

/* ───────────────────────── الجدول اليومي ───────────────────────── */

/**
 * Towns for the day-by-day table: every state's main market town that a
 * farmer would name, east to west. Not the water calculator's stations —
 * those were chosen for their climate records; these for being where people
 * are, including Gedaref and Damazin, the rain-fed heartland the station list
 * leaves out.
 */
export const FORECAST_TOWNS: { name: string; lat: number; lon: number }[] = [
  { name: "بورتسودان", lat: 19.62, lon: 37.22 },
  { name: "كسلا", lat: 15.45, lon: 36.4 },
  { name: "القضارف", lat: 14.03, lon: 35.39 },
  { name: "الدمازين", lat: 11.79, lon: 34.36 },
  { name: "سنّار", lat: 13.55, lon: 33.63 },
  { name: "ود مدني", lat: 14.4, lon: 33.52 },
  { name: "الخرطوم", lat: 15.6, lon: 32.53 },
  { name: "عطبرة", lat: 17.7, lon: 33.98 },
  { name: "كوستي", lat: 13.16, lon: 32.66 },
  { name: "دنقلا", lat: 19.17, lon: 30.48 },
  { name: "الأبيض", lat: 13.18, lon: 30.22 },
  { name: "كادقلي", lat: 11.01, lon: 29.72 },
  { name: "الفاشر", lat: 13.63, lon: 25.35 },
  { name: "نيالا", lat: 12.05, lon: 24.88 },
  { name: "الجنينة", lat: 13.45, lon: 22.44 },
];

export interface TownDays {
  name: string;
  days: ForecastDay[];
}

export interface DailyTable {
  dates: string[];
  towns: TownDays[];
}

/** Lines towns up on the dates they share; a town with no days is dropped. */
export function toDailyTable(json: unknown): DailyTable | null {
  const per = parseOpenMeteo(json);
  const towns: TownDays[] = FORECAST_TOWNS.map((t, i) => ({
    name: t.name,
    days: per[i] ?? [],
  })).filter((t) => t.days.length > 0);
  if (towns.length === 0) return null;
  const dates = towns.reduce(
    (longest, t) => (t.days.length > longest.length ? t.days.map((d) => d.date) : longest),
    [] as string[],
  );
  return { dates, towns };
}

export async function fetchDailyTable(): Promise<DailyTable | null> {
  try {
    const res = await fetch(
      forecastUrl(FORECAST_TOWNS.map((t) => ({ latitude: t.lat, longitude: t.lon }))),
      { next: { revalidate: 10_800 }, signal: AbortSignal.timeout(PAGE_WAIT_MS) },
    );
    if (!res.ok) {
      console.error("daily table: Open-Meteo answered", res.status);
      return null;
    }
    return toDailyTable(await res.json());
  } catch (e) {
    console.error("daily table: request failed", e);
    return null;
  }
}
