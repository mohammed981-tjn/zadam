/**
 * تربة السودان على مربّعات خريطة المطر — الصنف الأرجح في كل مربّع.
 *
 * Writes data/sudan-soil.json, which the national map's soil layer reads.
 * Runs on a GitHub runner (.github/workflows/sudan-soil.yml) because SoilGrids
 * is not reachable from the environment this repository is developed in.
 *
 * WHY SEVERAL POINTS A CELL
 *
 * SoilGrids answers for a 250 m pixel; a map cell is 160 km across. One point
 * at the centre would paint a whole cell with whatever lies under one field —
 * a wadi bed, a rock outcrop. So each cell is read at up to five points (its
 * forecast point and four more 0.45° out, those that fall inside Sudan), each
 * returning its three most probable groups, and the group with the largest
 * summed probability wins. `share` is how much of the summed probability that
 * group took: a low share is a mixed cell, and the page says so.
 *
 * It is still a sketch at country scale — the clay plain of Gezira and
 * Gedaref, the qoz sands of Kordofan, the rock of the Red Sea hills — and not
 * a soil survey of anyone's field.
 *
 * HOW IT READS THEM
 *
 * The first two runs asked SoilGrids' query service one point at a time. It
 * allows about five queries a minute and answers 429 beyond that, and the
 * second run read 55 cells in 220 minutes — and those minutes are billed
 * against a private repository's Actions allowance (the owner, 25 September:
 * «استهلاك في الأكشن عالي جداً»).
 *
 * So this reads the map itself instead: SoilGrids publishes the most probable
 * WRB group as a raster (wrb/MostProbable.vrt, 250 m) on a plain file server,
 * and GDAL reads just the blocks under each point over HTTP range requests —
 * no query budget, every point in one process, minutes not hours.
 *
 * What changes: the raster holds the single most probable group per pixel,
 * not the top three with probabilities, so a cell's vote counts points, and
 * `share` is the share of its points that fell on the winning group.
 *
 * The raster's codes are named from its own category table — nothing is
 * assumed about which number means which group — and before anything is
 * written, the cells the query service already answered are read again from
 * the raster and must mostly agree. If they do not, the names are wrong and
 * the run stops without touching the file.
 *
 * MOCK=1 writes a file of the right shape without the network.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RAIN_CELLS, insideSudan, type LonLat } from "../src/lib/rainMap";

const MOCK = process.env.MOCK === "1";
const OFFSET = 0.45;
const r2 = (n: number) => Math.round(n * 100) / 100;

const RASTER = "/vsicurl/https://files.isric.org/soilgrids/latest/data/wrb/MostProbable.vrt";
const QML = "https://files.isric.org/soilgrids/latest/data/wrb/MostProbable.qml";

/** Code → group name, from the raster's category table or its published QGIS style. */
async function groupNames(): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const info = JSON.parse(execFileSync("gdalinfo", ["-json", "-nofl", RASTER], { maxBuffer: 1 << 26 }).toString()) as {
    bands?: { categories?: string[] }[];
  };
  (info.bands?.[0]?.categories ?? []).forEach((n, i) => n && names.set(i, n));
  if (names.size) return names;
  // No table in the raster: the style file ISRIC publishes beside it labels
  // each value, e.g. <paletteEntry value="4" label="Arenosols" …/>.
  const qml = await (await fetch(QML)).text();
  for (const m of qml.matchAll(/value="(\d+)"[^>]*label="([A-Za-z]+)"/g)) names.set(+m[1], m[2]);
  for (const m of qml.matchAll(/label="([A-Za-z]+)"[^>]*value="(\d+)"/g)) names.set(+m[2], m[1]);
  return names;
}

