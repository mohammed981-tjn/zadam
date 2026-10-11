import raw from "../../data/canal-map.json";
import landRaw from "../../data/canal-landcover.json";
import { tr, type Locale } from "./i18n";

/**
 * خريطة ممرّ القناة القوسية — الوديان والتربة وما يعبره المسار.
 *
 * The JSON is produced on a runner by scripts/fetch-canal-map.ts, because none
 * of its sources is reachable from the development environment. This module is
 * the only reader: it asserts the shape once and hands the page summaries.
 */

type LonLat = [number, number];

export interface CorridorCrossing {
  kind: "drainage" | "waterway" | "road" | "rail";
  sub: string | null;
  name: string | null;
  chainageKm: number;
  lon: number;
  lat: number;
  km2?: number;
}

interface RawCorridor {
  fetchedAt: string;
  mock: boolean;
  sources: { elevation: string; osm: string; soil: string };
  bbox: { south: number; west: number; north: number; east: number };
  grid: { step: number; nlat: number; nlon: number; elevation: number[] };
  drainage: { minKm2: number; segments: { a: LonLat; b: LonLat; km2: number }[] };
  osm: {
    waterways: { kind: string; name: string | null; coords: LonLat[] }[];
    roads: { kind: string; name: string | null; coords: LonLat[] }[];
    railways: { kind: string; name: string | null; coords: LonLat[] }[];
    places: { kind: string; name: string | null; lon: number; lat: number }[];
  };
  soil: { step: number; cells: { lon: number; lat: number; wrb: string | null; prob: number | null }[] };
  crossings: CorridorCrossing[];
  nearPlaces: { kind: string; name: string | null; lon: number; lat: number; km: number; chainageKm: number }[];
}

export const CORRIDOR = raw as unknown as RawCorridor;

export { WRB, wrbInfo } from "./soilClasses";

/**
 * A first sort of what each drainage crossing asks of the canal, by upstream
 * area. It is a size class to count and price from, not a design: the flow
 * that sets a culvert is a storm, and there is no rainfall-intensity record
 * for this plain to size one against.
 */
export function crossingClass(km2: number, locale: Locale = "ar"): string {
  if (km2 < 50) return tr(locale, "عبّارة أنبوبية", "Pipe culvert");
  if (km2 < 300) return tr(locale, "عبّارة صندوقية", "Box culvert");
  return tr(locale, "معبر سيول كبير", "Large flood crossing");
}

export const CROSSING_KIND_AR: Record<CorridorCrossing["kind"], string> = {
  drainage: "مجرى سيل",
  waterway: "مجرى مرسوم",
  road: "طريق",
  rail: "سكّة حديد",
};

export const ROAD_AR: Record<string, string> = {
  motorway: "طريق سريع",
  trunk: "طريق قومي",
  primary: "طريق رئيسي",
  secondary: "طريق ثانوي",
  tertiary: "طريق فرعي",
};

const ROAD_EN: Record<string, string> = {
  motorway: "Motorway",
  trunk: "National highway",
  primary: "Main road",
  secondary: "Secondary road",
  tertiary: "Minor road",
};

export interface CrossingRow {
  chainageKm: number;
  kind: "intake" | "channel" | "road" | "rail";
  label: string;
  km2: number | null;
  work: string;
}

/**
 * The crossing list as a designer reads it.
 *
 * Two sources describe the same channels: the drainage lines derived from the
 * ground and the waterways OpenStreetMap has drawn (with names like Wadi
 * Mansurab and Khor Barok). Where one of each falls within MERGE_KM of the
 * other it is one channel — it keeps the map's name and the ground's
 * catchment. The first kilometres are the intake from the Jebel Aulia
 * reservoir, not a channel to carry the canal over.
 */
const MERGE_KM = 1.5;

export function crossingRows(locale: Locale = "ar"): CrossingRow[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const cs = CORRIDOR.crossings;
  const drains = cs.filter((c) => c.kind === "drainage");
  const ways = cs.filter((c) => c.kind === "waterway");
  const used = new Set<CorridorCrossing>();
  const rows: CrossingRow[] = [];

  const isIntake = (c: CorridorCrossing) =>
    c.chainageKm < 5 && ((c.km2 ?? 0) > 2000 || (c.name ?? "").includes("النيل"));

  if (cs.some(isIntake)) {
    cs.filter(isIntake).forEach((c) => used.add(c));
    rows.push({
      chainageKm: Math.min(...cs.filter(isIntake).map((c) => c.chainageKm)),
      kind: "intake",
      label: t("النيل الأبيض — مأخذ القناة من خزان جبل أولياء", "White Nile — the canal's intake from the Jebel Aulia reservoir"),
      km2: null,
      work: t("منشأة المأخذ", "Intake structure"),
    });
  }

  for (const w of ways) {
    if (used.has(w)) continue;
    const twin = drains.find(
      (d) => !used.has(d) && Math.abs(d.chainageKm - w.chainageKm) <= MERGE_KM,
    );
    if (twin) used.add(twin);
    used.add(w);
    const km2 = twin?.km2 ?? null;
    rows.push({
      chainageKm: w.chainageKm,
      kind: "channel",
      label: w.name
        ? t(`وادٍ مرسوم — ${w.name}`, `Mapped wadi — ${w.name}`)
        : t("مجرى مرسوم بلا اسم", "Unnamed mapped channel"),
      km2,
      work: km2 != null ? crossingClass(km2, locale) : t("عبّارة (الحوض غير محسوب)", "Culvert (catchment not computed)"),
    });
  }

  for (const d of drains) {
    if (used.has(d)) continue;
    rows.push({
      chainageKm: d.chainageKm,
      kind: "channel",
      label: t("مجرى سيل غير مرسوم (مشتقّ من الارتفاعات)", "Unmapped flood channel (derived from the elevations)"),
      km2: d.km2 ?? null,
      work: crossingClass(d.km2 ?? 0, locale),
    });
  }

  for (const c of cs) {
    if (c.kind !== "road" && c.kind !== "rail") continue;
    rows.push({
      chainageKm: c.chainageKm,
      kind: c.kind,
      label:
        (locale === "en"
          ? c.kind === "rail"
            ? "Railway"
            : (ROAD_EN[c.sub ?? ""] ?? "Road")
          : c.kind === "rail"
            ? "سكّة حديد"
            : (ROAD_AR[c.sub ?? ""] ?? "طريق")) + (c.name ? ` — ${c.name}` : ""),
      km2: null,
      work: t("جسر", "Bridge"),
    });
  }

  return rows.sort((a, b) => a.chainageKm - b.chainageKm);
}

