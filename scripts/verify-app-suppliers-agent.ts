/**
 * The app's suppliers and agent screens held to the website's own rules (backlog 203).
 *
 *   npx tsx scripts/verify-app-suppliers-agent.ts
 *
 * - Every per-user route under /api/app/suppliers and /api/app/agent starts by asking who is calling
 *   (`clientFromBearer`) and answers 401 when no one is; the two public reads use the public key and write nothing.
 * - No new route, and nothing it imports, reaches the server's key. Registering a farmer without a phone — the one
 *   agent step that needs it — stays on the website.
 * - The website's actions and the app's routes run the same steps (src/lib/supplyCore.ts, src/lib/agentCore.ts), so
 *   the agent's writes go through agent_stage_complete / agent_stage_evidence_add and the handover through
 *   delivery_confirm / delivery_cancel from both doors.
 * - A photo from the app is stored without the place and time it carried (they become columns, as on the website),
 *   but keeps which way up it is.
 * - The routes the app calls exist, and its screens use no red and no orange.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readJpegMetadata } from "../src/lib/exif";
import { jpegOrientation, photoBytes, stripJpegMetadata, stripPngMetadata } from "../src/lib/appPhoto";
import { formFields, jsonFields } from "../src/lib/supplyCore";

const root = join(__dirname, "..");
let failed = 0;
const ok = (c: boolean, m: string, why = "") => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}${c ? "" : ` — ${why}`}`);
  if (!c) failed++;
};
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(root, p)).isDirectory() ? walk(p) : n === "route.ts" ? [p] : [];
  });

const PUBLIC = ["src/app/api/app/suppliers/route.ts", "src/app/api/app/suppliers/[id]/route.ts"];
const routes = [...walk("src/app/api/app/suppliers"), ...walk("src/app/api/app/agent")];
const SESSION_OVER = `if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });`;

console.log("Who is calling");
ok(routes.length >= 9, `${routes.length} routes found`, "expected the suppliers and agent routes");
for (const p of routes) {
  const src = read(p);
  const handlers = [...src.matchAll(/export async function (GET|POST)\(([^)]*)\)[^{]*\{\n([^\n]*)\n([^\n]*)/g)];
  ok(handlers.length > 0, `${p}: exports a handler`);
  if (PUBLIC.includes(p)) {
    ok(!/export async function POST/.test(src), `${p}: public, and only reads`);
    ok(/createPublicClient\(\)/.test(src) && !/clientFromBearer/.test(src), `${p}: read with the public key, as a visitor reads the page`);
    ok(!/\.(rpc|insert|update|upsert|delete|upload)\(/.test(src), `${p}: writes nothing and calls no function`);
    ok(/VISITOR_COLUMNS\.suppliers/.test(src), `${p}: names the visitor's columns of suppliers`);
    continue;
  }
  for (const h of handlers) {
    ok(h[3].trim() === "const auth = await clientFromBearer(req);", `${p} ${h[1]}: starts with clientFromBearer(req)`, h[3].trim());
    ok(h[4].trim() === SESSION_OVER, `${p} ${h[1]}: 401 «انتهت جلستك» when no one is signed in`, h[4].trim());
  }
}

console.log("\nNo server key");
const LIBS = ["src/lib/supplyCore.ts", "src/lib/agentCore.ts", "src/lib/appPhoto.ts", "src/lib/appApi.ts", "src/lib/supplyActions.ts"];
for (const p of [...routes, ...LIBS]) {
  const src = read(p);
  ok(!/SERVICE_ROLE|createAdminClient|from "@\/lib\/supabase\/admin"|\bservice_role\b/.test(src), `${p}: no service-role key, no admin client`);
}
for (const p of routes) {
  const imports = [...read(p).matchAll(/from "@\/lib\/([^"]+)"/g)].map((m) => `src/lib/${m[1]}.ts`);
  const outside = imports.filter((i) => !LIBS.includes(i) && existsSync(join(root, i)) && /createAdminClient|SERVICE_ROLE/.test(read(i)));
  ok(outside.length === 0, `${p}: imports nothing that holds the server key`, outside.join(", "));
}
const agentActions = read("src/app/agent/actions.ts");
ok(/export async function registerManagedFarmer/.test(agentActions), "registering a farmer without a phone is still the website's action");
for (const p of routes) ok(!/managed_farmer_register|registerManagedFarmer/.test(read(p)), `${p}: does not register a farmer without a phone`);

console.log("\nOne set of steps for both doors");
const agentCore = read("src/lib/agentCore.ts");
ok(/\.rpc\("agent_stage_complete", \{ p_stage: stageId \}\)/.test(agentCore), "the agent's sign-off is agent_stage_complete");
ok(/\.rpc\("agent_stage_evidence_add", \{/.test(agentCore), "the agent's evidence is agent_stage_evidence_add");
ok(/evidenceFileExists\(supabase, args\.storagePath\)/.test(agentCore) && /startsWith\(`\$\{userId\}\/`\)/.test(agentCore), "and only for a file in the agent's own folder that is there");
ok(/\.rpc\("agent_write_object"/.test(agentCore), "the farmer's objection is agent_write_object");
const farmerRoute = read("src/app/api/app/agent/[farmer]/route.ts");
ok(/agentCompleteStageStep\(supabase, stageId/.test(farmerRoute), "the app's sign-off runs agentCompleteStageStep");
ok(/agentAddEvidenceStep\(\s*supabase,\s*user\.id/.test(farmerRoute), "the app's evidence runs agentAddEvidenceStep as the caller");
ok(!/\.rpc\(\s*"agent_stage/.test(farmerRoute), "the app's route calls no agent function itself — only the shared steps");
const farmerActions = read("src/app/agent/[farmer]/actions.ts");
ok(/agentCompleteStageStep\(/.test(farmerActions) && /agentAddEvidenceStep\(/.test(farmerActions), "the website's /agent/[farmer] runs the same two steps");
ok(/objectAgentWriteStep\(/.test(agentActions) && /requestMandateStep\(/.test(agentActions), "the website's /agent and «وكلائي» run the same steps");
ok(/objectAgentWriteStep\(/.test(read("src/app/api/app/agent/mine/route.ts")), "the app's «وكلائي» objects through the same step");

const supplyCore = read("src/lib/supplyCore.ts");
ok(/\.rpc\("delivery_confirm", \{/.test(supplyCore) && /"delivery_cancel"/.test(supplyCore), "the handover and its cancellation are delivery_confirm / delivery_cancel");
const supplierActions = read("src/app/suppliers/actions.ts");
ok(!/\.rpc\(/.test(supplierActions), "the website's supplier actions call no function themselves — only the shared steps");
const deliveries = read("src/app/api/app/suppliers/deliveries/route.ts");
ok(/confirmDeliveryStep\(/.test(deliveries) && /cancelDeliveryStep\(/.test(deliveries), "the app's deliveries run confirmDeliveryStep and cancelDeliveryStep");
ok(/run\(fd, "\/suppliers\/deliveries", confirmDeliveryStep\)/.test(supplierActions) && /run\(fd, "\/suppliers\/deliveries", cancelDeliveryStep\)/.test(supplierActions), "and so does the website");

// The same input, as a form or as JSON, reads the same.
const fd = new FormData();
fd.set("quantity", "١٢٫5".replace("٫", "."));
fd.set("name", "  يوريا ");
fd.append("states", "الجزيرة");
fd.append("states", "سنار");
const js = jsonFields({ quantity: "١٢.5", name: "  يوريا ", states: ["الجزيرة", "سنار"] });
const ff = formFields(fd);
ok(ff.num("quantity") === 12.5 && js.num("quantity") === 12.5, "a number in Arabic digits reads the same from a form and from JSON");
ok(ff.str("name") === js.str("name") && js.str("name") === "يوريا", "text is trimmed the same");
ok(JSON.stringify(ff.all("states")) === JSON.stringify(js.all("states")), "repeated fields read the same");
ok(js.num("missing") === null && js.str("missing") === "" && js.all("missing").length === 0, "absent fields read as absent");

console.log("\nA photo from the app");
// A JPEG with an EXIF block (orientation 6, a GPS position, a capture time), a comment, and a few bytes of «pixels».
const u16 = (n: number) => [n >> 8, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value];
const ascii = [..."2026:10:01 08:30:00"].map((c) => c.charCodeAt(0)).concat(0);
// TIFF: header (8) · IFD0 at 8 with 3 entries (2 + 36 + 4 = 42) → 50 · ExifIFD at 50, 1 entry (18) → 68 · GPS IFD at 68,
// 4 entries (2 + 48 + 4 = 54) → 122 · date (20) at 122 → 142 · lat (24) at 142 → 166 · lng (24) at 166.
const rational = (...v: number[]) => v.flatMap((n) => [...u32(n), ...u32(1)]);
const tiff = [
  0x4d, 0x4d, 0x00, 0x2a, ...u32(8),
  ...u16(3), ...entry(0x0112, 3, 1, [0, 6, 0, 0]), ...entry(0x8769, 4, 1, u32(50)), ...entry(0x8825, 4, 1, u32(68)), ...u32(0),
  ...u16(1), ...entry(0x9003, 2, 20, u32(122)), ...u32(0),
  ...u16(4), ...entry(1, 2, 2, [0x4e, 0, 0, 0]), ...entry(2, 5, 3, u32(142)), ...entry(3, 2, 2, [0x45, 0, 0, 0]), ...entry(4, 5, 3, u32(166)), ...u32(0),
  ...ascii, ...rational(14, 24, 36), ...rational(33, 30, 0),
];
const app1 = [0xff, 0xe1, ...u16(tiff.length + 8), 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
const jfif = [0xff, 0xe0, ...u16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const comment = [0xff, 0xfe, ...u16(7), ..."camera".split("").map((c) => c.charCodeAt(0)).slice(0, 5)];
const dqt = [0xff, 0xdb, ...u16(5), 0, 1, 2];
const scan = [0xff, 0xda, ...u16(4), 9, 9, 0x12, 0x34, 0x56, 0xff, 0x00, 0x78, 0xff, 0xd9];
const jpeg = Uint8Array.from([0xff, 0xd8, ...jfif, ...app1, ...comment, ...dqt, ...scan]);

const before = readJpegMetadata(jpeg.slice().buffer);
ok(before.capturedAt !== null && before.latitude !== null && before.longitude !== null, "the test photo carries a time and a place", JSON.stringify(before));
ok(jpegOrientation(jpeg) === 6, "and an orientation (6: turned on its side)");
const clean = stripJpegMetadata(jpeg);
ok(!!clean, "it is read and cleaned");
if (clean) {
  const after = readJpegMetadata(clean.slice().buffer);
  ok(after.capturedAt === null && after.latitude === null && after.longitude === null, "the stored file carries no time and no place", JSON.stringify(after));
  ok(jpegOrientation(clean) === 6, "but still says which way up it is");
  const hex = Buffer.from(clean).toString("hex");
  ok(!hex.includes(Buffer.from("2026:10:01").toString("hex")) && !hex.includes("fffe"), "the date text and the comment are gone");
  ok(hex.endsWith(Buffer.from(scan).toString("hex")), "the pixels are untouched");
  ok(hex.includes(Buffer.from(jfif).toString("hex")) && hex.includes(Buffer.from(dqt).toString("hex")), "the JFIF header and the tables stay");
}
ok(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])) === null, "a JPEG it cannot follow is refused, not stored as it came");

const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...chunk("IHDR", new Array(13).fill(1)), ...chunk("eXIf", [1, 2, 3]), ...chunk("tEXt", [65, 0, 66]), ...chunk("IDAT", [7, 7]), ...chunk("IEND", []),
]);
const cleanPng = stripPngMetadata(png);
const pngText = cleanPng ? Buffer.from(cleanPng).toString("latin1") : "";
ok(!!cleanPng && !pngText.includes("eXIf") && !pngText.includes("tEXt") && pngText.includes("IDAT") && pngText.includes("IEND"), "a PNG loses its EXIF and text chunks, keeps its pixels");
ok(photoBytes("data:image/jpeg;base64,/9j/") !== null && photoBytes(42) === null && photoBytes("not base64!") === null, "the photo arrives as base64 text, or not at all");

console.log("\nThe routes the app calls");
const dart = read("mobile/lib/suppliers.dart") + read("mobile/lib/agent.dart");
const called = [...dart.matchAll(/'(\/api\/app\/(?:suppliers|agent)[^'?]*)/g)].map((m) => m[1].replace(/\$\{?[a-zA-Z_.]+\}?/g, "[x]"));
ok(called.length >= 8, `the app calls ${new Set(called).size} supplier and agent routes`);
for (const path of new Set(called)) {
  const dir = path.slice(1).split("/").map((s) => (s === "[x]" ? null : s));
  const candidates = routes.map((r) => r.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "").split("/"));
  const hit = candidates.some((c) => c.length === dir.length && c.every((s, i) => (dir[i] === null ? /^\[.+\]$/.test(s) : s === dir[i])));
  ok(hit, `${path} has a route`, "no matching src/app/.../route.ts");
}

console.log("\nNo red, no orange (the owner's standing rule)");
const screens = [
  "mobile/lib/suppliers.dart",
  "mobile/lib/agent.dart",
  ...readdirSync(join(root, "mobile/lib/screens"))
    .filter((n) => /^(suppliers|agent)_.*\.dart$/.test(n))
    .map((n) => `mobile/lib/screens/${n}`),
];
ok(screens.includes("mobile/lib/screens/suppliers_screen.dart") && screens.includes("mobile/lib/screens/agent_screen.dart"), "the two screens are there");
for (const p of screens) {
  const src = read(p);
  ok(!/Colors\.(red|orange|deepOrange|redAccent|orangeAccent|pink)/.test(src) && !/Color\(0x[fF]{2}[eEfF][0-9a-fA-F][0-5][0-9a-fA-F]{3}\)/.test(src), `${relative(root, join(root, p))}: no red or orange`);
}

console.log("");
if (failed) {
  console.log(`${failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED — the app's suppliers and agent screens go through the website's steps, as the caller");
