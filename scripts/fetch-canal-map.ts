/**
 * خريطة ممرّ القناة القوسية: الوديان، والتربة، وما يعبره المسار.
 *
 * The canal study already has the ground *along the line* — forty-one SRTM
 * heights and eleven soil profiles. What it did not have is the ground *across*
 * the line: where the water that falls on the Omdurman plain runs, which of
 * those runs the canal has to carry itself over, what soil lies either side of
 * it, and which roads and villages it passes. Those decide the cross-drainage
 * works, the bridges and the command area, which is most of what a canal costs
 * beyond its own earthworks.
 *
 * WHAT IS FETCHED
 *
 *  1. Ground height on a 0.015° grid (≈1.65 km) over the corridor, from
 *     Open-Meteo's elevation service (Copernicus DEM, 90 m).
 *  2. From that grid, the drainage network: pits filled (priority-flood), each
 *     cell drained to its steepest neighbour (D8), and the upstream area
 *     counted. A cell draining more than DRAIN_MIN_KM2 is a khor or wadi line.
 *     This is the map of where water *would* run — it finds the channels that
 *     no one has drawn, which on this plain is most of them.
 *  3. The waterways, roads, railways and villages that OpenStreetMap does have,
 *     from the Overpass API.
 *  4. Soil group (WRB, most probable class) from SoilGrids on a 0.1° grid.
 *
 * Then every place the route crosses a drainage line, a mapped waterway, a road
 * or a railway, with its chainage — the list a designer prices culverts and
 * bridges from — and the villages within VILLAGE_KM of the line.
 *
 * WHY THIS RUNS ON A RUNNER
 *
 * None of the three services is reachable from the environment this
 * repository is developed in. A GitHub Actions runner has the network; the
 * repository gets one JSON file, and the commit is the deliverable. Set
 * MOCK=1 to run the whole pipeline on synthetic ground, which is how the
 * processing is tested where the network is not.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { ROUTE, distanceKm } from "../src/lib/arcCanal";

export const BBOX = { south: 15.1, west: 32.05, north: 15.92, east: 32.7 };
/**
 * 0.015° (≈1.65 km): 2,420 points. Open-Meteo counts every coordinate as a
 * call, with a ceiling of 600 a minute and 5,000 an hour; the first run, at
 * 0.01° and 5,478 points, was throttled and then refused a third of the way
 * through the last thousand.
 */
const STEP = 0.015;
const SOIL_STEP = 0.1;

/** Upstream area above which a cell is drawn as a channel, km². */
const DRAIN_MIN_KM2 = 25;
/** How far from the line a village counts as "on the route", km. */
const VILLAGE_KM = 3;

const KM_PER_LAT = 110.6;
const KM_PER_LON = 107.3; // at 15.5°N
const CELL_KM2 = STEP * KM_PER_LAT * STEP * KM_PER_LON;

const MOCK = process.env.MOCK === "1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LonLat = [number, number];
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

