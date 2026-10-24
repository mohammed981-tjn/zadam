import type { Locale } from "./i18n";

/**
 * English names for the places, crops and labels that live in shared data
 * files in Arabic only (src/lib/agronomy.ts, the map JSON, the minerals and
 * infrastructure data). The data stays as it is — the app and the API read it
 * — and English readers get the name from here, keyed by the Arabic or by the
 * record's own key. A name missing here falls back to the Arabic.
 */

const PLACE_EN: Record<string, string> = {
  // Towns
  "الخرطوم": "Khartoum",
  "بورتسودان": "Port Sudan",
  "القضارف": "Gedaref",
  "الأبيض": "El Obeid",
  "نيالا": "Nyala",
  "دنقلا": "Dongola",
  "حلايب": "Halaib",
  "كسلا": "Kassala",
  "الدمازين": "Ed Damazin",
  "سنّار": "Sennar",
  "سنار": "Sennar",
  "ود مدني": "Wad Madani",
  "عطبرة": "Atbara",
  "كوستي": "Kosti",
  "كادقلي": "Kadugli",
  "الفاشر": "El Fasher",
  "الجنينة": "El Geneina",
  "أم درمان": "Omdurman",
  "السروراب": "Sarurab",
  "جبل أولياء": "Jebel Aulia",
  "خزان جبل أولياء": "Jebel Aulia Reservoir",
  // Neighbours
  "مصر": "Egypt",
  "ليبيا": "Libya",
  "تشاد": "Chad",
  "أفريقيا الوسطى": "Central African Rep.",
  "جنوب السودان": "South Sudan",
  "إثيوبيا": "Ethiopia",
  "إريتريا": "Eritrea",
  // States
  "نهر النيل": "River Nile",
  "غرب كردفان": "West Kordofan",
  "شمال كردفان": "North Kordofan",
  "جنوب كردفان": "South Kordofan",
  "البحر الأحمر": "Red Sea",
  "النيل الأبيض": "White Nile",
  "النيل الأزرق": "Blue Nile",
  "شمال دارفور": "North Darfur",
  "جنوب دارفور": "South Darfur",
  "غرب دارفور": "West Darfur",
  "شرق دارفور": "East Darfur",
  "وسط دارفور": "Central Darfur",
  "الشمالية": "Northern",
  "الجزيرة": "Gezira",
  // Canal landmarks
  "الحاجز الجنوبي": "Southern ridge",
  "أقصى الغرب": "Westernmost point",
  "الحاجز الشمالي": "Northern ridge",
};

/** A place's name in the reader's language; unknown names stay as written. */
export const placeName = (name: string, locale: Locale) =>
  locale === "en" ? (PLACE_EN[name] ?? name) : name;

/** Crops in src/lib/agronomy.ts, by key. */
export const CROP_EN: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize",
  cotton: "Cotton",
  groundnut: "Groundnut",
  sesame: "Sesame",
  alfalfa: "Alfalfa",
  onion: "Onion",
  tomato: "Tomato",
  sugarcane: "Sugarcane",
  millet: "Pearl millet",
  dates: "Date palm",
  faba_bean: "Faba bean",
  potato: "Potato",
  sunflower: "Sunflower",
  safflower: "Safflower",
  barley: "Barley",
  rice: "Rice",
  cowpea: "Cowpea",
  watermelon: "Watermelon",
  sweet_melon: "Sweet melon",
  cucumber: "Cucumber",
  eggplant: "Eggplant",
  sweet_pepper: "Sweet pepper",
  cabbage: "Cabbage",
  carrot: "Carrot",
  zucchini: "Zucchini",
  sweet_potato: "Sweet potato",
  citrus: "Citrus (grapefruit)",
  soybean: "Soybean",
  grapes: "Grapes",
  olive: "Olive",
};

