/**
 * «الخرائط» في التطبيق (البند ٢٠٣): the app's map screen draws what /map draws, in the same colours,
 * over the same grounds, credits them the same way, and reads nothing private.
 *
 *   npx tsx scripts/verify-app-maps.ts
 *
 * The app's files: mobile/lib/maps.dart and mobile/lib/screens/maps_screen.dart. The server's:
 * src/app/api/app/map/route.ts, built on the website's own mapThemes (src/lib/mapLayers.ts) and
 * grounds (src/lib/mapGround.ts).
 */
import { readFileSync } from "node:fs";
import { HEAT, mapThemes, mapWeekDates } from "../src/lib/mapLayers";
import { MAP_SOURCES, SAT_TILES, STREET_STYLE, GROUND_CREDITS } from "../src/lib/mapGround";
import { RAIN_CELLS, availableLayers, cellKeyAt, sumGrid } from "../src/lib/rainMap";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const read = (p: string) => readFileSync(p, "utf8");
const dart = read("mobile/lib/maps.dart");
const screen = read("mobile/lib/screens/maps_screen.dart");
const test = read("mobile/test/maps_test.dart");
const route = read("src/app/api/app/map/route.ts");
const liveMap = read("src/components/map/LiveMap.tsx");
const page = read("src/app/map/page.tsx");
const appFiles: [string, string][] = [
  ["mobile/lib/maps.dart", dart],
  ["mobile/lib/screens/maps_screen.dart", screen],
];