/**
 * The soil the line itself runs through, as stretches: each route sample is
 * placed in its 0.1° soil cell and consecutive samples of the same group are
 * joined. This is what decides where the canal needs lining.
 */
export function soilAlongRoute(
  route: { lat: number; lon: number }[],
  chainage: (i: number) => number,
) {
  const half = CORRIDOR.soil.step / 2;
  const at = (lat: number, lon: number) =>
    CORRIDOR.soil.cells.find(
      (c) => Math.abs(c.lat - lat) <= half && Math.abs(c.lon - lon) <= half,
    )?.wrb ?? null;
  const runs: { wrb: string | null; fromKm: number; toKm: number }[] = [];
  route.forEach((p, i) => {
    const wrb = at(p.lat, p.lon);
    const km = chainage(i);
    const last = runs[runs.length - 1];
    if (last && last.wrb === wrb) last.toKm = km;
    else runs.push({ wrb, fromKm: last ? last.toKm : km, toKm: km });
  });
  return runs;
}

/* ───────────────────────── الغطاء الأرضي ───────────────────────── */

export interface LandCover {
  fetchedAt: string;
  source: string;
  block: number;
  bufferKm: number;
  /** Percent per class, commonest first. */
  shares: { corridor: { cls: number; pct: number }[]; strip: { cls: number; pct: number }[] };
  along: { cls: number | null; fromKm: number; toKm: number }[];
  /** Each class but bare ground (the base) as smooth regions: polygons of rings in [lon, lat]. */
  regions: { cls: number; shapes: [number, number][][][] }[];
  /** The Nile and the reservoir, and the built-up land, as outlines: polygons of rings in [lon, lat]. */
  water: [number, number][][][];
  built: [number, number][][][];
}

export const LAND_COVER = landRaw as unknown as LandCover;

/**
 * ESA WorldCover's classes in Arabic, with what each means for a canal:
 * land already farmed is land with a claim on it; built-up land is where the
 * line costs houses; bare land is what the canal would make new. Colours are
 * softened from the product's own (whose red and magenta shout over the
 * route) but keep their sense: green for growing, sand for bare, rose-grey
 * for buildings, blue for water.
 */
export const WORLDCOVER: Record<number, { ar: string; note: string; en: string; noteEn: string; fill: string }> = {
  10: { ar: "أشجار", note: "غابات وأحزمة شجرية", en: "Trees", noteEn: "Woodland and tree belts", fill: "#4f8a4b" },
  20: { ar: "شجيرات", note: "", en: "Shrubs", noteEn: "", fill: "#cdb26a" },
  30: { ar: "حشائش", note: "مراعٍ موسمية", en: "Grassland", noteEn: "Seasonal grazing", fill: "#e3d98f" },
  40: { ar: "أرض مزروعة", note: "مزروعةٌ اليوم — لها أهلٌ وحقوق", en: "Cropland", noteEn: "Farmed today — it has people and rights", fill: "#9fcb74" },
  50: { ar: "مبانٍ", note: "حيث يمرّ الخطّ على بيوتٍ ومنشآت", en: "Built-up", noteEn: "Where the line passes houses and structures", fill: "#c9a6a0" },
  60: { ar: "أرض جرداء", note: "ما تجعله القناة أرضاً جديدة", en: "Bare ground", noteEn: "What the canal would turn into new land", fill: "#e6e0d2" },
  80: { ar: "ماء دائم", note: "النيل والخزّان", en: "Permanent water", noteEn: "The Nile and the reservoir", fill: "#3f86c6" },
  90: { ar: "أرض رطبة", note: "", en: "Wetland", noteEn: "", fill: "#7fb7b0" },
};

export const coverInfo = (cls: number | null | string) =>
  cls == null
    ? null
    : (WORLDCOVER[Number(cls)] ?? { ar: `صنف ${cls}`, note: "", en: `Class ${cls}`, noteEn: "", fill: "#cccccc" });
