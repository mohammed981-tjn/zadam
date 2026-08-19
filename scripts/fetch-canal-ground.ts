/**
 * يجلب ما يمكن قياسه عن أرض القناة من مصادر مفتوحة.
 *
 * The dossier listed a soil survey, a seepage estimate and a power source as
 * "unknown". Two of those three are not unknown — they are unfetched. Soil
 * texture at 250 m and solar irradiance at the corridor are published, free,
 * and enough to answer the questions that actually matter here: will this
 * ground hold water, will it take irrigation, and what would it cost to lift
 * the water with sunlight instead of a grid that does not have the capacity.
 *
 * WHY THIS RUNS ON A RUNNER
 *
 * rest.isric.org and power.larc.nasa.gov are not reachable from the
 * environment this repository is developed in. A GitHub Actions runner has the
 * network; the repository gets a small JSON file it can read. The commit is the
 * deliverable — nothing here writes to the database, so a bad fetch is a diff
 * to read rather than a table to repair.
 *
 * SoilGrids rate-limits hard (roughly five queries a minute), so the sampling
 * is eleven points along the ninety-four kilometres rather than all forty-one.
 * Soil varies over kilometres here, not hundreds of metres; eleven is the
 * resolution the question deserves and the API will grant.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { ROUTE, ROUTE_CLIMATE, distanceKm } from "../src/lib/arcCanal";

/** Every fourth sample, plus the terminus. */
const SAMPLE_INDICES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40];

/**
 * The properties that decide the two questions.
 *
 * clay/sand/silt give the texture class, which drives both seepage rate and
 * irrigation method. phh2o and cec decide whether the soil is chemically
 * workable — a pH above about 8.5 with low CEC is the signature of the sodic
 * ground that has ruined irrigation schemes in this region before. soc is the
 * organic carbon it starts with; bdod the bulk density, which is what tells
 * you whether roots and water can get through it at all.
 */
const PROPERTIES = ["clay", "sand", "silt", "phh2o", "cec", "soc", "bdod"];
const DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, attempts = 4): Promise<unknown> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "sudagri/1.0" },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (e) {
      if (i === attempts) throw e;
      const wait = 15_000 * i;
      console.error(`  retry ${i}/${attempts - 1} after ${wait / 1000}s — ${e}`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

interface SoilLayer {
  name: string;
  unit_measure: { d_factor: number; mapped_units: string; target_units: string };
  depths: { label: string; values: { mean: number | null } }[];
}

/** SoilGrids returns integers scaled by d_factor; divide to get real units. */
function unscale(layer: SoilLayer, depth: string): number | null {
  const d = layer.depths.find((x) => x.label === depth);
  const raw = d?.values?.mean;
  if (raw === null || raw === undefined) return null;
  return raw / layer.unit_measure.d_factor;
}

async function soilAt(lat: number, lon: number) {
  const qs = [
    `lon=${lon}`,
    `lat=${lat}`,
    ...PROPERTIES.map((p) => `property=${p}`),
    ...DEPTHS.map((d) => `depth=${d}`),
    "value=mean",
  ].join("&");

  const json = (await getJson(
    `https://rest.isric.org/soilgrids/v2.0/properties/query?${qs}`,
  )) as { properties?: { layers?: SoilLayer[] } };

  const layers = json.properties?.layers ?? [];
  const out: Record<string, Record<string, number | null>> = {};
  for (const layer of layers) {
    out[layer.name] = Object.fromEntries(
      DEPTHS.map((d) => [d, unscale(layer, d)]),
    );
  }
  return out;
}

/**
 * Solar irradiance at the corridor, for sizing the pumping against sunlight.
 *
 * ALLSKY_SFC_SW_DWN is what actually reaches a horizontal surface after cloud,
 * which is the number a panel sees — CLRSKY would flatter the answer.
 */
async function solar(lat: number, lon: number) {
  const url =
    "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    `?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const json = (await getJson(url)) as {
    properties?: { parameter?: Record<string, Record<string, number>> };
  };
  return json.properties?.parameter?.ALLSKY_SFC_SW_DWN ?? null;
}

async function main() {
  const soil: unknown[] = [];

  for (const index of SAMPLE_INDICES) {
    const p = ROUTE[index];
    console.error(`soil at sample ${index} (${p.lat}, ${p.lon})…`);
    soil.push({
      index,
      lat: p.lat,
      lon: p.lon,
      elevation: p.elevation,
      chainageKm: Number(distanceKm(index).toFixed(1)),
      properties: await soilAt(p.lat, p.lon),
    });
    // Well inside the published rate limit. The job is not in a hurry.
    await sleep(14_000);
  }

  console.error("solar irradiance at the corridor…");
  const irradiance = await solar(ROUTE_CLIMATE.latitude, ROUTE_CLIMATE.longitude);

  mkdirSync("data", { recursive: true });
  writeFileSync(
    "data/canal-ground.json",
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString().slice(0, 10),
        sources: {
          soil: "ISRIC SoilGrids v2.0, 250 m (CC BY 4.0)",
          irradiance: "NASA POWER climatology, ALLSKY_SFC_SW_DWN (kWh/m²/day)",
        },
        soil,
        irradiance,
      },
      null,
      2,
    ) + "\n",
  );
  console.error(`wrote data/canal-ground.json — ${soil.length} soil points`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