/* ── a) the colour ramp ── */
console.log("\nأ) سلّم الحرارة: قائمة التطبيق هي قائمة الموقع");
const list = (src: string, name: string) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*(?:<String>)?\\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/['"](#[0-9a-fA-F]{6})['"]/g)].map((x) => x[1].toLowerCase()) : null;
};
const appRamp = list(dart, "heatRamp");
ok(HEAT.length === 6 && HEAT.every((c) => /^#[0-9a-f]{6}$/.test(c)), `the site's HEAT is six colours: ${HEAT.join(" ")}`);
ok(JSON.stringify(appRamp) === JSON.stringify(HEAT), `the app's heatRamp is the same list, in the same order`);
ok(JSON.stringify(list(test, "siteHeat")) === JSON.stringify(HEAT), "and the app's test checks against the same list");
ok(/const lineGreen = '#1f7a3d'/.test(dart) && route !== "" && read("src/lib/mapLayers.ts").includes('color: "#1f7a3d"'), "lines in #1f7a3d, as the canal's on the site");

// What the app receives for the heat layer, from a week built by the site's own code.
const days = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];
const forecast = RAIN_CELLS.map((c) => ({
  daily: {
    time: days,
    precipitation_sum: days.map(() => Math.max(0, (16 - c.lat) * 2)),
    et0_fao_evapotranspiration: days.map(() => 5 + (c.lat - 10) / 3),
    temperature_2m_max: days.map(() => 28 + (c.lat - 8)),
  },
}));
// Three verified lands in two squares, counted as public_land_cells() counts them.
const landCells = [RAIN_CELLS[10], RAIN_CELLS[40]];
const lands = new Map(landCells.map((c, i) => [cellKeyAt(c.lon, c.lat)!, i + 1]));
const grid = sumGrid(RAIN_CELLS, forecast, RAIN_CELLS.map((c) => 300 + c.lon * 10), lands)!;
const themes = mapThemes(grid, availableLayers(grid), "ar", mapWeekDates(grid, "ar"));
const tmax = themes.find((t) => t.key === "tmax");
ok(JSON.stringify(tmax?.legend?.map((b) => b.colour)) === JSON.stringify(HEAT), "the heat layer's key, as sent to the app, is HEAT band for band");
const tmaxColours = new Set(
  (tmax?.overlays ?? []).flatMap((o) => (o.kind === "fill" ? o.data.features.map((f) => String(f.properties?.colour)) : [])),
);
ok(tmaxColours.size > 0 && [...tmaxColours].every((c) => (HEAT as string[]).includes(c)), "and every heat band drawn is one of HEAT's colours");

/* ── b) no red, no orange ── */
console.log("\nب) لا أحمر ولا برتقاليّ في ملفّات خرائط التطبيق");
const hsl = (hex: string) => {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
};
// A hue from red through orange at a saturation that reads as a colour — not an earth brown, a beige or a grey.
const redOrOrange = (hex: string) => {
  const { h, s, l } = hsl(hex);
  return (h < 45 || h > 340) && s >= 0.55 && l > 0.2 && l < 0.85;
};
ok(redOrOrange("dc2626") && redOrOrange("f97316") && redOrOrange("ef4444"), "the rule catches red-600, orange-500 and red-500");
ok(!redOrOrange("1f7a3d") && !redOrOrange("f3f1e6") && !redOrOrange("8a7a52"), "and passes the platform's green, beige and olive");
for (const [name, src] of appFiles) {
  const hexes = [
    ...[...src.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => m[1]),
    ...[...src.matchAll(/0x[0-9a-fA-F]{2}([0-9a-fA-F]{6})\b/g)].map((m) => m[1]),
  ];
  const bad = hexes.filter(redOrOrange);
  ok(bad.length === 0, `${name}: ${hexes.length} colours, none red or orange${bad.length ? ` (found ${bad.join(", ")})` : ""}`);
  ok(!/Colors\.(red|orange|deepOrange|redAccent|orangeAccent|amber)\b/.test(src), `${name}: no Material red, orange or amber`);
}
ok(HEAT.every((c) => !redOrOrange(c.slice(1))), "the site's HEAT itself has none");

/* ── c) the grounds and their credits ── */
console.log("\nج) الأرضيّتان ومصادرهما: ما يستعمله الموقع");
ok(/from "@\/lib\/mapGround"/.test(liveMap) && !liveMap.includes("tiles.openfreemap.org") && !liveMap.includes("tiles.maps.eox.at"),
  "LiveMap takes both addresses from src/lib/mapGround.ts, with no copy of its own");
ok(/from "@\/lib\/mapGround"/.test(route) && /style: STREET_STYLE/.test(route) && /sat: SAT_TILES/.test(route), "the app's route sends the same two");
ok(STREET_STYLE === "https://tiles.openfreemap.org/styles/liberty", `the street map: ${STREET_STYLE}`);
ok(SAT_TILES.includes("/s2cloudless_3857/"), "the satellite: EOxCloudless 2016, the year free for commercial use (no year in the layer's name)");
ok(!/tiles\.openfreemap\.org|tiles\.maps\.eox\.at|tile\.openstreetmap\.org|arcgisonline|google/.test(dart + screen),
  "the app hard-codes no tile address: it draws what the route names");
ok(/data\.satTiles/.test(screen) && /loadGroundStyle\(_client, url\)/.test(screen) && /_loadGround\(data\.styleUrl\)/.test(screen),
  "the screen draws the satellite and the street style the route names");
const credits = [...GROUND_CREDITS.map, ...GROUND_CREDITS.sat].map((c) => c.text).join(" ");
for (const name of ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap", "EOxCloudless", "Copernicus Sentinel"]) {
  ok(credits.includes(name), `the map's «i» credits ${name}, as MapLibre's does on the site`);
}
ok(/RichAttributionWidget/.test(screen) && /data\.satCredits, \.\.\.data\.mapCredits/.test(screen),
  "the app shows them, and on the satellite both (its labels and roads are the street map's)");
for (const name of ["Open-Meteo", "ISRIC SoilGrids", "Natural Earth", "OpenFreeMap", "OpenStreetMap", "EOxCloudless 2016", "Copernicus Sentinel"]) {
  ok(page.includes(name) && MAP_SOURCES.ar.includes(name) && MAP_SOURCES.en.includes(name), `«المصادر» names ${name} on /map and in the app`);
}
ok(page.includes("المسح الجيولوجي الأمريكي") && MAP_SOURCES.ar.includes("المسح الجيولوجي الأمريكي"), "and the US Geological Survey, in Arabic");
ok(/data\.sources/.test(screen), "the app shows the sources");

/* ── d) the same layers ── */
console.log("\nد) الطبقات نفسها");
ok(/mapThemes\(grid, grid \? availableLayers\(grid\) : \[\], locale, mapWeekDates\(grid, locale\)\)/.test(route) &&
  /mapThemes\(grid, grid \? availableLayers\(grid\) : \[\], locale, mapWeekDates\(grid, locale\)\)/.test(page),
  "the route and /map build their themes with the same call");
const keys = themes.map((t) => t.key);
ok(JSON.stringify(keys) === JSON.stringify(["rain", "tmax", "et0", "elev", "soil", "lands", "canal", "minerals", "infra"]),
  `every layer /map offers: ${keys.join(", ")}`);
const kinds = new Set(themes.flatMap((t) => t.overlays.map((o) => o.kind)));
for (const k of kinds) ok(dart.includes(`OverlayKind { fill, line, points, pins }`) && ["fill", "line", "points", "pins"].includes(k), `the app reads the «${k}» overlays the themes use`);
const geoms = new Set(
  themes.flatMap((t) => t.overlays.flatMap((o) => (o.kind === "pins" ? [] : o.data.features.map((f) => f.geometry.type)))),
);
for (const g of geoms) ok(dart.includes(`case '${g}':`), `and the ${g} geometry`);
const paints = new Set(themes.flatMap((t) => t.overlays.map((o) => ("color" in o ? JSON.stringify(o.color) : "")).filter(Boolean)));
ok([...paints].every((p) => /^"#[0-9a-f]{6}"$/.test(p) || p === '["get","colour"]'), "every colour is a #hex or [\"get\",\"colour\"], both of which the app reads");

/* ── e) privacy and keys ── */
console.log("\nهـ) لا مكانَ أرضٍ خاصّة، ولا مفتاحَ الخادم");
const landPins = themes.find((t) => t.key === "lands")?.overlays.flatMap((o) => (o.kind === "pins" ? o.pins : [])) ?? [];
const centres = new Set(RAIN_CELLS.map((c) => `${c.lon},${c.lat}`));
ok(landPins.length === landCells.length, `the verified lands go as ${landPins.length} counts, one per square`);
ok(landPins.every((p) => centres.has(`${p.lon},${p.lat}`)), "each at its square's centre (about 167 km across), never a land's own place");
const western = (t: string) => Number(t.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
ok(landPins.reduce((a, p) => a + western(p.text), 0) === 3, "and the counts are the database's counts");
const rainMap = read("src/lib/rainMap.ts");
ok(/createPublicClient\(\)\.rpc\("public_land_cells"\)/.test(rainMap), "counted by public_land_cells() over the anon key, as /map counts them");
const server = route + read("src/lib/mapGround.ts");
ok(!/service_role|SERVICE_ROLE|supabase\/admin|createAdminClient|adminClient/i.test(server + dart + screen), "no service-role key, no admin client, in the route or the app's files");
ok(!/clientFromBearer|accountController|Authorization/i.test(route + dart + screen), "and no session either: the map is public, as /map needs no sign-in");
ok(!/from "@\/lib\/supabase/.test(route), "the route itself opens no database client");

/* ── f) Halaib inside Sudan ── */
console.log("\nو) حلايب داخل السودان على أرضيّة التطبيق");
ok(/halaib: HALAIB_BORDER/.test(route), "the route sends Sudan's line round the triangle (HALAIB_BORDER, the website's)");
ok(dart.includes("'السودان-مثلثحلايب'") && /\[\s*'!=',\s*\[\s*'get',\s*'claimed_by'\s*\],\s*'EG',?\s*\]/.test(dart), "the app hides the dashed line by its name, and by Egypt's claim");
ok(dart.includes(`contains('["==",["get","disputed"],1]')`), "on the same layers the website changes (those drawing disputed = 1)");
ok(/points: data\.halaib/.test(screen), "and draws Sudan's line round it");
const bounds = liveMap.match(/SUDAN_BOUNDS[^=]*=\s*\[\s*\[([\d.]+),\s*([\d.]+)\],\s*\[([\d.]+),\s*([\d.]+)\]/);
ok(!!bounds && dart.includes(`sudanBounds = (${bounds[1]}, ${bounds[2]}, ${bounds[3]}, ${bounds[4]})`), "and first shows Sudan as the website does");

if (fail) {
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