async function getJson(url: string, init?: RequestInit, attempts = 4): Promise<unknown> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { accept: "application/json", "user-agent": "sudagri/1.0", ...init?.headers },
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await res.json();
    } catch (e) {
      if (i === attempts) throw e;
      // A 429 is a per-minute budget; waiting a full minute is what clears it.
      const wait = 65_000 * i;
      console.error(`  retry ${i}/${attempts - 1} after ${wait / 1000}s — ${e}`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

/* ───────────────────────── 1. الارتفاعات ───────────────────────── */

const NLAT = Math.round((BBOX.north - BBOX.south) / STEP) + 1;
const NLON = Math.round((BBOX.east - BBOX.west) / STEP) + 1;
const latAt = (i: number) => r4(BBOX.south + i * STEP);
const lonAt = (j: number) => r4(BBOX.west + j * STEP);

async function fetchElevation(): Promise<number[]> {
  const pts: LonLat[] = [];
  for (let i = 0; i < NLAT; i++) for (let j = 0; j < NLON; j++) pts.push([lonAt(j), latAt(i)]);

  if (MOCK) {
    // A plain tilting gently north-east towards the Nile, with two shallow
    // valleys, so the drainage code has something to find.
    return pts.map(([lon, lat]) => {
      const tilt = 440 - (lat - 15.1) * 40 - (lon - 32.05) * 60;
      const v1 = -12 * Math.exp(-(((lat - 15.45) * 30) ** 2));
      const v2 = -8 * Math.exp(-(((lon - 32.3) * 25) ** 2));
      return Math.round(tilt + v1 + v2);
    });
  }

  const out: number[] = [];
  for (let k = 0; k < pts.length; k += 100) {
    const chunk = pts.slice(k, k + 100);
    const p = new URLSearchParams({
      latitude: chunk.map((q) => q[1]).join(","),
      longitude: chunk.map((q) => q[0]).join(","),
    });
    const json = (await getJson(`https://api.open-meteo.com/v1/elevation?${p}`)) as {
      elevation: number[];
    };
    if (json.elevation?.length !== chunk.length) {
      throw new Error(`elevation: asked ${chunk.length}, got ${json.elevation?.length}`);
    }
    out.push(...json.elevation);
    console.log(`  elevation ${k + chunk.length}/${pts.length}`);
    // 100 coordinates are 100 calls: twelve seconds apart is 500 a minute,
    // under the 600 ceiling with room for a retry.
    await sleep(12_000);
  }
  return out;
}

/* ───────────────────────── 2. شبكة التصريف ───────────────────────── */

const idx = (i: number, j: number) => i * NLON + j;
const NEIGHBOURS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

/**
 * Priority-flood pit filling (Barnes et al. 2014), with a tiny gradient so a
 * filled flat still drains towards its outlet instead of standing still.
 * Water leaves the grid at its edges — the Nile is off the east side.
 */
export function fillPits(z: number[]): number[] {
  const filled = z.slice();
  const done = new Uint8Array(z.length);
  // Binary heap on elevation.
  const heap: number[] = [];
  const less = (a: number, b: number) => filled[heap[a]] < filled[heap[b]];
  const push = (c: number) => {
    heap.push(c);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(k, p)) break;
      [heap[k], heap[p]] = [heap[p], heap[k]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === k) break;
        [heap[k], heap[m]] = [heap[m], heap[k]];
        k = m;
      }
    }
    return top;
  };

  for (let i = 0; i < NLAT; i++) {
    for (let j = 0; j < NLON; j++) {
      if (i === 0 || j === 0 || i === NLAT - 1 || j === NLON - 1) {
        done[idx(i, j)] = 1;
        push(idx(i, j));
      }
    }
  }
  while (heap.length > 0) {
    const c = pop();
    const ci = Math.floor(c / NLON);
    const cj = c % NLON;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= NLAT || nj >= NLON) continue;
      const n = idx(ni, nj);
      if (done[n]) continue;
      done[n] = 1;
      filled[n] = Math.max(filled[n], filled[c] + 1e-3);
      push(n);
    }
  }
  return filled;
}

/** Steepest-descent neighbour for every cell, or -1 at the grid edge. */
export function flowDirections(z: number[]): Int32Array {
  const down = new Int32Array(z.length).fill(-1);
  for (let i = 0; i < NLAT; i++) {
    for (let j = 0; j < NLON; j++) {
      const c = idx(i, j);
      let best = -1;
      let bestSlope = 0;
      for (const [di, dj] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NLAT || nj >= NLON) continue;
        const n = idx(ni, nj);
        const dist = Math.hypot(di * KM_PER_LAT, dj * KM_PER_LON) * STEP;
        const slope = (z[c] - z[n]) / dist;
        if (slope > bestSlope) {
          bestSlope = slope;
          best = n;
        }
      }
      down[c] = best;
    }
  }
  return down;
}

/** Upstream cell count for every cell, the cell itself included. */
export function accumulation(z: number[], down: Int32Array): Float64Array {
  const acc = new Float64Array(z.length).fill(1);
  const order = Array.from(z.keys()).sort((a, b) => z[b] - z[a]);
  for (const c of order) if (down[c] >= 0) acc[down[c]] += acc[c];
  return acc;
}

interface DrainSegment {
  a: LonLat;
  b: LonLat;
  /** Upstream area at the downstream end, km². */
  km2: number;
}

function drainage(z: number[]) {
  const filled = fillPits(z);
  const down = flowDirections(filled);
  const acc = accumulation(filled, down);
  const segments: DrainSegment[] = [];
  for (let c = 0; c < z.length; c++) {
    const km2 = acc[c] * CELL_KM2;
    if (km2 < DRAIN_MIN_KM2 || down[c] < 0) continue;
    const d = down[c];
    segments.push({
      a: [lonAt(c % NLON), latAt(Math.floor(c / NLON))],
      b: [lonAt(d % NLON), latAt(Math.floor(d / NLON))],
      km2: Math.round(acc[d] * CELL_KM2),
    });
  }
  return segments;
}

/* ───────────────────────── 3. OpenStreetMap ───────────────────────── */

interface OsmLine {
  kind: string;
  name: string | null;
  coords: LonLat[];
}
interface OsmPlace {
  kind: string;
  name: string | null;
  lon: number;
  lat: number;
}

