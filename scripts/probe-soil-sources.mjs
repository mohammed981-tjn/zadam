// Prints what the point-level soil services answer, from a GitHub runner (backlog 180).
// The development container cannot reach them. Read-only.
//
//   node scripts/probe-soil-sources.mjs
const UA = "SudagriSoil/1.0 (+https://zadam-khaki.vercel.app)";
const POINTS = [
  ["Khartoum, Nile valley", 15.6, 32.53],
  ["Gezira clay plain", 14.4, 33.5],
  ["Gedaref", 14.03, 35.38],
  ["North Kordofan qoz sand", 13.2, 30.2],
  ["Wadi Halfa, Nile", 21.8, 31.35],
  ["Red Sea hills", 19.6, 36.9],
];

async function get(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(30000) });
    const body = await res.text();
    return { status: res.status, ms: Date.now() - t0, type: res.headers.get("content-type"), body };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, type: "", body: "", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

console.log(`probe at ${new Date().toISOString()}\n`);

console.log("=== ISRIC SoilGrids REST: WRB classification at a point");
for (const [name, lat, lon] of POINTS) {
  const r = await get(`https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lon}&lat=${lat}&number_classes=3`);
  console.log(`--- ${name} (${lat}, ${lon}) → ${r.status} in ${r.ms} ms ${r.type ?? ""} ${r.error ?? ""}`);
  console.log(r.body.slice(0, 700).replace(/\s+/g, " "));
  // The service allows about five queries a minute: spread them, as the app would.
  await new Promise((res) => setTimeout(res, 13000));
}

console.log("\n=== ISRIC metadata (is the service up, what does it say about limits)");
const meta = await get("https://rest.isric.org/soilgrids/v2.0/properties/layers");
console.log(`→ ${meta.status} in ${meta.ms} ms ${meta.error ?? ""}`);
console.log(meta.body.slice(0, 300).replace(/\s+/g, " "));

console.log("\n=== iSDAsoil API (Africa, 30 m): does it answer without a key");
const isda = await get("https://api.isda-africa.com/v1/soilproperty?key=none&lat=15.6&lon=32.53&property=ph&depth=0-20");
console.log(`→ ${isda.status} in ${isda.ms} ms ${isda.error ?? ""}`);
console.log(isda.body.slice(0, 300).replace(/\s+/g, " "));
