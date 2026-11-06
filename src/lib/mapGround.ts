/**
 * Where the live maps' ground comes from (البند ١٤٧), in one place for the website's LiveMap and the
 * phone app's map screen (/api/app/map, البند ٢٠٣), so both draw the same two grounds and credit them
 * the same way. LiveMap is a client component: its exports reach a route handler as client
 * references, not strings, so the constants live here.
 *
 * Both free for a commercial site, read on 23 October:
 *   - the map: OpenFreeMap («Is commercial usage allowed? Yes»; no key, no limit), the «liberty» style;
 *   - the satellite: EOxCloudless 2016 (CC BY 4.0: «Commercial apps may access the free 2016 endpoint
 *     under CC BY 4.0, provided traffic is reasonable»), a Sentinel-2 mosaic at 10 m — fields and
 *     canals, not houses. The later years are not free for commercial use.
 *
 * .github/workflows/map-sources.yml reads the two addresses from this file and proves they answer.
 */

export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// The 2016 mosaic's layer is «s2cloudless_3857», with no year: the years
// in the name (s2cloudless-2018_3857 and on) are the non-commercial ones.
// Proved by .github/workflows/map-sources.yml, which found the first guess
// at the name answering 404 (24 October).
export const SAT_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
/** The mosaic's tiles go to zoom 13; closer in, the map enlarges those. */
export const SAT_MAX_ZOOM = 13;
export const SAT_ATTRIBUTION =
  '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)';

/** A credit as words and a link, for a map that draws no HTML (the app). */
export type GroundCredit = { text: string; url: string };

/**
 * The credits each ground carries, as MapLibre shows them in its «i» on the website: the street
 * style's own source attribution (OpenFreeMap, OpenMapTiles, OpenStreetMap), and SAT_ATTRIBUTION.
 * The satellite also shows the street map's labels and roads, so it carries both.
 */
export const GROUND_CREDITS: { map: GroundCredit[]; sat: GroundCredit[] } = {
  map: [
    { text: "OpenFreeMap", url: "https://openfreemap.org" },
    { text: "© OpenMapTiles", url: "https://www.openmaptiles.org/" },
    { text: "Data from OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
  ],
  sat: [
    {
      text: "EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)",
      url: "https://cloudless.eox.at",
    },
  ],
};

/**
 * «المصادر» under the map on /map, as plain words for the app. The page writes the same sentence
 * with its Latin names set left-to-right; scripts/verify-app-maps.ts checks both name every source.
 */
export const MAP_SOURCES = {
  ar:
    "المصادر: التوقّع والارتفاع من Open-Meteo، والتربة من ISRIC SoilGrids، وحدود السودان من Natural Earth، " +
    "والمعادن والطرق والكهرباء من المسح الجيولوجي الأمريكي (٢٠٢١، قبل الحرب). الخريطة من OpenFreeMap " +
    "وOpenStreetMap، وصورة القمر الصناعيّ EOxCloudless 2016 من EOX (بيانات Copernicus Sentinel معدّلة)، " +
    "بدقّة ١٠ أمتار: تُرى فيها الحقول والترع، لا البيوت.",
  en:
    "Sources: the forecast and elevation from Open-Meteo; soil from ISRIC SoilGrids; Sudan's border from " +
    "Natural Earth; minerals, roads and power from the US Geological Survey (2021, pre-war). The map from " +
    "OpenFreeMap and OpenStreetMap; the satellite image is EOxCloudless 2016 by EOX IT Services (modified " +
    "Copernicus Sentinel data), at 10 metres — fields and canals, not houses.",
} as const;
