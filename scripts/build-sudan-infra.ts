/**
 * البنية التحتية والطاقة في السودان — من قاعدة المسح الجيولوجي الأمريكي.
 *
 * Reads the raw GeoJSON that .github/workflows/sudan-minerals.yml clips from
 * the USGS "Compilation of Geospatial Data (GIS) for the Mineral Industries
 * and Related Infrastructure of Africa" (2021, doi:10.5066/P97EQWXP, public
 * domain) and writes data/sudan-infra.json — what the maps draw:
 *
 *  - roads: trunk and primary roads in Sudan (OpenStreetMap, via USGS);
 *    secondary roads and link roads are left out, a phone cannot draw 7000
 *    segments legibly;
 *  - rail: the railway in Sudan (OpenStreetMap, via USGS);
 *  - power lines with their voltage, and the power stations in Sudan with
 *    capacity and fuel (African Energy data, via USGS);
 *  - the two ports, the oil pipelines, the three oil-and-gas basins the USGS
 *    world assessment names, and the one coal-bearing area inside Sudan.
 *
 * Lines are rounded to 0.01° (about 1 km): finer than the map can draw.
 * Nothing here is a claim about today — the compilation predates the war,
 * and the pages say so.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { InfraData } from "../src/lib/infra";

type Coords = number[] | Coords[];
type Feature = { properties: Record<string, string | number | null>; geometry: { type: string; coordinates: Coords } | null };
type Line = [number, number][];

const RAW = "data/minerals-raw";
const read = (layer: string): Feature[] =>
  (JSON.parse(readFileSync(`${RAW}/${layer}.geojson`, "utf8")) as { features: Feature[] }).features.filter((f) => f.geometry);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every line (or ring) of a geometry, rounded, with repeated points dropped. */
