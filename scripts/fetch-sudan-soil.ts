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
 * SoilGrids asks for about five queries a minute, so ~400 points take about an
 * hour and a half. MOCK=1 writes a file of the right shape without the network.
 */
import { writeFileSync } from "node:fs";
import { RAIN_CELLS, insideSudan, type LonLat } from "../src/lib/rainMap";

const MOCK = process.env.MOCK === "1";
const OFFSET = 0.45;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (n: number) => Math.round(n * 100) / 100;

async function getJson(url: string, attempts = 4): Promise<unknown> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "sudagri/1.0" },
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      if (i === attempts) throw e;
      // A 429 is a per-minute budget; a full minute is what clears it.
      const wait = 65_000 * i;
      console.error(`  retry ${i}/${attempts - 1} after ${wait / 1000}s — ${e}`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

/** The three most probable groups at one point, as [name, probability %]. */
async function classesAt([lon, lat]: LonLat): Promise<[string, number][]> {
  if (MOCK) {
    return [[lat > 16 ? "Leptosols" : lon > 33 ? "Vertisols" : "Arenosols", 50]];
  }
  const json = (await getJson(
    `https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lon}&lat=${lat}&number_classes=3`,
  )) as { wrb_class_probability?: [string, number][] };
  return json.wrb_class_probability ?? [];
}

export function samplePoints(c: { pLon: number; pLat: number }): LonLat[] {
  const pts: LonLat[] = [[c.pLon, c.pLat]];
  for (const [dx, dy] of [[OFFSET, 0], [-OFFSET, 0], [0, OFFSET], [0, -OFFSET]]) {
    const q: LonLat = [r2(c.pLon + dx), r2(c.pLat + dy)];
    if (insideSudan(q)) pts.push(q);
  }
  return pts;
}

async function main() {
  const out: { lon: number; lat: number; wrb: string | null; share: number | null; points: number }[] = [];
  for (const [k, c] of RAIN_CELLS.entries()) {
    const votes = new Map<string, number>();
    let points = 0;
    for (const p of samplePoints(c)) {
      try {
        for (const [name, prob] of await classesAt(p)) {
          votes.set(name, (votes.get(name) ?? 0) + prob);
        }
        points++;
      } catch (e) {
        // One failed point narrows the vote; it does not fail the map.
        console.error(`  ${p[1]},${p[0]}: ${e}`);
      }
      if (!MOCK) await sleep(13_000);
    }
    const total = [...votes.values()].reduce((a, v) => a + v, 0);
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      lon: c.lon,
      lat: c.lat,
      wrb: best?.[0] ?? null,
      share: best && total > 0 ? Math.round((best[1] / total) * 100) : null,
      points,
    });
    console.log(`  ${k + 1}/${RAIN_CELLS.length} ${c.lat},${c.lon}: ${best?.[0] ?? "—"} (${points} نقاط)`);
  }
  writeFileSync(
    "data/sudan-soil.json",
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString().slice(0, 10),
        mock: MOCK,
        source: "ISRIC SoilGrids v2.0, WRB classes, 250 m (CC BY 4.0)",
        cells: out,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`\nwrote ${out.filter((c) => c.wrb).length} of ${out.length} cells`);
}

if (process.argv[1]?.endsWith("fetch-sudan-soil.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
