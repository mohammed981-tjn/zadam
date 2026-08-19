import raw from "../../data/canal-ground.json";
import { textureClass } from "@/lib/canalDesign";

/**
 * قراءة المسح الأرضي — تربة القناة وإشعاعها الشمسي.
 *
 * The JSON is fetched on a runner (scripts/fetch-canal-ground.ts) because
 * neither source is reachable from the development environment. This module is
 * the only thing that reads it, so the shape is asserted once, here, and the
 * page works with a summary rather than with SoilGrids' nesting.
 *
 * WHY THE FIRST POINT HAS NO SOIL
 *
 * Sample zero sits at 15.24°N, 32.51°E — on the Jebel Aulia reservoir. There is
 * no soil profile under open water, and SoilGrids correctly returns nothing.
 * Dropping it is not cleaning the data, it is reading it: the alignment starts
 * at the water, which is the whole point of starting there.
 */

interface RawPoint {
  index: number;
  lat: number;
  lon: number;
  elevation: number;
  chainageKm: number;
  properties: Record<string, Record<string, number | null>>;
}

interface RawGround {
  fetchedAt: string;
  sources: { soil: string; irradiance: string };
  soil: RawPoint[];
  irradiance: Record<string, number> | null;
}

const ground = raw as RawGround;

/** Layer thicknesses, cm — SoilGrids' standard depths over the top metre. */
const DEPTH_WEIGHT: Record<string, number> = {
  "0-5cm": 5,
  "5-15cm": 10,
  "15-30cm": 15,
  "30-60cm": 30,
  "60-100cm": 40,
};

/** Thickness-weighted mean of one property over the top metre. */
function profileMean(
  point: RawPoint,
  property: string,
): number | null {
  const layers = point.properties[property];
  if (!layers) return null;

  let sum = 0;
  let weight = 0;
  for (const [depth, thickness] of Object.entries(DEPTH_WEIGHT)) {
    const v = layers[depth];
    if (v === null || v === undefined) continue;
    sum += v * thickness;
    weight += thickness;
  }
  return weight === 0 ? null : sum / weight;
}

export interface SoilPoint {
  chainageKm: number;
  elevation: number;
  clay: number;
  sand: number;
  silt: number;
  ph: number;
  cec: number;
  soc: number;
  texture: string;
}

/** Every sample that actually returned a profile, in chainage order. */
export const SOIL_POINTS: SoilPoint[] = ground.soil
  .map((p) => {
    const clay = profileMean(p, "clay");
    const sand = profileMean(p, "sand");
    const silt = profileMean(p, "silt");
    const ph = profileMean(p, "phh2o");
    const cec = profileMean(p, "cec");
    const soc = profileMean(p, "soc");
    if (clay === null || sand === null || silt === null || ph === null) {
      return null;
    }
    return {
      chainageKm: p.chainageKm,
      elevation: p.elevation,
      clay,
      sand,
      silt,
      ph,
      cec: cec ?? 0,
      soc: soc ?? 0,
      texture: textureClass(clay, sand),
    };
  })
  .filter((p): p is SoilPoint => p !== null);

/** How many samples the survey asked for, including the one in the water. */
export const SOIL_SAMPLES_REQUESTED = ground.soil.length;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const SOIL_SUMMARY = {
  clay: mean(SOIL_POINTS.map((p) => p.clay)),
  sand: mean(SOIL_POINTS.map((p) => p.sand)),
  silt: mean(SOIL_POINTS.map((p) => p.silt)),
  ph: mean(SOIL_POINTS.map((p) => p.ph)),
  cec: mean(SOIL_POINTS.map((p) => p.cec)),
  phMin: Math.min(...SOIL_POINTS.map((p) => p.ph)),
  phMax: Math.max(...SOIL_POINTS.map((p) => p.ph)),
  clayMin: Math.min(...SOIL_POINTS.map((p) => p.clay)),
  clayMax: Math.max(...SOIL_POINTS.map((p) => p.clay)),
};

/**
 * The dominant texture along the route.
 *
 * Taken as the class of the mean composition rather than the most frequent
 * class, because seepage is driven by the whole length's average behaviour and
 * a single outlying sample should move the answer a little, not flip it.
 */
export const ROUTE_TEXTURE = textureClass(SOIL_SUMMARY.clay, SOIL_SUMMARY.sand);

/** Annual mean daily irradiance, kWh/m²/day, or null if the fetch missed it. */
export const IRRADIANCE_ANNUAL: number | null =
  ground.irradiance?.ANN ?? null;

export const GROUND_FETCHED_AT = ground.fetchedAt;
export const GROUND_SOURCES = ground.sources;
