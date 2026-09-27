/**
 * معادن السودان على الخريطة — من قاعدة المسح الجيولوجي الأمريكي.
 *
 * Reads the raw GeoJSON that .github/workflows/sudan-minerals.yml clips from
 * the USGS "Compilation of Geospatial Data (GIS) for the Mineral Industries
 * and Related Infrastructure of Africa" (2021, doi:10.5066/P97EQWXP, public
 * domain) and writes data/sudan-minerals.json: one row per site in Sudan,
 * with its commodity, kind and status in Arabic.
 *
 * Three kinds, kept apart because they are different claims:
 *  - منشأة (facility): a mine, quarry, plant, refinery or oilfield that USGS
 *    lists as a production site, with its operator. Status as of 2018 — the
 *    dataset's year, before the war; "assumed active" is USGS's own wording.
 *  - رواسب (deposit): a known mineral occurrence (USGS PP1802), not a mine.
 *  - استكشاف (exploration): a licence or project under exploration.
 *
 * Place names are given in Arabic only where the Arabic name is certain;
 * otherwise the name stays as USGS writes it rather than being guessed.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Props = Record<string, string | number | null>;
type Feature = { properties: Props; geometry: { coordinates: [number, number] } | null };

const RAW = "data/minerals-raw";

const COMMODITY: Record<string, string> = {
  Gold: "ذهب",
  Silver: "فضة",
  Copper: "نحاس",
  Zinc: "زنك",
  Chromium: "كروم",
  Manganese: "منغنيز",
  "Iron ore": "خام الحديد",
  "Iron and steel": "حديد وصلب",
  Petroleum: "نفط",
  Cement: "إسمنت",
  Stone: "حجر جيري",
  Gypsum: "جبس",
  Salt: "ملح",
  Mica: "ميكا",
  Fluorite: "فلوريت",
  Asbestos: "أسبستوس",
  Magnesium: "مغنيسيوم",
};

/** Colour group on the map: what a reader looks for first. */
const GROUP: Record<string, "gold" | "metal" | "fuel" | "industrial"> = {
  Gold: "gold",
  Silver: "gold",
  Petroleum: "fuel",
  Copper: "metal",
  Zinc: "metal",
  Chromium: "metal",
  Manganese: "metal",
  "Iron ore": "metal",
  "Iron and steel": "metal",
};

const STATE: Record<string, string> = {
  "River Nile": "نهر النيل",
  "Red Sea": "البحر الأحمر",
  Khartoum: "الخرطوم",
  "Blue Nile": "النيل الأزرق",
  "White Nile": "النيل الأبيض",
  "West Kurdufan": "غرب كردفان",
  "North Kurdufan": "شمال كردفان",
  "North Darfur": "شمال دارفور",
  "South Darfur": "جنوب دارفور",
  "East Darfur": "شرق دارفور",
  "Al Jazirah": "الجزيرة",
  Northern: "الشمالية",
};

const STATUS: Record<string, string> = {
  "Assumed Active": "يُفترض أنّه عامل (٢٠١٨)",
  Closed: "مغلق",
  "C&M": "متوقّف مؤقتاً",
  Exploration: "قيد الاستكشاف",
};

/** Places whose Arabic name is certain. Matched as a word in the USGS name. */
const PLACE: [RegExp, string][] = [
  [/Hassai/, "حصاي"],
  [/Ingessana/, "جبال الإنقسنا"],
  [/Atbara/, "عطبرة"],
  [/Port Sudan/, "بورتسودان"],
  [/Khartoum/, "الخرطوم"],
  [/Giad|Gian/, "جياد"],
  [/Rabak/, "ربك"],
  [/Berber/, "بربر"],
  [/Abu Hamad/, "أبو حمد"],
  [/Wadi Madani/, "ود مدني"],
  [/Jebel Amir/, "جبل عامر"],
  [/Gebeit/, "جبيت"],
  [/Hofrat En Nahas/, "حفرة النحاس"],
  [/El-Obeid/, "الأبيض"],
  [/Jali/, "الجيلي"],
  [/Shajirah/, "الشجرة"],
  [/Abu Jabirah/, "أبو جابرة"],
  [/Helgig/, "هجليج"],
  [/Fula/, "الفولة"],
  [/Bir Eit/, "بئر إيت"],
  [/Wadi Gabgaba/, "وادي قبقبة"],
  [/Fodikwan/, "فوديكوان"],
];

