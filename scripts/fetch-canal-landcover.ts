/**
 * الغطاء الأرضي في ممرّ القناة القوسية — ESA WorldCover 2021 (10 م).
 *
 * Writes data/canal-landcover.json, which the corridor section of /arc-canal
 * draws. What it answers for the canal study: how much of the ground either
 * side of the line is already farmed, how much is bare, and where the line
 * runs into built-up land — the part of a canal's cost that is people's
 * houses rather than earth.
 *
 * HOW IT READS A 3° TILE WITHOUT DOWNLOADING IT
 *
 * WorldCover is published as cloud-optimised GeoTIFFs, one per 3° square,
 * with overviews. The corridor sits wholly inside tile N15E030, and geotiff
 * asks the server for only the byte ranges that cover the window at the
 * resolution requested — under a second, where the full tile is 1.3 GB of
 * pixels. The window is sampled at 0.001° (about 110 m), which is ten times
 * coarser than the product and still 400 samples to each 0.01° block drawn.
 *
 * The source is reachable from the development environment (unlike SoilGrids
 * and Overpass), so this runs by hand: `npx tsx scripts/fetch-canal-landcover.ts`.
 */
import { writeFileSync } from "node:fs";
import { fromUrl } from "geotiff";
import { ROUTE, distanceKm } from "../src/lib/arcCanal";
import raw from "../data/canal-map.json";

const TILE =
  "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N15E030_Map.tif";
const SAMPLE = 0.001;
const BLOCK = 0.01;
/** Half-width of the strip either side of the line that the shares describe. */
const BUFFER_KM = 2;
/** How far from each route point its own class is read. */
const POINT_KM = 1;
const KM_PER_LAT = 110.6;
const KM_PER_LON = 107.3; // at 15.5°N

const { south, west, north, east } = (raw as { bbox: { south: number; west: number; north: number; east: number } }).bbox;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Distance in km from a point to the route polyline. */
export function kmToRoute(lon: number, lat: number, route = ROUTE): number {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const ax = route[i - 1].lon * KM_PER_LON, ay = route[i - 1].lat * KM_PER_LAT;
    const bx = route[i].lon * KM_PER_LON, by = route[i].lat * KM_PER_LAT;
    const px = lon * KM_PER_LON, py = lat * KM_PER_LAT;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

export function mode(values: number[]): number | null {
  const n = new Map<number, number>();
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestN = 0;
  for (const [v, c] of n) if (c > bestN) [best, bestN] = [v, c];
  return best;
}

/**
 * Percent of known samples per class, commonest first. An array, not an
 * object: JavaScript orders integer-like keys numerically, so an object
 * keyed by class code forgets any order it was built in.
 */
export function shares(values: number[]): { cls: number; pct: number }[] {
  const n = new Map<number, number>();
  let total = 0;
  for (const v of values) {
    if (!v) continue;
    n.set(v, (n.get(v) ?? 0) + 1);
    total++;
  }
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cls, c]) => ({ cls, pct: Math.round((c / total) * 1000) / 10 }));
}

async function main() {
  const width = Math.round((east - west) / SAMPLE);
  const height = Math.round((north - south) / SAMPLE);
  const tiff = await fromUrl(TILE);
  const rasters = await tiff.readRasters({ bbox: [west, south, east, north], width, height, resampleMethod: "nearest" });
  const px = rasters[0] as Uint8Array;
  // Row 0 is the north edge.
  const at = (i: number, j: number) => px[i * width + j];
  const lonOf = (j: number) => west + (j + 0.5) * SAMPLE;
  const latOf = (i: number) => north - (i + 0.5) * SAMPLE;

  // Blocks, drawn as horizontal runs of one class so a mostly-bare plain is a
  // few hundred rectangles rather than five thousand.
  const per = Math.round(BLOCK / SAMPLE);
  const rows: { lat: number; runs: [number, number, number][] }[] = [];
  for (let bi = 0; bi * per < height; bi++) {
    const runs: [number, number, number][] = [];
    for (let bj = 0; bj * per < width; bj++) {
      const vals: number[] = [];
      for (let i = bi * per; i < Math.min(height, (bi + 1) * per); i++) {
        for (let j = bj * per; j < Math.min(width, (bj + 1) * per); j++) vals.push(at(i, j));
      }
      const cls = mode(vals) ?? 0;
      const last = runs[runs.length - 1];
      if (last && last[2] === cls) last[1]++;
      else runs.push([r4(west + bj * BLOCK), 1, cls]);
    }
    rows.push({ lat: r4(north - (bi + 1) * BLOCK), runs });
  }

  const all: number[] = [];
  const strip: number[] = [];
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const v = at(i, j);
      all.push(v);
      if (kmToRoute(lonOf(j), latOf(i)) <= BUFFER_KM) strip.push(v);
    }
  }

  // The class at each route point, then consecutive equal points merged into
  // runs by kilometre from Jebel Aulia — the same shape as the soil runs.
  const along: { cls: number | null; fromKm: number; toKm: number }[] = [];
  ROUTE.forEach((p, k) => {
    const i0 = Math.round((north - p.lat) / SAMPLE);
    const j0 = Math.round((p.lon - west) / SAMPLE);
    const ri = Math.round(POINT_KM / KM_PER_LAT / SAMPLE);
    const rj = Math.round(POINT_KM / KM_PER_LON / SAMPLE);
    const vals: number[] = [];
    for (let i = Math.max(0, i0 - ri); i <= Math.min(height - 1, i0 + ri); i++) {
      for (let j = Math.max(0, j0 - rj); j <= Math.min(width - 1, j0 + rj); j++) vals.push(at(i, j));
    }
    const cls = mode(vals);
    const km = Math.round(distanceKm(k) * 10) / 10;
    const last = along[along.length - 1];
    if (last && last.cls === cls) last.toKm = km;
    else along.push({ cls, fromKm: last ? last.toKm : km, toKm: km });
  });

  writeFileSync(
    "data/canal-landcover.json",
    JSON.stringify({
      fetchedAt: new Date().toISOString().slice(0, 10),
      source: "ESA WorldCover 10 m 2021 v200 (CC BY 4.0), tile N15E030, sampled at 0.001°",
      bbox: { south, west, north, east },
      block: BLOCK,
      bufferKm: BUFFER_KM,
      shares: { corridor: shares(all), strip: shares(strip) },
      along,
      rows,
    }) + "\n",
  );
  console.log("corridor", shares(all));
  console.log(`strip ±${BUFFER_KM} km`, shares(strip));
  console.log("along", along);
  console.log("rects", rows.reduce((a, r) => a + r.runs.length, 0));
}

if (process.argv[1]?.endsWith("fetch-canal-landcover.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