/** Douglas–Peucker in degrees; OSM ways are far denser than a map needs. */
function simplify(pts: LonLat[], eps = 0.0008): LonLat[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let md = 0;
  let mi = 0;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > md) {
      md = d;
      mi = i;
    }
  }
  if (md <= eps) return [a, b];
  return simplify(pts.slice(0, mi + 1), eps).slice(0, -1).concat(simplify(pts.slice(mi), eps));
}

async function fetchOsm() {
  if (MOCK) {
    return {
      waterways: [{ kind: "wadi", name: "خور تجريبي", coords: [[32.2, 15.6], [32.3, 15.5]] as LonLat[] }],
      roads: [{ kind: "primary", name: "طريق تجريبي", coords: [[32.1, 15.5], [32.6, 15.5]] as LonLat[] }],
      railways: [] as OsmLine[],
      places: [{ kind: "village", name: "قرية تجريبية", lon: 32.24, lat: 15.52 }],
    };
  }
  const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const query = `[out:json][timeout:180];
(
  way["waterway"~"^(river|stream|wadi|canal|drain|ditch)$"](${bb});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bb});
  way["railway"="rail"](${bb});
  node["place"~"^(city|town|village|hamlet)$"](${bb});
);
out geom tags;`;
  const json = (await getJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }).toString(),
  })) as {
    elements: {
      type: string;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
    }[];
  };

  const name = (t?: Record<string, string>) => t?.["name:ar"] ?? t?.name ?? null;
  const line = (e: (typeof json.elements)[number], kind: string): OsmLine => ({
    kind,
    name: name(e.tags),
    coords: simplify((e.geometry ?? []).map((g) => [r4(g.lon), r4(g.lat)] as LonLat)),
  });

  const waterways: OsmLine[] = [];
  const roads: OsmLine[] = [];
  const railways: OsmLine[] = [];
  const places: OsmPlace[] = [];
  for (const e of json.elements) {
    const t = e.tags ?? {};
    if (e.type === "node" && t.place) {
      places.push({ kind: t.place, name: name(t), lon: r4(e.lon!), lat: r4(e.lat!) });
    } else if (e.type === "way" && t.waterway) {
      waterways.push(line(e, t.waterway));
    } else if (e.type === "way" && t.highway) {
      roads.push(line(e, t.highway));
    } else if (e.type === "way" && t.railway) {
      railways.push(line(e, "rail"));
    }
  }
  return { waterways, roads, railways, places };
}

/* ───────────────────────── 4. التربة ───────────────────────── */

interface SoilCell {
  lon: number;
  lat: number;
  wrb: string | null;
  /** Probability SoilGrids gives its most probable class, %. */
  prob: number | null;
}

async function fetchSoilGrid(): Promise<SoilCell[]> {
  const cells: SoilCell[] = [];
  for (let lat = BBOX.south + SOIL_STEP / 2; lat < BBOX.north; lat += SOIL_STEP) {
    for (let lon = BBOX.west + SOIL_STEP / 2; lon < BBOX.east; lon += SOIL_STEP) {
      cells.push({ lon: r4(lon), lat: r4(lat), wrb: null, prob: null });
    }
  }
  if (MOCK) {
    return cells.map((c, k) => ({ ...c, wrb: ["Vertisols", "Arenosols", "Leptosols"][k % 3], prob: 40 }));
  }
  for (const [k, c] of cells.entries()) {
    try {
      const json = (await getJson(
        `https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${c.lon}&lat=${c.lat}&number_classes=1`,
      )) as { wrb_class_name?: string; wrb_class_probability?: [string, number][] };
      c.wrb = json.wrb_class_name ?? null;
      c.prob = json.wrb_class_probability?.[0]?.[1] ?? null;
    } catch (e) {
      // One failed point is a gap on the map, not a failed survey.
      console.error(`  soil ${c.lat},${c.lon}: ${e}`);
    }
    console.log(`  soil ${k + 1}/${cells.length}: ${c.wrb}`);
    await sleep(13_000); // SoilGrids allows about five queries a minute.
  }
  return cells;
}

/* ───────────────────────── 5. ما يعبره المسار ───────────────────────── */

const ROUTE_LL: LonLat[] = ROUTE.map((p) => [p.lon, p.lat]);