const KIND_OF_FACILITY: Record<string, string> = {
  "Mines and Quarries": "منجم أو محجر",
  "Mineral Processing Plants": "مصنع معالجة",
  "Oil and Gas Fields": "حقل نفط",
  "Oil and Gas Refineries and (or) Petrochemical Complexes": "مصفاة",
};

export type MineralSite = {
  kind: "facility" | "deposit" | "exploration";
  name: string;
  place: string | null;
  what: string;
  commodity: string;
  commodityAr: string;
  also: string[];
  group: "gold" | "metal" | "fuel" | "industrial";
  state: string | null;
  status: string | null;
  operator: string | null;
  lon: number;
  lat: number;
};

const clean = (v: unknown) => (typeof v === "string" && v.trim() && v.trim() !== "<null>" ? v.trim() : null);

function read(layer: string): Feature[] {
  return (JSON.parse(readFileSync(`${RAW}/${layer}.geojson`, "utf8")) as { features: Feature[] }).features.filter(
    (f) => f.properties.Country === "Sudan" && f.geometry,
  );
}

function site(f: Feature, kind: MineralSite["kind"]): MineralSite {
  const p = f.properties;
  const commodities = [p.DsgAttr01, p.DsgAttr02, p.DsgAttr03].map(clean).filter((c): c is string => !!c);
  // Facilities put the class (Metal / Industrial / Fuel) first and the
  // commodity second; deposits and exploration put the commodity first.
  const main = kind === "facility" ? clean(p.DsgAttr02) ?? "" : commodities[0] ?? "";
  const also = (kind === "facility" ? [] : commodities.slice(1)).map((c) => COMMODITY[c] ?? c);
  const name = clean(p.FeatureNam) ?? "";
  const place = PLACE.find(([re]) => re.test(name))?.[1] ?? null;
  const [lon, lat] = f.geometry!.coordinates;
  return {
    kind,
    name,
    place,
    what:
      kind === "facility"
        ? KIND_OF_FACILITY[String(p.FeatureTyp)] ?? "منشأة"
        : kind === "deposit"
          ? "رواسب معروفة"
          : "موقع استكشاف",
    commodity: main,
    commodityAr: COMMODITY[main] ?? main,
    also,
    group: GROUP[main] ?? "industrial",
    // A deposit's ADM1 in this layer does not always match its coordinates
    // (Hassai is listed under Khartoum), so only facilities carry a state.
    state: kind === "facility" ? STATE[String(p.ADM1)] ?? clean(p.ADM1) : null,
    status: STATUS[String(clean(p.LocOpStat))] ?? null,
    operator: clean(p.OperateNam) ?? clean(p.OwnerName),
    lon: Math.round(lon * 1000) / 1000,
    lat: Math.round(lat * 1000) / 1000,
  };
}

export function buildSites(): MineralSite[] {
  return [
    ...read("AFR_Mineral_Facilities").map((f) => site(f, "facility")),
    ...read("AFR_Mineral_Deposits").map((f) => site(f, "deposit")),
    ...read("AFR_Mineral_Exploration").map((f) => site(f, "exploration")),
  ];
}

if (process.argv[1]?.endsWith("build-sudan-minerals.ts")) {
  const sites = buildSites();
  writeFileSync(
    "data/sudan-minerals.json",
    JSON.stringify(
      {
        source:
          "USGS, Compilation of Geospatial Data (GIS) for the Mineral Industries and Related Infrastructure of Africa, 2021 (doi:10.5066/P97EQWXP), public domain",
        asOf: 2018,
        sites,
      },
      null,
      1,
    ) + "\n",
  );
  const by = (k: keyof MineralSite) =>
    Object.entries(sites.reduce<Record<string, number>>((a, s) => ((a[String(s[k])] = (a[String(s[k])] ?? 0) + 1), a), {}));
  console.log(`${sites.length} sites`, by("kind"), by("commodityAr"));
}
