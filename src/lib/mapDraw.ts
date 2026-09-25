import { contours } from "d3-contour";
import base from "./sudanBase.json";
import {
  CELL_DEG,
  LAT_MAX,
  LAT_MIN,
  LON_MAX,
  LON_MIN,
  SOIL_CLASSES,
  type GridCell,
  type Layer,
} from "./rainMap";

/**
 * From the forecast grid to what a map reader sees: smooth bands of colour,
 * the value at each town, and the ground underneath.
 *
 * WHY BANDS AND NOT SQUARES
 *
 * The forecast is read at 87 points 160 km apart. Painting each as a square
 * says the rain stops at a straight line every 160 km, which it does not, and
 * the eye reads the grid before it reads the weather. Interpolating between
 * the points and drawing the bands the values fall in (isohyets, the way
 * every meteorological service draws rain) shows the pattern the points
 * sample — no more exact than the squares, and much easier to read.
 *
 * The interpolation is bilinear between cell centres onto a 0.25° grid, then
 * d3-contour traces the band edges with its own smoothing. Cells with no
 * value (the sea, the neighbours) take their nearest value so the bands run
 * to the border instead of stopping short of it; the drawing clips them to
 * Sudan.
 *
 * Kept free of React and SVG so the API can hand the same shapes to the app.
 */

export type Pt = [number, number];

export const BASE = base as {
  source: string;
  frame: { west: number; south: number; east: number; north: number };
  neighbours: { code: string; ring: Pt[] }[];
  rivers: { name: string; main: boolean; line: Pt[] }[];
  lakes: { name: string; ring: Pt[] }[];
  states: { name: string; ring: Pt[] }[];
};

const NX = Math.round((LON_MAX - LON_MIN) / CELL_DEG);
const NY = Math.round((LAT_MAX - LAT_MIN) / CELL_DEG);
const FINE = 0.25;
const FX = Math.round((LON_MAX - LON_MIN) / FINE);
const FY = Math.round((LAT_MAX - LAT_MIN) / FINE);

/**
 * The layer's values on the coarse grid, row 0 at the south, with the gaps
 * filled from the nearest cell that has one.
 */
export function coarseField(cells: GridCell[], value: (c: GridCell) => number | null): number[][] | null {
  const f: (number | null)[][] = Array.from({ length: NY }, () => Array<number | null>(NX).fill(null));
  let any = false;
  for (const c of cells) {
    const v = value(c);
    if (v == null) continue;
    const i = Math.floor((c.lat - LAT_MIN) / CELL_DEG);
    const j = Math.floor((c.lon - LON_MIN) / CELL_DEG);
    if (i >= 0 && i < NY && j >= 0 && j < NX) {
      f[i][j] = v;
      any = true;
    }
  }
  if (!any) return null;
  const known: [number, number, number][] = [];
  f.forEach((row, i) => row.forEach((v, j) => v != null && known.push([i, j, v])));
  return f.map((row, i) =>
    row.map((v, j) => {
      if (v != null) return v;
      let best = known[0];
      let bd = Infinity;
      for (const k of known) {
        const d = (k[0] - i) ** 2 + (k[1] - j) ** 2;
        if (d < bd) [bd, best] = [d, k];
      }
      return best[2];
    }),
  );
}

/** Bilinear between cell centres; clamped at the edges of the grid. */
export function sample(field: number[][], lon: number, lat: number): number {
  const x = Math.min(NX - 1, Math.max(0, (lon - LON_MIN) / CELL_DEG - 0.5));
  const y = Math.min(NY - 1, Math.max(0, (lat - LAT_MIN) / CELL_DEG - 0.5));
  const j0 = Math.floor(x);
  const i0 = Math.floor(y);
  const j1 = Math.min(NX - 1, j0 + 1);
  const i1 = Math.min(NY - 1, i0 + 1);
  const tx = x - j0;
  const ty = y - i0;
  const a = field[i0][j0] * (1 - tx) + field[i0][j1] * tx;
  const b = field[i1][j0] * (1 - tx) + field[i1][j1] * tx;
  return a * (1 - ty) + b * ty;
}

