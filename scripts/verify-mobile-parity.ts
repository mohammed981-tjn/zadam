/**
 * يقرأ أرقام فحوص الجوّال ويُشغّل محرّك الويب عليها.
 *
 * THE HOLE THIS CLOSES
 *
 * The Flutter app carries its own copy of the FAO-56 engine and of the
 * irrigation-interval engine, because the water tools have to work with no
 * signal. `mobile/test/agronomy_test.dart` and `mobile/test/soil_water_test.dart`
 * pin the Dart output to numbers the TypeScript engines produced, and both
 * READMEs describe that as protection against the two sides drifting apart.
 *
 * It was only half true. Those tests run Dart. Nothing ran the TypeScript. So a
 * change to `src/lib/agronomy.ts` or `src/lib/soilWater.ts` moved the web's
 * answer and left every mobile test green — the exact failure the pin claims to
 * prevent, in the one direction nobody was watching. The website says one
 * number, the app in the farmer's hand says another, and each CI is happy.
 *
 * This script reads the expected values out of the Dart test files themselves
 * and runs the web engines over them. Parsing the Dart rather than copying the
 * constants is the point: a second copy of the numbers here would be a third
 * thing to drift. There is one set of golden values, it lives in the mobile
 * tests, and now both languages are held to it.
 */

import {
  CROPS,
  STATIONS,
  waterRequirement,
  type IrrigationMethod,
} from "../src/lib/agronomy";
import { irrigationInterval } from "../src/lib/soilWater";

const TOLERANCE = 0.001;

let fail = 0;