/** Segment intersection parameter along the first segment, or null. */
function cross(p: LonLat, p2: LonLat, q: LonLat, q2: LonLat): number | null {
  const r = [p2[0] - p[0], p2[1] - p[1]];
  const s = [q2[0] - q[0], q2[1] - q[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-15) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
  const u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

interface Crossing {
  kind: "drainage" | "waterway" | "road" | "rail";
  sub: string | null;
  name: string | null;
  chainageKm: number;
  lon: number;
  lat: number;
  /** Upstream area for a drainage crossing, km². */
  km2?: number;
}

function crossingsOf(
  lines: { coords: LonLat[]; kind: string; name: string | null; km2?: number }[],
  kind: Crossing["kind"],
): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < ROUTE_LL.length - 1; i++) {
    const a = ROUTE_LL[i];
    const b = ROUTE_LL[i + 1];
    const d0 = distanceKm(i);
    const d1 = distanceKm(i + 1);
    for (const l of lines) {
      for (let k = 0; k < l.coords.length - 1; k++) {
        const t = cross(a, b, l.coords[k], l.coords[k + 1]);
        if (t === null) continue;
        out.push({
          kind,
          sub: l.kind,
          name: l.name,
          chainageKm: Math.round((d0 + t * (d1 - d0)) * 10) / 10,
          lon: r4(a[0] + t * (b[0] - a[0])),
          lat: r4(a[1] + t * (b[1] - a[1])),
          ...(l.km2 !== undefined ? { km2: l.km2 } : {}),
        });
      }
    }
  }
  return out.sort((x, y) => x.chainageKm - y.chainageKm);
}

/**
 * Drainage segments cross the route many times where a channel runs beside
 * it; one crossing per channel is what a culvert count needs. Crossings
 * within 1 km of each other merge, keeping the largest catchment.
 */
function mergeDrainage(cs: Crossing[]): Crossing[] {
  const out: Crossing[] = [];
  for (const c of cs) {
    const last = out[out.length - 1];
    if (last && c.chainageKm - last.chainageKm < 1) {
      if ((c.km2 ?? 0) > (last.km2 ?? 0)) out[out.length - 1] = c;
    } else out.push(c);
  }
  return out;
}

function kmFromRoute(lon: number, lat: number): { km: number; chainageKm: number } {
  let best = { km: Infinity, chainageKm: 0 };
  ROUTE_LL.forEach(([rl, rt], i) => {
    const km = Math.hypot((lon - rl) * KM_PER_LON, (lat - rt) * KM_PER_LAT);
    if (km < best.km) best = { km, chainageKm: distanceKm(i) };
  });
  return best;
}

/* ───────────────────────── التشغيل ───────────────────────── */

async function main() {
  console.log(`grid ${NLAT}×${NLON} = ${NLAT * NLON} cells${MOCK ? " (MOCK)" : ""}`);
  const elevation = await fetchElevation();
  const segments = drainage(elevation);
  console.log(`drainage segments ≥ ${DRAIN_MIN_KM2} km²: ${segments.length}`);

  let osm: Awaited<ReturnType<typeof fetchOsm>> | null = null;
  try {
    osm = await fetchOsm();
    console.log(
      `osm: ${osm.waterways.length} waterways, ${osm.roads.length} roads, ${osm.railways.length} railways, ${osm.places.length} places`,
    );
  } catch (e) {
    console.error(`osm failed: ${e}`);
  }

  const soil = await fetchSoilGrid();

  const drainageLines = segments.map((s) => ({ coords: [s.a, s.b], kind: "derived", name: null, km2: s.km2 }));
  const crossings = [
    ...mergeDrainage(crossingsOf(drainageLines, "drainage")),
    ...(osm ? crossingsOf(osm.waterways, "waterway") : []),
    ...(osm ? crossingsOf(osm.roads, "road") : []),
    ...(osm ? crossingsOf(osm.railways, "rail") : []),
  ].sort((x, y) => x.chainageKm - y.chainageKm);

  const nearPlaces = (osm?.places ?? [])
    .map((p) => ({ ...p, ...kmFromRoute(p.lon, p.lat) }))
    .filter((p) => p.km <= VILLAGE_KM)
    .map((p) => ({ ...p, km: Math.round(p.km * 10) / 10, chainageKm: Math.round(p.chainageKm * 10) / 10 }))
    .sort((a, b) => a.chainageKm - b.chainageKm);

  const out = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    mock: MOCK,
    sources: {
      elevation: "Open-Meteo elevation API — Copernicus DEM GLO-90",
      osm: "© OpenStreetMap contributors (ODbL), via Overpass API",
      soil: "ISRIC SoilGrids v2.0, WRB most probable class, 250 m (CC BY 4.0)",
    },
    bbox: BBOX,
    grid: { step: STEP, nlat: NLAT, nlon: NLON, elevation },
    drainage: { minKm2: DRAIN_MIN_KM2, segments },
    osm: osm ?? { waterways: [], roads: [], railways: [], places: [] },
    soil: { step: SOIL_STEP, cells: soil },
    crossings,
    nearPlaces,
  };

  mkdirSync("data", { recursive: true });
  const path = MOCK ? "data/canal-map.mock.json" : "data/canal-map.json";
  writeFileSync(path, JSON.stringify(out));
  console.log(`wrote ${path}: ${crossings.length} crossings, ${nearPlaces.length} places near the line`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
