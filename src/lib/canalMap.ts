import raw from "../../data/canal-map.json";

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

/**
 * Elevation averaged into coarser blocks for shading. The full 0.01° grid is
 * five and a half thousand cells — a quarter of a megabyte of SVG for a
 * background tint. Blocks of 2×2 keep the shape at a quarter of the weight.
 */
export function shadingBlocks(factor = 2) {
  const { nlat, nlon, step, elevation } = CORRIDOR.grid;
  const { south, west } = CORRIDOR.bbox;
  const out: { lon: number; lat: number; size: number; z: number }[] = [];
  for (let i = 0; i < nlat; i += factor) {
    for (let j = 0; j < nlon; j += factor) {
      let sum = 0;
      let n = 0;
      for (let di = 0; di < factor && i + di < nlat; di++) {
        for (let dj = 0; dj < factor && j + dj < nlon; dj++) {
          sum += elevation[(i + di) * nlon + j + dj];
          n++;
        }
      }
      out.push({ lon: west + j * step, lat: south + i * step, size: step * factor, z: sum / n });
    }
  }
  return out;
}

export function elevationRange() {
  const z = CORRIDOR.grid.elevation;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of z) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

/**
 * The soil groups SoilGrids can return here, in Arabic, with what each means
 * for a canal and for irrigation — the reason to map them at all. Colours
 * follow the usual WRB map convention loosely (vertisols dark, arenosols
 * sand-yellow) so a reader who has seen a soil map recognises them.
 */
export const WRB: Record<string, { ar: string; note: string; fill: string }> = {
  Vertisols: { ar: "طينية متشقّقة (فيرتيسول)", note: "تمسك الماء جيداً وتتشقّق حين تجفّ — تحتاج تبطيناً مرناً", fill: "#5b4a3a" },
  Arenosols: { ar: "رملية (أرينوسول)", note: "ترشيحٌ عالٍ — القناة فيها تحتاج تبطيناً، والريّ بالتنقيط", fill: "#e9d59a" },
  Leptosols: { ar: "ضحلة صخرية (ليبتوسول)", note: "حفرٌ صعب ورقعةٌ لا تصلح للزراعة", fill: "#9a9a9a" },
  Regosols: { ar: "مفكّكة غير متطوّرة (ريغوسول)", note: "خفيفة؛ تُزرع بعناية وتنجرف", fill: "#d8c7a4" },
  Cambisols: { ar: "حديثة التكوّن (كامبيسول)", note: "متوسطة، تصلح للزراعة المرويّة", fill: "#c49a6c" },
  Calcisols: { ar: "كلسية (كالسيسول)", note: "كربونات في القطاع؛ تُراقب القلوية", fill: "#e3d3c3" },
  Gypsisols: { ar: "جبسية (جيبسيسول)", note: "الجبس يذوب تحت القنوات — خطر هبوط", fill: "#f1ece0" },
  Fluvisols: { ar: "رسوبية نهرية (فلوفيسول)", note: "خصبة، على ضفاف المجاري", fill: "#7fa7a0" },
  Luvisols: { ar: "طين مغسول (لوفيسول)", note: "خصبة ومتوسطة النفاذية", fill: "#b5764a" },
  Lixisols: { ar: "مغسولة فقيرة (ليكسيسول)", note: "ضعيفة الخصوبة، تحتاج تسميداً", fill: "#cf9b6b" },
  Solonetz: { ar: "صودية (سولونتز)", note: "صوديوم عالٍ — أفسدت مشاريع ريّ في المنطقة", fill: "#8f6fa3" },
  Solonchaks: { ar: "ملحية (سولونتشاك)", note: "ملوحة — لا تُروى دون صرف", fill: "#c9b3d9" },
  Plinthosols: { ar: "حديدية (بلينثوسول)", note: "طبقة حديدية تتصلّب", fill: "#a0522d" },
};

export const wrbInfo = (name: string | null) =>
  name ? (WRB[name] ?? { ar: name, note: "", fill: "#cccccc" }) : null;

/**
 * A first sort of what each drainage crossing asks of the canal, by upstream
 * area. It is a size class to count and price from, not a design: the flow
 * that sets a culvert is a storm, and there is no rainfall-intensity record
 * for this plain to size one against.
 */
export function crossingClass(km2: number): string {
  if (km2 < 50) return "عبّارة أنبوبية";
  if (km2 < 300) return "عبّارة صندوقية";
  return "معبر سيول كبير";
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

export function crossingRows(): CrossingRow[] {
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
      label: "النيل الأبيض — مأخذ القناة من خزان جبل أولياء",
      km2: null,
      work: "منشأة المأخذ",
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
      label: w.name ? `وادٍ مرسوم — ${w.name}` : "مجرى مرسوم بلا اسم",
      km2,
      work: km2 != null ? crossingClass(km2) : "عبّارة (الحوض غير محسوب)",
    });
  }

  for (const d of drains) {
    if (used.has(d)) continue;
    rows.push({
      chainageKm: d.chainageKm,
      kind: "channel",
      label: "مجرى سيل غير مرسوم (مشتقّ من الارتفاعات)",
      km2: d.km2 ?? null,
      work: crossingClass(d.km2 ?? 0),
    });
  }

  for (const c of cs) {
    if (c.kind !== "road" && c.kind !== "rail") continue;
    rows.push({
      chainageKm: c.chainageKm,
      kind: c.kind,
      label:
        (c.kind === "rail" ? "سكّة حديد" : (ROAD_AR[c.sub ?? ""] ?? "طريق")) +
        (c.name ? ` — ${c.name}` : ""),
      km2: null,
      work: "جسر",
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