/** The most probable group code at every point, in one GDAL process. */
function codesAt(points: LonLat[]): (number | null)[] {
  const out = execFileSync("gdallocationinfo", ["-wgs84", "-valonly", RASTER], {
    input: points.map(([lon, lat]) => `${lon} ${lat}`).join("\n") + "\n",
    maxBuffer: 1 << 26,
    env: { ...process.env, GDAL_HTTP_MAX_RETRY: "5", GDAL_HTTP_RETRY_DELAY: "3", VSI_CACHE: "TRUE" },
  }).toString();
  const lines = out.split("\n").slice(0, points.length);
  // 255 is the raster's no-data (open water, outside the land mask).
  return lines.map((l) => (l.trim() === "" || +l === 255 ? null : +l));
}

export function samplePoints(c: { pLon: number; pLat: number }): LonLat[] {
  const pts: LonLat[] = [[c.pLon, c.pLat]];
  for (const [dx, dy] of [[OFFSET, 0], [-OFFSET, 0], [0, OFFSET], [0, -OFFSET]]) {
    const q: LonLat = [r2(c.pLon + dx), r2(c.pLat + dy)];
    if (insideSudan(q)) pts.push(q);
  }
  return pts;
}

type Row = { lon: number; lat: number; wrb: string | null; share: number | null; points: number };
const FILE = "data/sudan-soil.json";
const key = (r: { lon: number; lat: number }) => `${r.lon},${r.lat}`;

function save(rows: Row[]) {
  writeFileSync(
    FILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString().slice(0, 10),
        mock: MOCK,
        source: "ISRIC SoilGrids v2.0, WRB classes, 250 m (CC BY 4.0)",
        cells: rows,
      },
      null,
      1,
    ) + "\n",
  );
}

type Vote = { wrb: string | null; share: number | null; points: number };

function vote(names: (string | null)[]): Vote {
  const tally = new Map<string, number>();
  for (const n of names) if (n) tally.set(n, (tally.get(n) ?? 0) + 1);
  const read = [...tally.values()].reduce((a, v) => a + v, 0);
  const best = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  return { wrb: best?.[0] ?? null, share: best ? Math.round((best[1] / read) * 100) : null, points: read };
}

async function main() {
  if (MOCK) {
    save(
      RAIN_CELLS.map((c) => ({
        lon: c.lon,
        lat: c.lat,
        wrb: c.lat > 16 ? "Leptosols" : c.lon > 33 ? "Vertisols" : "Arenosols",
        share: 100,
        points: 1,
      })),
    );
    return;
  }

  const names = await groupNames();
  console.log(`${names.size} groups named:`, Object.fromEntries(names));
  if (names.size < 20) throw new Error("the raster's groups could not be named; nothing written");

  const cellPoints = RAIN_CELLS.map((c) => samplePoints(c));
  const flat = cellPoints.flat();
  console.log(`reading ${flat.length} points for ${RAIN_CELLS.length} cells…`);
  const t0 = Date.now();
  const codes = codesAt(flat);
  console.log(`read in ${Math.round((Date.now() - t0) / 1000)} s`);

  let i = 0;
  const rows: Row[] = RAIN_CELLS.map((c, k) => {
    const got = cellPoints[k].map(() => codes[i++]);
    return { lon: c.lon, lat: c.lat, ...vote(got.map((v) => (v === null ? null : names.get(v) ?? null))) };
  });

  // The check: cells the query service answered must mostly agree with the
  // raster. It gives the top three with probabilities and this the top one,
  // so a mixed cell may differ; wrongly named codes would differ nearly
  // everywhere.
  if (existsSync(FILE)) {
    const before = (JSON.parse(readFileSync(FILE, "utf8")) as { cells: Row[] }).cells.filter((r) => r.wrb);
    const now = new Map(rows.map((r) => [key(r), r.wrb]));
    const same = before.filter((r) => now.get(key(r)) === r.wrb).length;
    console.log(`agreement with the earlier query-service cells: ${same}/${before.length}`);
    if (before.length >= 10 && same / before.length < 0.6) {
      throw new Error("the raster disagrees with the query service; nothing written");
    }
  }

  save(rows);
  console.log(`\nwrote ${rows.filter((c) => c.wrb).length} of ${rows.length} cells`);
}

if (process.argv[1]?.endsWith("fetch-sudan-soil.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
