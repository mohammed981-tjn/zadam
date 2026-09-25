/**
 * الأساس الجغرافيّ لخريطة السودان: الجيران والنيل وروافده والبحيرات والولايات.
 *
 * Writes src/lib/sudanBase.json from Natural Earth (public domain) — the
 * ground every layer of the national map is drawn on, so a reader can find
 * the river they live by and the state they live in before reading a colour.
 *
 * Clipped to the map's frame and simplified to about 2 km, which is finer
 * than a phone screen shows at this scale and keeps the file small enough to
 * ship in every page that draws the map.
 *
 * Natural Earth's states are the eighteen of 2013 less West Kordofan, which
 * it still counts inside the two others; the map says the lines are
 * approximate. The Halaib triangle is drawn by the Sudan border itself
 * (src/lib/rainMap.ts), over Egypt's fill.
 *
 * Run by hand when the frame changes: `npx tsx scripts/build-sudan-base.ts`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Pt = [number, number];

/** The map frame, a little wider than the country so its neighbours show. */
export const FRAME = { west: 21, south: 8, east: 39.5, north: 24 };
const TOL = 0.02;
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

async function load(name: string) {
  const dir = join(tmpdir(), "natural-earth");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.geojson`);
  if (!existsSync(file)) {
    const res = await fetch(`${NE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[];
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Douglas–Peucker. */
export function simplify(pts: Pt[], tol = TOL): Pt[] {
  if (pts.length < 3) return pts;
  let idx = -1;
  let max = 0;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    // A closed ring starts and ends on the same point: there is no chord,
    // so distance is measured from that point instead.
    const d =
      len < 1e-9
        ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1])
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) [max, idx] = [d, i];
  }
  if (max <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Sutherland–Hodgman against the frame; a ring wholly outside comes back empty. */
export function clipRing(ring: Pt[], f = FRAME): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= f.west, (a, b) => { const t = (f.west - a[0]) / (b[0] - a[0]); return [f.west, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= f.east, (a, b) => { const t = (f.east - a[0]) / (b[0] - a[0]); return [f.east, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= f.south, (a, b) => { const t = (f.south - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), f.south]; }],
    [(p) => p[1] <= f.north, (a, b) => { const t = (f.north - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), f.north]; }],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (out.length === 0) return [];
  }
  return out;
}

/** A line cut into the runs that lie inside the frame. */
export function clipLine(line: Pt[], f = FRAME): Pt[][] {
  const inside = (p: Pt) => p[0] >= f.west && p[0] <= f.east && p[1] >= f.south && p[1] <= f.north;
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of line) {
    if (inside(p)) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}

const tidy = (pts: Pt[]) => simplify(pts).map(([x, y]) => [r2(x), r2(y)] as Pt);

function polygonsOf(g: { type: string; coordinates: unknown }): Pt[][] {
  if (g.type === "Polygon") return (g.coordinates as Pt[][]).slice(0, 1);
  if (g.type === "MultiPolygon") return (g.coordinates as Pt[][][]).map((p) => p[0]);
  return [];
}
function linesOf(g: { type: string; coordinates: unknown }): Pt[][] {
  if (g.type === "LineString") return [g.coordinates as Pt[]];
  if (g.type === "MultiLineString") return g.coordinates as Pt[][];
  return [];
}

const RIVERS: Record<string, { ar: string; main: boolean }> = {
  Nile: { ar: "النيل", main: true },
  "El Bahr el Abyad": { ar: "النيل الأبيض", main: true },
  "El Bahr el Azraq": { ar: "النيل الأزرق", main: true },
  Abay: { ar: "النيل الأزرق", main: true },
  Atbara: { ar: "نهر عطبرة", main: false },
  Setit: { ar: "ستيت", main: false },
  Sobat: { ar: "السوباط", main: false },
  "Bahr el Jebel": { ar: "بحر الجبل", main: false },
  Tekeze: { ar: "تكازي", main: false },
};

const NEIGHBOURS: Record<string, string> = {
  EGY: "مصر",
  LBY: "ليبيا",
  TCD: "تشاد",
  CAF: "أفريقيا الوسطى",
  SDS: "جنوب السودان",
  ETH: "إثيوبيا",
  ERI: "إريتريا",
  SAU: "السعودية",
};

async function main() {
  const [countries, rivers, lakes, states] = await Promise.all([
    load("ne_50m_admin_0_countries"),
    load("ne_10m_rivers_lake_centerlines"),
    load("ne_10m_lakes"),
    load("ne_10m_admin_1_states_provinces"),
  ]);

  const neighbours = countries.features
    .filter((f) => String(f.properties.ADM0_A3) in NEIGHBOURS)
    .flatMap((f) =>
      polygonsOf(f.geometry)
        .map((ring) => clipRing(ring))
        .filter((r) => r.length > 2)
        .map((r) => ({ code: String(f.properties.ADM0_A3), ring: tidy(r) })),
    )
    .filter((n) => n.ring.length > 2);

  const riverLines = rivers.features
    .filter((f) => String(f.properties.name) in RIVERS)
    .flatMap((f) => {
      const info = RIVERS[String(f.properties.name)];
      return linesOf(f.geometry)
        .flatMap((l) => clipLine(l))
        .map((l) => ({ name: info.ar, main: info.main, line: tidy(l) }));
    });

  const lakeRings = lakes.features
    .flatMap((f) =>
      polygonsOf(f.geometry)
        .map((r) => clipRing(r))
        .filter((r) => r.length > 2)
        .map((r) => ({ name: String(f.properties.name_ar ?? f.properties.name), ring: tidy(r) })),
    )
    .filter((l) => l.ring.length > 2);

  const stateRings = states.features
    .filter((f) => f.properties.adm0_a3 === "SDN")
    .flatMap((f) =>
      polygonsOf(f.geometry).map((r) => ({
        name: String(f.properties.name_ar ?? f.properties.name).replace(/^ولاية\s*/, "").replace(/،.*$/, ""),
        ring: tidy(r),
      })),
    );

  const out = {
    source: "Natural Earth 1:10m and 1:50m (public domain)",
    frame: FRAME,
    neighbours,
    rivers: riverLines,
    lakes: lakeRings,
    states: stateRings,
  };
  writeFileSync("src/lib/sudanBase.json", JSON.stringify(out) + "\n");
  console.log(
    `neighbours ${neighbours.length} rings · rivers ${riverLines.length} lines · lakes ${lakeRings.length} · states ${stateRings.length}`,
  );
  console.log(`${Math.round(JSON.stringify(out).length / 1024)} KB`);
}

if (process.argv[1]?.endsWith("build-sudan-base.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