function lines(g: Feature["geometry"]): Line[] {
  if (!g) return [];
  // An empty part (left by clipping) has no depth; -1 skips it.
  const depth = (c: Coords): number =>
    c.length === 0 ? -1 : typeof c[0] === "number" ? 0 : 1 + depth(c[0] as Coords);
  const out: Line[] = [];
  const walk = (c: Coords) => {
    if (depth(c) === 1) {
      const l: Line = [];
      for (const p of c as number[][]) {
        const q: [number, number] = [r2(p[0]), r2(p[1])];
        const last = l[l.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) l.push(q);
      }
      if (l.length > 1) out.push(l);
    } else if (depth(c) > 1) (c as Coords[]).forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() && !/^<null>$/i.test(v.trim()) ? v.trim() : null);

const FUEL: [RegExp, InfraData["stations"][number]["fuel"]][] = [
  [/Hydro/, "hydro"],
  [/Biomass/, "biomass"],
  [/.*/, "thermal"],
];

const STATE: Record<string, string> = {
  Northern: "الشمالية",
  Nile: "نهر النيل",
  "Red Sea": "البحر الأحمر",
  Kassala: "كسلا",
  "Al Qadarif": "القضارف",
  Gedaref: "القضارف",
  Khartoum: "الخرطوم",
  "Al Jazirah": "الجزيرة",
  Sennar: "سنّار",
  "Blue Nile": "النيل الأزرق",
  "White Nile": "النيل الأبيض",
  "North Kordofan": "شمال كردفان",
  "South Kordofan": "جنوب كردفان",
  "West Kordofan": "غرب كردفان",
  "North Darfur": "شمال دارفور",
  "South Darfur": "جنوب دارفور",
  "East Darfur": "شرق دارفور",
  "West Darfur": "غرب دارفور",
};

/** Stations whose Arabic name is certain; the rest keep the source's name. */
const STATION_AR: [RegExp, string][] = [
  [/^Merowe Hydro/, "سدّ مروي"],
  [/^Roseires Hydro/, "خزّان الروصيرص"],
  [/^Upper Atbara and Setit/, "مجمّع سدّي أعالي عطبرة وستيت"],
  [/^Jebel Aulia Hydro/, "خزّان جبل أولياء"],
  [/^Sennar Hydro/, "خزّان سنّار"],
  [/^El Girba Hydro/, "خزّان خشم القربة"],
  [/^Kosti/, "محطة كوستي"],
  [/^Kenana/, "مصنع سكر كنانة"],
  [/^White Nile Sugar/, "مصنع سكر النيل الأبيض"],
];

const BASIN_AR: Record<string, string> = {
  "Red Sea Basin": "حوض البحر الأحمر",
  Sud: "حوض السدّ",
  "East African Rift": "الأخدود الأفريقي الشرقي",
};


export function buildInfra(): InfraData {
  const roads = read("AFR_Infra_Transport_Road")
    .filter((f) => f.properties.Country === "Sudan" && /^Road \((Trunk|Primary)\)$/.test(String(f.properties.FeatureTyp)))
    .flatMap((f) => lines(f.geometry));

  const rail = read("AFR_Infra_Transport_Rail")
    .filter((f) => f.properties.Country === "Sudan")
    .flatMap((f) => lines(f.geometry));

  // No country on these; the map clips them to the border.
  const power = read("AFR_Infra_Power_Transmission").flatMap((f) =>
    lines(f.geometry).map((line) => ({ kv: Math.round(Number(f.properties.DsgAttr01) / 1000), line })),
  );

  const stations = read("AFR_Infra_Power_Stations")
    .filter((f) => f.properties.Country === "Sudan")
    .map((f) => {
      const p = f.properties;
      const name = clean(p.FeatureNam) ?? "";
      const fuelEn = clean(p.DsgAttr04) ?? "";
      const [lon, lat] = f.geometry!.coordinates as number[];
      return {
        name,
        nameAr: STATION_AR.find(([re]) => re.test(name))?.[1] ?? null,
        mw: p.DsgAttr02 == null ? null : Number(p.DsgAttr02),
        fuel: FUEL.find(([re]) => re.test(fuelEn))![1],
        fuelEn,
        state: STATE[String(p.ADM1)] ?? clean(p.ADM1),
        lon: r2(lon),
        lat: r2(lat),
      };
    })
    .sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0));

  const ports = read("AFR_Infra_Transport_Ports")
    .filter((f) => f.properties.Country === "Sudan")
    .map((f) => {
      const [lon, lat] = f.geometry!.coordinates as number[];
      const t = String(f.properties.FeatureTyp);
      return {
        name: clean(f.properties.FeatureNam) ?? "",
        what: /Oil/.test(t) ? "محطة نفط وغاز" : "ميناء بضائع سائبة",
        lon: r2(lon),
        lat: r2(lat),
      };
    });

  const pipelines = read("AFR_Infra_OG_Pipelines").flatMap((f) =>
    lines(f.geometry).map((line) => ({
      what: f.properties.DsgAttr01 === "Oil" ? "نفط خام" : "مشتقّات مكرّرة",
      from: clean(f.properties.DsgAttr02),
      to: clean(f.properties.DsgAttr03),
      line,
    })),
  );

  const basins = read("AFR_OG_Provinces_Conventional").map((f) => {
    const name = clean(f.properties.FeatureNam) ?? "";
    return { name, nameAr: BASIN_AR[name] ?? name, rings: lines(f.geometry) };
  });

  // Only the coal area inside Sudan (the Upper Cretaceous one); the other four
  // in the box lie in Ethiopia and Egypt.
  const coal = read("AFR_Mineral_Resources_Coal")
    .filter((f) => f.properties.DsgAttr02 === "Upper Cretaceous")
    .map((f) => ({ age: "العصر الطباشيري الأعلى", rings: lines(f.geometry) }));

  return {
    source:
      "USGS, Compilation of Geospatial Data (GIS) for the Mineral Industries and Related Infrastructure of Africa, 2021 (doi:10.5066/P97EQWXP), public domain; roads and rail from OpenStreetMap, power from African Energy, via USGS",
    roads,
    rail,
    power,
    stations,
    ports,
    pipelines,
    basins,
    coal,
  };
}

if (process.argv[1]?.endsWith("build-sudan-infra.ts")) {
  const d = buildInfra();
  const json = JSON.stringify(d) + "\n";
  writeFileSync("data/sudan-infra.json", json);
  console.log(
    `${(json.length / 1024).toFixed(0)} KB`,
    Object.fromEntries(Object.entries(d).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])),
  );
}