/** The fine grid d3-contour reads: row 0 at the NORTH, as an image is. */
function fine(field: number[][]): number[] {
  const out = new Array<number>(FX * FY);
  for (let r = 0; r < FY; r++) {
    const lat = LAT_MAX - (r + 0.5) * FINE;
    for (let c = 0; c < FX; c++) out[r * FX + c] = sample(field, LON_MIN + (c + 0.5) * FINE, lat);
  }
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const toLonLat = ([x, y]: number[]): Pt => [r3(LON_MIN + x * FINE), r3(LAT_MAX - y * FINE)];

/** Each polygon's outer ring and its holes, in lon/lat. */
export type Shape = Pt[][];

/**
 * The bands to paint: `base` is the band that covers all of Sudan (the
 * lowest one any value reaches), painted as the country's fill; each entry
 * after it is the area at or above a higher band's minimum, drawn in order
 * so each lies over the last.
 */
export interface Bands {
  base: number;
  bands: { band: number; shapes: Shape[] }[];
}

const shapesOf = (values: number[], threshold: number): Shape[] => {
  const [mp] = contours().size([FX, FY]).thresholds([threshold])(values);
  return mp.coordinates.map((poly) => poly.map((ring) => ring.map(toLonLat)));
};

export function isobands(cells: GridCell[], layer: Layer): Bands | null {
  const field = coarseField(cells, layer.value);
  if (!field) return null;
  const values = fine(field);
  const lo = Math.min(...values);
  let base = 0;
  layer.bands.forEach((b, k) => {
    if (b.min <= lo) base = k;
  });
  const bands = layer.bands
    .map((b, k) => ({ band: k, shapes: k > base ? shapesOf(values, b.min) : [] }))
    .filter((b) => b.shapes.length > 0);
  return { base, bands };
}

/**
 * Soil groups as smooth regions: for each group, how much of the
 * neighbourhood is that group, interpolated and cut at one half. The
 * commonest is the base; the rest are drawn over it, commonest first.
 */
export function classRegions(cells: GridCell[]): Bands | null {
  if (SOIL_CLASSES.length === 0) return null;
  const bands = SOIL_CLASSES.slice(1)
    .map((w, k) => {
      const field = coarseField(cells, (c) => (c.soil == null ? null : c.soil === w ? 1 : 0));
      return { band: k + 1, shapes: field ? shapesOf(fine(field), 0.5) : [] };
    })
    .filter((b) => b.shapes.length > 0);
  return { base: 0, bands };
}

/**
 * The towns labelled on the map with the layer's value, and which side of
 * the dot the label sits — chosen by looking, so no two collide on a phone.
 */
export const MAP_LABELS: { name: string; lon: number; lat: number; side: "l" | "r" | "t" | "b" }[] = [
  { name: "بورتسودان", lon: 37.22, lat: 19.62, side: "l" },
  { name: "حلايب", lon: 36.64, lat: 22.22, side: "l" },
  { name: "كسلا", lon: 36.4, lat: 15.45, side: "r" },
  { name: "القضارف", lon: 35.39, lat: 14.03, side: "r" },
  { name: "الدمازين", lon: 34.36, lat: 11.79, side: "r" },
  { name: "سنّار", lon: 33.63, lat: 13.55, side: "r" },
  { name: "ود مدني", lon: 33.52, lat: 14.4, side: "l" },
  { name: "الخرطوم", lon: 32.53, lat: 15.6, side: "t" },
  { name: "عطبرة", lon: 33.98, lat: 17.7, side: "r" },
  { name: "كوستي", lon: 32.66, lat: 13.16, side: "l" },
  { name: "دنقلا", lon: 30.48, lat: 19.17, side: "t" },
  { name: "الأبيض", lon: 30.22, lat: 13.18, side: "b" },
  { name: "كادقلي", lon: 29.72, lat: 11.01, side: "b" },
  { name: "الفاشر", lon: 25.35, lat: 13.63, side: "t" },
  { name: "نيالا", lon: 24.88, lat: 12.05, side: "b" },
  { name: "الجنينة", lon: 22.44, lat: 13.45, side: "r" },
];

/** Each labelled town with the layer's value there, or null for a class layer. */
export function townValues(cells: GridCell[], layer: Layer) {
  // A class (soil) has no value to write, and a count (lands) belongs to its
  // cell, not to the nearest town.
  const field = layer.numbers === false || layer.key === "lands" ? null : coarseField(cells, layer.value);
  return MAP_LABELS.map((t) => ({ ...t, value: field ? sample(field, t.lon, t.lat) : null }));
}

/** Where the neighbours' names go: over open ground in each, clear of the frame. */
export const NEIGHBOUR_LABELS: { name: string; lon: number; lat: number }[] = [
  { name: "مصر", lon: 27.5, lat: 23.1 },
  { name: "ليبيا", lon: 22.9, lat: 21.2 },
  { name: "تشاد", lon: 21.9, lat: 17.2 },
  { name: "أفريقيا الوسطى", lon: 24.4, lat: 8.35 },
  { name: "جنوب السودان", lon: 29.5, lat: 8.35 },
  { name: "إثيوبيا", lon: 37.3, lat: 9.0 },
  { name: "إريتريا", lon: 38.6, lat: 16.0 },
];