function check(label: string, got: number, want: number, tol = TOLERANCE) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${got
      .toFixed(4)
      .padStart(12)}  expect ${want.toFixed(4)}`,
  );
}

/* ------------------------------------------------------------------ *
 * Reading the golden values out of the Dart tests
 * ------------------------------------------------------------------ */

/**
 * Pulls the argument lists of every `Name(...)` constructor call in a file.
 *
 * The literals are flat — quoted keys, integers, doubles and
 * `IrrigationMethod.x` — with no nested parentheses and no commas inside the
 * strings, so finding the matching `)` and splitting on commas is enough. If
 * that ever stops being true the parse throws rather than quietly reading the
 * wrong arity, and the arity assertion below is what catches it.
 */
function parseCalls(file: string, ctor: string): string[][] {
  /*
   * Only the literal list, never the whole file — the class's own constructor
   * declaration reads as `_Case(` too, and parsing that yields `this.crop` where
   * a crop key should be.
   */
  const start = file.indexOf(`<${ctor}>[`);
  if (start === -1) throw new Error(`no <${ctor}>[ list found`);
  const end = file.indexOf("];", start);
  if (end === -1) throw new Error(`unterminated <${ctor}>[ list`);
  const source = file.slice(start, end);

  const calls: string[][] = [];
  const needle = `${ctor}(`;
  let at = source.indexOf(needle);

  while (at !== -1) {
    const open = at + needle.length;
    const close = source.indexOf(")", open);
    if (close === -1) throw new Error(`unterminated ${ctor}( at ${at}`);
    calls.push(
      source
        .slice(open, close)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
    at = source.indexOf(needle, close);
  }

  return calls;
}

const str = (v: string) => v.replace(/^'|'$/g, "");
const num = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${v}`);
  return n;
};
const method = (v: string) => str(v).replace("IrrigationMethod.", "") as IrrigationMethod;

const crop = (k: string) => {
  const c = CROPS.find((x) => x.key === k);
  if (!c) throw new Error(`no crop ${k} in the web engine`);
  return c;
};
const station = (k: string) => {
  const s = STATIONS.find((x) => x.key === k);
  if (!s) throw new Error(`no station ${k} in the web engine`);
  return s;
};

async function read(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

/* ------------------------------------------------------------------ *
 * A) FAO-56 water requirement
 * ------------------------------------------------------------------ */

async function verifyAgronomy() {
  console.log("=".repeat(78));
  console.log("A) mobile/test/agronomy_test.dart — the web engine on the same cases");
  console.log("=".repeat(78));

  const calls = parseCalls(await read("mobile/test/agronomy_test.dart"), "_Case");
  if (calls.length === 0) throw new Error("no _Case( found — did the test file change shape?");

  for (const a of calls) {
    if (a.length !== 12) {
      fail++;
      console.log(`  FAIL  _Case has ${a.length} arguments, expected 12 — parser is stale`);
      continue;
    }

    const [ck, sk, month, meth] = [str(a[0]), str(a[1]), num(a[2]), method(a[3])];
    const r = waterRequirement(crop(ck), station(sk), month, meth);
    const tag = `${ck}/${sk}/${meth}`;

    check(`${tag} seasonDays`, r.seasonDays, num(a[4]), 0);
    check(`${tag} totalEtc`, r.totalEtc, num(a[5]));
    check(`${tag} totalEffectiveRain`, r.totalEffectiveRain, num(a[6]));
    check(`${tag} totalNet`, r.totalNet, num(a[7]));
    check(`${tag} totalGross`, r.totalGross, num(a[8]));
    check(`${tag} m3PerFeddan`, r.m3PerFeddan, num(a[9]));
    check(`${tag} peakMonthIndex`, r.peakMonthIndex, num(a[10]), 0);
    check(`${tag} peakM3PerFeddanPerDay`, r.peakM3PerFeddanPerDay, num(a[11]));
  }
}

/* ------------------------------------------------------------------ *
 * B) Irrigation interval
 * ------------------------------------------------------------------ */

async function verifySoilWater() {
  console.log();
  console.log("=".repeat(78));
  console.log("B) mobile/test/soil_water_test.dart — the web engine on the same cases");
  console.log("=".repeat(78));

  const calls = parseCalls(
    await read("mobile/test/soil_water_test.dart"),
    "_SoilCase",
  );
  if (calls.length === 0) {
    throw new Error("no _SoilCase( found — did the test file change shape?");
  }

  for (const a of calls) {
    if (a.length !== 9) {
      fail++;
      console.log(`  FAIL  _SoilCase has ${a.length} arguments, expected 9 — parser is stale`);
      continue;
    }

    const [ck, sk, month, meth, soil] = [
      str(a[0]),
      str(a[1]),
      num(a[2]),
      method(a[3]),
      str(a[4]),
    ];

    const r = irrigationInterval(crop(ck), station(sk), month, meth, soil);
    const tag = `${ck}/${sk}/${soil}`;

    if (!r) {
      fail++;
      console.log(`  FAIL  ${tag} — the web engine returns null where Dart returns a value`);
      continue;
    }

    check(`${tag} rawMm`, r.rawMm, num(a[5]));
    check(`${tag} peakMmPerDay`, r.peakMmPerDay, num(a[6]));
    check(`${tag} days`, r.days, num(a[7]));
    check(`${tag} doseM3PerFeddan`, r.doseM3PerFeddan, num(a[8]));
  }
}

/* ------------------------------------------------------------------ *
 * C) The tables the mobile screen reads
 * ------------------------------------------------------------------ */

/**
 * The app's soil picker is built from its own copy of the texture table, and
 * the crops it offers come from its own crop list. A crop added to the mobile
 * app without a root depth would show the farmer an empty panel — the Dart test
 * catches that. What it cannot catch is the mobile tables having silently
 * different *values* from the web's, since it only ever reads its own. So
 * compare the two directly.
 */
async function verifyTables() {
  console.log();
  console.log("=".repeat(78));
  console.log("C) mobile/lib/soil_water.dart — the tables themselves, side by side");
  console.log("=".repeat(78));

  const { TAW_MM_PER_M, ROOT_DEPTH_M, SHALLOW_P, DEPLETION_FRACTION } = await import(
    "../src/lib/soilWater"
  );
  const dart = await read("mobile/lib/soil_water.dart");

  const table = (name: string) => {
    const at = dart.indexOf(`${name} = {`);
    if (at === -1) throw new Error(`no ${name} in the Dart port`);
    const close = dart.indexOf("};", at);
    const out: Record<string, number> = {};
    for (const line of dart.slice(at, close).split("\n")) {
      const m = line.match(/'([^']+)'\s*:\s*([0-9.]+)/);
      if (m) out[m[1]] = Number(m[2]);
    }
    return out;
  };

  for (const [name, web] of [
    ["tawMmPerM", TAW_MM_PER_M],
    ["rootDepthM", ROOT_DEPTH_M],
    ["shallowP", SHALLOW_P],
  ] as const) {
    const port = table(name);
    const keys = new Set([...Object.keys(web), ...Object.keys(port)]);
    for (const k of keys) {
      if (web[k] === undefined || port[k] === undefined) {
        fail++;
        console.log(
          `  FAIL  ${name}.${k.padEnd(20)} present on only one side ` +
            `(web ${web[k] ?? "—"}, app ${port[k] ?? "—"})`,
        );
        continue;
      }
      check(`${name}.${k}`, port[k], web[k], 0);
    }
  }

  const p = dart.match(/depletionFraction\s*=\s*([0-9.]+)/);
  if (!p) {
    fail++;
    console.log("  FAIL  no depletionFraction in the Dart port");
  } else {
    check("depletionFraction", Number(p[1]), DEPLETION_FRACTION, 0);
  }
}

/* ------------------------------------------------------------------ *
 * D) The crop table itself
 * ------------------------------------------------------------------ */

/**
 * The golden cases above pin the *answers* for the crops they name. They say
 * nothing about a crop nobody wrote a case for — a Kc mistyped in the Dart list,
 * a crop in the web list the app never got, one the app has and the website
 * dropped. So compare the two tables row by row: same crops, same order, same
 * names, stage lengths and coefficients (البند ١٧٩).
 */
function dartCropTable() {
  return read("mobile/lib/agronomy.dart").then((dart) => {
    const at = dart.indexOf("const List<CropCoefficients> crops = [");
    if (at === -1) throw new Error("no `crops` list in mobile/lib/agronomy.dart");
    const end = dart.indexOf("\n];", at);
    if (end === -1) throw new Error("unterminated `crops` list");
    const blocks = dart.slice(at, end).split("CropCoefficients(").slice(1);
    return blocks.map((b) => {
      const text = (field: string) => {
        const m = b.match(new RegExp(`${field}:\\s*'([^']*)'`));
        if (!m) throw new Error(`crop block without ${field}: ${b.slice(0, 60)}`);
        return m[1];
      };
      const number = (field: string) => {
        const m = b.match(new RegExp(`${field}:\\s*([0-9.]+)\\s*,`));
        if (!m) throw new Error(`crop block without ${field}: ${b.slice(0, 60)}`);
        return Number(m[1]);
      };
      const st = b.match(/stages:\s*\[([0-9,\s]+)\]/);
      if (!st) throw new Error(`crop block without stages: ${b.slice(0, 60)}`);
      return {
        key: text("key"),
        name: text("name"),
        stages: st[1].split(",").map((x) => Number(x.trim())),
        kcInitial: number("kcInitial"),
        kcMid: number("kcMid"),
        kcEnd: number("kcEnd"),
      };
    });
  });
}

async function verifyCropTable() {
  console.log();
  console.log("=".repeat(78));
  console.log("D) mobile/lib/agronomy.dart `crops` — the table against CROPS, row by row");
  console.log("=".repeat(78));

  const dart = await dartCropTable();
  const same = (label: string, ok: boolean, detail = "") => {
    if (!ok) fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${detail}`);
  };

  same("same number of crops", dart.length === CROPS.length, `web ${CROPS.length}, app ${dart.length}`);
  const webKeys = CROPS.map((c) => c.key);
  const appKeys = dart.map((c) => c.key);
  for (const k of webKeys) if (!appKeys.includes(k)) same(`${k} is in the app`, false, "missing from mobile/lib/agronomy.dart");
  for (const k of appKeys) if (!webKeys.includes(k)) same(`${k} is on the website`, false, "only the app has it");
  same("same order", webKeys.join() === appKeys.join(), "the picker lists them in this order");

  for (const w of CROPS) {
    const a = dart.find((x) => x.key === w.key);
    if (!a) continue;
    same(`${w.key} name`, a.name === w.name, `${a.name} / ${w.name}`);
    same(`${w.key} stages`, a.stages.join() === w.stages.join(), `${a.stages.join("-")} / ${w.stages.join("-")}`);
    check(`${w.key} kcInitial`, a.kcInitial, w.kcInitial, 0);
    check(`${w.key} kcMid`, a.kcMid, w.kcMid, 0);
    check(`${w.key} kcEnd`, a.kcEnd, w.kcEnd, 0);
  }
}

/**
 * E) Every crop the app offers has a pinned case, and its interval is there
 * exactly when its root depth is.
 */
async function verifyCoverage() {
  console.log();
  console.log("=".repeat(78));
  console.log("E) every crop pinned by a golden case; interval iff root depth");
  console.log("=".repeat(78));

  const cases = parseCalls(await read("mobile/test/agronomy_test.dart"), "_Case").map((a) => str(a[0]));
  const { ROOT_DEPTH_M } = await import("../src/lib/soilWater");
  const station0 = STATIONS[0];
  for (const c of CROPS) {
    const pinned = cases.includes(c.key);
    if (!pinned) fail++;
    console.log(`  ${pinned ? "PASS" : "FAIL"}  ${c.key.padEnd(52)} ${pinned ? "has a golden _Case" : "no _Case in mobile/test/agronomy_test.dart"}`);

    const iv = irrigationInterval(c, station0, 6, "flood", "sandy loam");
    const agrees = (iv === null) === (ROOT_DEPTH_M[c.key] === undefined);
    if (!agrees) fail++;
    console.log(`  ${agrees ? "PASS" : "FAIL"}  ${(c.key + " interval/root depth").padEnd(52)} ${iv === null ? "no interval" : "interval"}, depth ${ROOT_DEPTH_M[c.key] ?? "—"}`);
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  await verifyAgronomy();
  await verifySoilWater();
  await verifyTables();
  await verifyCropTable();
  await verifyCoverage();

  console.log();
  if (fail > 0) {
    console.log(
      `${fail} mismatch(es). The app and the website now answer differently. ` +
        `Move whichever side is wrong — or, if the change is deliberate, ` +
        `regenerate the Dart golden values from the web engine and say why in ` +
        `the commit.`,
    );
    process.exit(1);
  }
  console.log("All parity checks passed — the app and the website agree.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