/** Climate stations in src/lib/agronomy.ts, by key. */
export const STATION_EN: Record<string, string> = {
  khartoum: "Khartoum",
  gezira: "Gezira (Wad Madani)",
  rivernile: "River Nile (Atbara)",
  northern: "Northern (Dongola)",
  kordofan: "North Kordofan (El Obeid)",
  kassala: "Kassala",
  nyala: "South Darfur (Nyala)",
  elfasher: "North Darfur (El Fasher)",
  damazin: "Blue Nile (Ed Damazin)",
  kosti: "White Nile (Kosti)",
  geneina: "West Darfur (El Geneina)",
  zalingei: "Central Darfur (Zalingei)",
  eddaein: "East Darfur (Ed Daein)",
  kurmuk: "Blue Nile (Kurmuk)",
  sennar: "Sennar",
  "arc-corridor": "Arc Canal corridor",
};

export const cropName = (c: { key: string; name: string }, locale: Locale) =>
  locale === "en" ? (CROP_EN[c.key] ?? c.name) : c.name;

export const stationName = (s: { key: string; name: string }, locale: Locale) =>
  locale === "en" ? (STATION_EN[s.key] ?? s.name) : s.name;

export const MONTH_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const IRRIGATION_EN: Record<string, string> = {
  flood: "Flood irrigation",
  sprinkler: "Sprinkler",
  pivot: "Centre pivot",
  drip: "Drip irrigation",
};

export const STATION_SOURCE_EN: Record<string, string> = {
  indicative: "indicative estimates",
  "nasa-power": "NASA POWER — MERRA-2, 2001–2020 climate",
};

export const PRICE_BASIS_EN: Record<string, string> = {
  sudan_export: "Sudan's export unit value",
  regional_producer: "Regional producer price (approximate)",
  manual: "A price you entered",
  none: "No price available",
};

export const PRICE_BASIS_NOTE_EN: Record<string, string> = {
  sudan_export:
    "Export value divided by export quantity — money Sudan actually received, and the most accurate thing that can be said about the crop's price.",
  regional_producer:
    "The average producer price in Egypt, Ethiopia, India, Niger, Iraq, Algeria and Saudi Arabia. FAOSTAT publishes no producer price for Sudan at all, so this is a weaker substitute — another country and another currency regime.",
  manual: "You entered the price yourself, so it overrides any estimate.",
  none: "There is no price for this crop in the loaded data. Enter a price to complete the study.",
};

/** Season stages in src/lib/season.ts, by key. */
export const STAGE_EN: Record<string, string> = {
  land_prep: "Land preparation",
  planting: "Planting",
  establishment: "Emergence and establishment",
  vegetative: "Vegetative growth",
  flowering: "Flowering and fruiting",
  maturity: "Maturity",
  harvest: "Harvest and after",
};

/* ───────────── Minerals (data/sudan-minerals.json) ───────────── */

/** Commodity names, by the Arabic the data carries (also used for "also"). */
export const COMMODITY_EN: Record<string, string> = {
  "نفط": "Oil",
  "ذهب": "Gold",
  "إسمنت": "Cement",
  "حديد وصلب": "Iron and steel",
  "كروم": "Chromium",
  "حجر جيري": "Limestone",
  "جبس": "Gypsum",
  "خام الحديد": "Iron ore",
  "منغنيز": "Manganese",
  "ملح": "Salt",
  "ميكا": "Mica",
  "فضة": "Silver",
  "فلوريت": "Fluorite",
  "نحاس": "Copper",
  "أسبستوس": "Asbestos",
  "مغنيسيوم": "Magnesium",
  "زنك": "Zinc",
};

export const SITE_WHAT_EN: Record<string, string> = {
  "منجم أو محجر": "Mine or quarry",
  "مصنع معالجة": "Processing plant",
  "حقل نفط": "Oilfield",
  "رواسب معروفة": "Known deposit",
  "مصفاة": "Refinery",
  "موقع استكشاف": "Exploration site",
};

export const SITE_STATUS_EN: Record<string, string> = {
  "يُفترض أنّه عامل (٢٠١٨)": "Presumed operating (2018)",
  "متوقّف مؤقتاً": "Temporarily idle",
  "مغلق": "Closed",
  "قيد الاستكشاف": "Under exploration",
};

/** Look a value up in an English table when the reader reads English. */
export const inEnglish = (table: Record<string, string>, value: string, locale: Locale) =>
  locale === "en" ? (table[value] ?? value) : value;
