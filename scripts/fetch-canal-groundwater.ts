/**
 * المياه الجوفية حول القناة القوسية — من أطلس المياه الجوفية لأفريقيا.
 *
 * MacDonald, Bonsor, Ó Dochartaigh & Taylor (2012), "Quantitative maps of
 * groundwater resources in Africa", Environmental Research Letters 7 024009;
 * the British Geological Survey publishes the maps as 5 km grids. They are
 * continental estimates — depth to groundwater, aquifer productivity and
 * storage in classes — and the only open source of all three for Sudan.
 * They say what kind of ground water sits under the plain, not what a well
 * on it would give.
 *
 * Writes data/canal-groundwater.json. Runs on a GitHub runner
 * (.github/workflows/canal-groundwater.yml) because the BGS site is not
 * reachable from the development environment.
 *
 * THIS FIRST PASS KEEPS THE CODES AS THEY ARE
 *
 * The grids ship with a readme that says what each value means, and nobody
 * here has read it: the file names and links are taken from the download page
 * at run time, and the readme is saved beside the values. The labels are
 * written from that readme afterwards, not guessed now — a wrong label on a
 * depth-to-water map is worse than none.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import raw from "../data/canal-map.json";

const PAGE = "https://www2.bgs.ac.uk/groundwater/international/africanGroundwater/mapsDownload.html";
const MARGIN = 0.1;

const { south, west, north, east } = (raw as { bbox: { south: number; west: number; north: number; east: number } }).bbox;

/** Every .zip link on the page, made absolute. */
export function zipLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+\.zip)["']/gi)) out.add(new URL(m[1], base).href);
  return [...out];
}

/**
 * Lines of "x y value" (commas or spaces) whose point lies in the frame.
 * Coordinates that are not degrees (a projected grid) never match, and the
 * log then shows the first lines so the next pass can project them.
 */
export function pointsIn(text: string) {
  const pts: { lon: number; lat: number; v: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split(/[\s,;]+/);
    if (f.length < 3) continue;
    const lon = Number(f[0]);
    const lat = Number(f[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon >= west - MARGIN && lon <= east + MARGIN && lat >= south - MARGIN && lat <= north + MARGIN) {
      pts.push({ lon, lat, v: f.slice(2).join(" ") });
    }
  }
  return pts;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function main() {
  const res = await fetch(PAGE, { headers: { "user-agent": "sudagri/1.0" } });
  if (!res.ok) throw new Error(`download page: HTTP ${res.status}`);
  const links = zipLinks(await res.text(), PAGE);
  console.log("zip links on the page:\n  " + links.join("\n  "));

  const maps: {
    url: string;
    files: { name: string; head: string[]; points: { lon: number; lat: number; v: string }[] }[];
    readme: string;
  }[] = [];
  for (const url of links) {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const zip = join(dir, "a.zip");
    try {
      execSync(`curl -sSL --fail -A sudagri/1.0 -o ${zip} "${url}"`);
      execSync(`unzip -o -q ${zip} -d ${dir}`);
    } catch (e) {
      console.error(`  ${url}: ${e}`);
      continue;
    }
    const files = walk(dir).filter((p) => p !== zip);
    let readme = "";
    const grids: (typeof maps)[number]["files"] = [];
    for (const f of files) {
      const text = readFileSync(f, "latin1");
      if (/readme|read_me|metadata/i.test(f) || f.endsWith(".pdf")) {
        if (!f.endsWith(".pdf")) readme += `── ${f.slice(dir.length + 1)}\n${text.slice(0, 6000)}\n`;
        continue;
      }
      const points = pointsIn(text);
      grids.push({ name: f.slice(dir.length + 1), head: text.split(/\r?\n/).slice(0, 8), points });
      console.log(`  ${f.slice(dir.length + 1)}: ${points.length} points in the frame`);
    }
    maps.push({ url, files: grids, readme });
    console.log(readme.slice(0, 3000));
  }

  writeFileSync(
    "data/canal-groundwater.json",
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString().slice(0, 10),
        source: "BGS Africa Groundwater Atlas — MacDonald et al. 2012, Environ. Res. Lett. 7 024009 (5 km grids)",
        page: PAGE,
        bbox: { south, west, north, east },
        maps,
      },
      null,
      1,
    ) + "\n",
  );
}

if (process.argv[1]?.endsWith("fetch-canal-groundwater.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
