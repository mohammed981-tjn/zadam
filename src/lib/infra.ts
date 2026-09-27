/** What scripts/build-sudan-infra.ts writes to data/sudan-infra.json. */

type Line = [number, number][];

export type InfraData = {
  source: string;
  roads: Line[];
  rail: Line[];
  power: { kv: number; line: Line }[];
  stations: {
    name: string;
    nameAr: string | null;
    mw: number | null;
    fuel: "hydro" | "thermal" | "biomass";
    fuelEn: string;
    state: string | null;
    lon: number;
    lat: number;
  }[];
  ports: { name: string; what: string; lon: number; lat: number }[];
  pipelines: { what: string; from: string | null; to: string | null; line: Line }[];
  basins: { name: string; nameAr: string; rings: Line[] }[];
  coal: { age: string; rings: Line[] }[];
};
