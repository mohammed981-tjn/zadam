import { CROPS, type CropCoefficients } from "@/lib/agronomy";
import { SALT } from "@/lib/landCrops";

/**
 * فحوص الماء والتربة لأرضٍ (البند ١٦٤)، وقراءتها على المقاييس المنشورة لا بحكمنا.
 *
 * The numbers a person types are the data. What they mean is read here from FAO Irrigation and Drainage
 * Paper 29 (Ayers & Westcot 1985), https://www.fao.org/4/t0234e/T0234E03.htm: Table 1 for water
 * (ECw below 0.7 dS/m no restriction, 0.7–3.0 slight to moderate, above 3.0 severe; pH normal 6.5–8.4)
 * and Table 4 for the soil (ECe at which a crop still gives 100% yield, already held in `SALT`).
 * A reading is never stored: it is made from the numbers every time, so it cannot disagree with them.
 */

export type TestKind = "water" | "soil";

export interface LandTest {
  id: string;
  land_id: string;
  kind: TestKind;
  tested_on: string;
  lab: string | null;
  ec_dsm: number | null;
  ph: number | null;
  sar: number | null;
  organic_matter_pct: number | null;
  note: string | null;
  created_at: string;
}

export const FAO29_TABLE1 = "https://www.fao.org/4/t0234e/T0234E03.htm";

export type WaterSalinity = "none" | "moderate" | "severe";

/** FAO-29 Table 1, «Salinity (affects crop water availability)». */
export function waterSalinity(ecw: number): WaterSalinity {
  if (ecw < 0.7) return "none";
  if (ecw <= 3.0) return "moderate";
  return "severe";
}

/** FAO-29 Table 1, the normal range of pH. */
export function phNormal(ph: number): boolean {
  return ph >= 6.5 && ph <= 8.4;
}

/** The crops in the platform's list that still give 100% yield at this soil salinity (FAO-29 Table 4). */
export function cropsAtSoilSalinity(ece: number): { full: CropCoefficients[]; classOnly: number } {
  const full: CropCoefficients[] = [];
  let classOnly = 0;
  for (const crop of CROPS) {
    const s = SALT[crop.key];
    if (!s) continue;
    if (s.ece === undefined) classOnly++;
    else if (s.ece >= ece) full.push(crop);
  }
  return { full, classOnly };
}

export interface TestInput {
  kind: string;
  testedOn: string;
  ec: number | null;
  ph: number | null;
  sar: number | null;
  organic: number | null;
}

export type TestProblem = "kind" | "date" | "empty" | "range" | "organic_water";

/** The same limits the table enforces, said before the round trip. */
export function testProblem(i: TestInput, today: Date = new Date()): TestProblem | null {
  if (i.kind !== "water" && i.kind !== "soil") return "kind";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(i.testedOn) ? new Date(`${i.testedOn}T00:00:00Z`) : null;
  const ceiling = new Date(today.getTime() + 2 * 86_400_000);
  if (!d || Number.isNaN(d.getTime()) || d < new Date("2000-01-01T00:00:00Z") || d > ceiling) return "date";
  const values = [i.ec, i.ph, i.sar, i.organic];
  if (values.every((v) => v === null)) return "empty";
  const within = (v: number | null, lo: number, hi: number) => v === null || (Number.isFinite(v) && v >= lo && v <= hi);
  if (!within(i.ec, 0, 100) || !within(i.ph, 0, 14) || !within(i.sar, 0, 100) || !within(i.organic, 0, 100)) return "range";
  if (i.organic !== null && i.kind === "water") return "organic_water";
  return null;
}
