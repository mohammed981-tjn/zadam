import { contours } from "d3-contour";

/**
 * Smooth shapes from a regular grid — the corridor's elevation and soil
 * grids, drawn as bands and regions instead of squares.
 *
 * A grid here is values at nodes, `nx` across and `ny` down, row 0 at the
 * NORTH (the order d3-contour reads, like an image). `at(col, row)` turns a
 * node position (fractional) into [lon, lat]. d3-contour puts node k's value
 * at k + 0.5, so the shapes are shifted back by half a cell.
 */

export type Pt = [number, number];
export type Shape = Pt[][];
export interface Grid {
  values: number[];
  nx: number;
  ny: number;
  at: (col: number, row: number) => Pt;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The area at or above each threshold. */
export function bandsOf(g: Grid, thresholds: number[]): Shape[][] {
  return contours()
    .size([g.nx, g.ny])
    .thresholds(thresholds)(g.values)
    .map((mp) =>
      mp.coordinates.map((poly) =>
        poly.map((ring) =>
          ring.map(([c, r]) => {
            const [lon, lat] = g.at(c - 0.5, r - 0.5);
            return [r4(lon), r4(lat)] as Pt;
          }),
        ),
      ),
    );
}

/** The same grid `factor` times finer, bilinear between nodes. */
export function upsample(g: Grid, factor: number): Grid {
  const nx = (g.nx - 1) * factor + 1;
  const ny = (g.ny - 1) * factor + 1;
  const values = new Array<number>(nx * ny);
  for (let r = 0; r < ny; r++) {
    const fy = r / factor;
    const r0 = Math.min(g.ny - 2, Math.floor(fy));
    const ty = fy - r0;
    for (let c = 0; c < nx; c++) {
      const fx = c / factor;
      const c0 = Math.min(g.nx - 2, Math.floor(fx));
      const tx = fx - c0;
      const v = (rr: number, cc: number) => g.values[rr * g.nx + cc];
      const top = v(r0, c0) * (1 - tx) + v(r0, c0 + 1) * tx;
      const bot = v(r0 + 1, c0) * (1 - tx) + v(r0 + 1, c0 + 1) * tx;
      values[r * nx + c] = top * (1 - ty) + bot * ty;
    }
  }
  return { values, nx, ny, at: (c, r) => g.at(c / factor, r / factor) };
}

/**
 * The grid with one more node on every side, copying the edge — so a shape
 * that reaches the edge of the data runs on past the frame (where the map
 * clips it) instead of closing along the data's edge in a straight line.
 */
export function pad(g: Grid): Grid {
  const nx = g.nx + 2;
  const ny = g.ny + 2;
  const values = new Array<number>(nx * ny);
  for (let r = 0; r < ny; r++) {
    const rr = Math.min(g.ny - 1, Math.max(0, r - 1));
    for (let c = 0; c < nx; c++) {
      const cc = Math.min(g.nx - 1, Math.max(0, c - 1));
      values[r * nx + c] = g.values[rr * g.nx + cc];
    }
  }
  return { values, nx, ny, at: (c, r) => g.at(c - 1, r - 1) };
}

/** A box blur of the given radius, run twice — near-Gaussian, so edges curve. */
export function blur(g: Grid, radius: number): Grid {
  let v = g.values;
  for (let pass = 0; pass < 2; pass++) {
    const h = new Array<number>(v.length);
    for (let r = 0; r < g.ny; r++) {
      for (let c = 0; c < g.nx; c++) {
        let sum = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d++) {
          const cc = Math.min(g.nx - 1, Math.max(0, c + d));
          sum += v[r * g.nx + cc];
          n++;
        }
        h[r * g.nx + c] = sum / n;
      }
    }
    const out = new Array<number>(v.length);
    for (let r = 0; r < g.ny; r++) {
      for (let c = 0; c < g.nx; c++) {
        let sum = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d++) {
          const rr = Math.min(g.ny - 1, Math.max(0, r + d));
          sum += h[rr * g.nx + c];
          n++;
        }
        out[r * g.nx + c] = sum / n;
      }
    }
    v = out;
  }
  return { ...g, values: v };
}

/**
 * Class regions from a grid of class names: for each class but the
 * commonest, the area where it holds more than half the neighbourhood,
 * softened so the boundary curves the way ground does rather than stepping
 * along the lines between sample points. The commonest is returned as
 * `base`, to fill the frame first.
 */
export function classRegions(
  classes: (string | null)[],
  nx: number,
  ny: number,
  at: Grid["at"],
  factor = 8,
): { base: string | null; regions: { cls: string; shapes: Shape[] }[] } {
  const counts = new Map<string, number>();
  for (const c of classes) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const regions = order.slice(1).map((cls) => {
    const g = blur(upsample(pad({ values: classes.map((c) => (c === cls ? 1 : 0)), nx, ny, at }), factor), Math.round(factor / 2));
    return { cls, shapes: bandsOf(g, [0.5])[0] };
  });
  return { base: order[0] ?? null, regions: regions.filter((r) => r.shapes.length > 0) };
}
