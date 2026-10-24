// MapLibre's own files into public/vendor/maplibre/, after every install.
//
// The live map (src/components/map/LiveMap.tsx) does not bundle MapLibre: it
// imports these files as they ship. MapLibre 6 starts a worker from a file
// beside its own (maplibre-gl-worker.mjs, found from import.meta.url), and
// once bundled it looks for it beside the bundle, where it is not — the map
// then never draws ("Worker failed to load", found on 24 October). Served
// from one folder, the page and the worker also share maplibre-gl-shared.mjs,
// so the half-megabyte both need is fetched once.
//
// The folder is not in git (.gitignore); `npm install` and `npm ci` remake it
// on every machine and on Vercel. A missing file stops the install, so a map
// cannot ship without its library.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "vendor", "maplibre");
const FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];

mkdirSync(to, { recursive: true });
for (const f of FILES) copyFileSync(join(from, f), join(to, f));
const { version } = JSON.parse(readFileSync(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"));
console.log(`maplibre-gl ${version}: ${FILES.length} files in public/vendor/maplibre`);
