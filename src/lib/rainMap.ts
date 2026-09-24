import { forecastUrl, parseOpenMeteo, type ForecastDay } from "./forecast";

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
 * THE BORDER
 *
 * Natural Earth 1:50m (public domain), simplified to about 5 km. It draws the
 * country's shape so the grid has something to sit in; it is not a statement
 * about any disputed line.
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
  [31.43, 22], [36.87, 22], [36.93, 21.59], [37.26, 21.11], [37.26, 21.04], [37.15, 21.1],
  [37.14, 20.98], [37.23, 20.56], [37.19, 20.12], [37.25, 19.58], [37.47, 18.82], [38.61, 18],
  [38.22, 17.56], [37.55, 17.32], [37.41, 17.06], [37.01, 17.06], [36.89, 16.62], [36.91, 16.3],
  [36.43, 15.13], [36.52, 14.26], [36.39, 13.63], [36.16, 13.09], [36.12, 12.76], [35.67, 12.62],
  [35.11, 11.82], [34.93, 10.86], [34.77, 10.75], [34.57, 10.88], [34.34, 10.66], [34.27, 10.53],
  [34.31, 10.19], [34.08, 9.46],
];

export const CELL_DEG = 1.5;
export const LON_MIN = 21.75;
export const LON_MAX = 38.75;
export const LAT_MIN = 8.5;
export const LAT_MAX = 22.5;

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
  /** Centre of the cell. */
  lon: number;
  lat: number;
  /**
   * True when the centre is inside the border. Only these carry a number;
   * the others are edge cells, drawn clipped to the border so the country has
   * no gaps, but their centre lies outside it and a figure there would be a
   * forecast for a neighbour.
   */
  labelled: boolean;
}

/**
 * Every cell that touches Sudan: its centre or one of its corners is inside.
 * Built once from the constants above, so the request and the drawing can
 * never disagree about which cells exist.
 */
export function buildCells(): RainCell[] {
  const cells: RainCell[] = [];
  const h = CELL_DEG / 2;
  for (let lat = LAT_MIN + h; lat < LAT_MAX; lat += CELL_DEG) {
    for (let lon = LON_MIN + h; lon < LON_MAX; lon += CELL_DEG) {
      const c: LonLat = [lon, lat];
      const labelled = insideSudan(c);
      const touches =
        labelled ||
        [[-h, -h], [h, -h], [-h, h], [h, h]].some(([dx, dy]) =>
          insideSudan([lon + dx, lat + dy]),
        );
      if (touches) cells.push({ lon: round2(lon), lat: round2(lat), labelled });
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
}

export type LayerKey = "rain" | "tmax" | "et0" | "elev";

export interface Layer {
  key: LayerKey;
  /** Tab label. */
  title: string;
  /** What the number in a cell is, in one line under the map. */
  note: string;
  unit: string;
  bands: Band[];
  value: (c: GridCell) => number | null;
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
    note: "ما يأخذه الجوّ من حقلٍ معشوشب في الأيام السبعة (البخر-نتح المرجعي)",
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
];

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
 * Sums each cell's seven days. A cell whose forecast came back empty is
 * dropped, not painted dry — "no data" and "no rain" must not share a colour.
 * Elevation, when given, is matched by position in the same cell order.
 */
export function sumGrid(
  cells: RainCell[],
  json: unknown,
  elevations: (number | null)[] | null = null,
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
      latitude: cells.map((c) => c.lat).join(","),
      longitude: cells.map((c) => c.lon).join(","),
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
 * One forecast request for the whole grid, cached three hours like the
 * station table, and the elevation beside it.
 *
 * Open-Meteo counts each location as a call: 85 cells refreshed eight times a
 * day is under 700 of the free tier's 10,000 daily calls.
 */
export async function fetchRainGrid(): Promise<RainGrid | null> {
  try {
    const [res, elev] = await Promise.all([
      fetch(
        forecastUrl(RAIN_CELLS.map((c) => ({ latitude: c.lat, longitude: c.lon }))),
        // A slow upstream must not hold the homepage: after 8 s the card is
        // simply left out.
        { next: { revalidate: 10_800 }, signal: AbortSignal.timeout(8_000) },
      ),
      fetchElevations(RAIN_CELLS),
    ]);
    if (!res.ok) {
      console.error("rain map: Open-Meteo answered", res.status);
      return null;
    }
    return sumGrid(RAIN_CELLS, await res.json(), elev);
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
      { next: { revalidate: 10_800 }, signal: AbortSignal.timeout(8_000) },
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
