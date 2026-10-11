import { bandsOf, classRegions, type Shape } from "@/lib/contourGrid";
import { CORRIDOR, LAND_COVER, wrbInfo } from "@/lib/canalMap";
import { tr, type Locale } from "@/lib/i18n";

/** Digits in the reader's script: Arabic-Indic for Arabic, western for English. */
const num = (n: number, locale: Locale) => n.toLocaleString(locale === "en" ? "en-GB" : "ar-SA");

/**
 * The ground under every map of the Arc Canal: terrain as smooth colour
 * bands with contour lines, the Nile and the reservoir as they lie (traced
 * from ESA WorldCover's water, not drawn as a centreline), the built-up land
 * of Omdurman and Khartoum, and the frame furniture — north arrow and scale.
 *
 * Each map passes its own projection, so the pieces fit a frame of any size.
 */

export interface Proj {
  x: (lon: number) => number;
  y: (lat: number) => number;
}

const f1 = (n: number) => n.toFixed(1);
export const shapePath = (p: Proj, s: Shape) =>
  s.map((ring) => ring.map(([lon, lat], i) => `${i ? "L" : "M"}${f1(p.x(lon))} ${f1(p.y(lat))}`).join("") + "Z").join("");

const { nlat, nlon, step, elevation } = CORRIDOR.grid;
const { south, west } = CORRIDOR.bbox;

/** The elevation grid, row 0 at the north, as the contour tracer reads it. */
const ELEV = {
  values: Array.from({ length: nlat * nlon }, (_, k) => {
    const r = Math.floor(k / nlon);
    const c = k % nlon;
    return elevation[(nlat - 1 - r) * nlon + c];
  }),
  nx: nlon,
  ny: nlat,
  at: (c: number, r: number) => [west + c * step, south + (nlat - 1 - r) * step] as [number, number],
};

export const ELEV_LO = Math.min(...elevation);
export const ELEV_HI = Math.max(...elevation);
/** Every 10 m — the plain rises about a hundred across the frame. */
export const ELEV_STEP = 10;
const LEVELS = Array.from(
  { length: Math.floor(ELEV_HI / ELEV_STEP) - Math.ceil(ELEV_LO / ELEV_STEP) + 1 },
  (_, k) => (Math.ceil(ELEV_LO / ELEV_STEP) + k) * ELEV_STEP,
);
const TERRAIN = bandsOf(ELEV, LEVELS);

/** Low ground green, high ground tan and brown — the ramp of the national terrain layer. */
export function tint(z: number, lo = ELEV_LO, hi = ELEV_HI): string {
  const t = hi > lo ? (z - lo) / (hi - lo) : 0;
  const stops = [
    [0, [206, 228, 196]],
    [0.3, [178, 211, 150]],
    [0.55, [226, 216, 160]],
    [0.8, [206, 172, 112]],
    [1, [160, 116, 74]],
  ] as const;
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1];
      const [t1, c1] = stops[k];
      const f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, i) => Math.round(v + f * (c1[i] - v))).join(",")})`;
    }
  }
  return "rgb(160,116,74)";
}

/** Terrain bands, each drawn over the last; `opacity` below 1 lets another layer sit on it. */
export function Terrain({ p, opacity = 1 }: { p: Proj; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <rect x={-1000} y={-1000} width={4000} height={4000} fill={tint(ELEV_LO)} />
      {TERRAIN.map((shapes, k) =>
        shapes.map((s, j) => <path key={`${k}-${j}`} d={shapePath(p, s)} fill={tint(LEVELS[k])} fillRule="evenodd" />),
      )}
    </g>
  );
}

/** Contour lines, every 50 m a little heavier. */
export function Contours({ p }: { p: Proj }) {
  return (
    <g fill="none" stroke="#7a5a3a" strokeLinejoin="round">
      {TERRAIN.map((shapes, k) =>
        shapes.map((s, j) => (
          <path
            key={`${k}-${j}`}
            d={shapePath(p, s)}
            strokeWidth={LEVELS[k] % 50 === 0 ? 0.9 : 0.4}
            opacity={LEVELS[k] % 50 === 0 ? 0.6 : 0.35}
          />
        )),
      )}
    </g>
  );
}

export function Water({ p }: { p: Proj }) {
  return (
    <g fill="var(--map-water)" stroke="var(--map-water)" strokeWidth={0.8} strokeLinejoin="round">
      {LAND_COVER.water.map((s, k) => (
        <path key={k} d={shapePath(p, s)} fillRule="evenodd" />
      ))}
    </g>
  );
}

export function BuiltUp({ p }: { p: Proj }) {
  return (
    <g fill="#c9a6a0" fillOpacity={0.85} stroke="#a57f78" strokeWidth={0.4}>
      {LAND_COVER.built.map((s, k) => (
        <path key={k} d={shapePath(p, s)} fillRule="evenodd" />
      ))}
    </g>
  );
}

/** Soil groups as smooth regions over the 0.1° SoilGrids points. */
export function Soil({ p }: { p: Proj }) {
  const cells = CORRIDOR.soil.cells;
  const lons = [...new Set(cells.map((c) => c.lon))].sort((a, b) => a - b);
  const lats = [...new Set(cells.map((c) => c.lat))].sort((a, b) => b - a);
  const s = CORRIDOR.soil.step;
  const classes = lats.flatMap((la) => lons.map((lo) => cells.find((c) => c.lon === lo && c.lat === la)?.wrb ?? null));
  const { base, regions } = classRegions(classes, lons.length, lats.length, (c, r) => [lons[0] + c * s, lats[0] - r * s], 10);
  return (
    <g>
      <rect x={-1000} y={-1000} width={4000} height={4000} fill={wrbInfo(base)?.fill ?? "var(--card)"} />
      {regions.map((r) =>
        r.shapes.map((sh, k) => (
          <path key={`${r.cls}-${k}`} d={shapePath(p, sh)} fill={wrbInfo(r.cls)!.fill} fillRule="evenodd" />
        )),
      )}
    </g>
  );
}

/** North arrow with its letter, at (x, y). */
export function NorthArrow({ x, y, locale = "ar" }: { x: number; y: number; locale?: Locale }) {
  return (
    <g transform={`translate(${f1(x)} ${f1(y)})`}>
      <circle r={11} fill="var(--card)" fillOpacity={0.85} />
      <path d="M0 -8 L4 4 L0 1.5 L-4 4 Z" fill="var(--foreground)" />
      <text y={-12} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--foreground)">
        {tr(locale, "ش", "N")}
      </text>
    </g>
  );
}

/** A two-part scale bar `km` long, `px` wide, its left end at (x, y). */
export function ScaleBar({
  x,
  y,
  px,
  km,
  locale = "ar",
}: {
  x: number;
  y: number;
  px: number;
  km: number;
  locale?: Locale;
}) {
  return (
    <g transform={`translate(${f1(x)} ${f1(y)})`}>
      <rect x={-4} y={-15} width={px + 8} height={20} rx={3} fill="var(--card)" fillOpacity={0.85} />
      <rect x={0} y={-2} width={px / 2} height={4} fill="var(--foreground)" />
      <rect x={px / 2} y={-2} width={px / 2} height={4} fill="var(--card)" stroke="var(--foreground)" strokeWidth={0.6} />
      <text x={px / 2} y={-5} textAnchor="middle" fontSize={8} fill="var(--foreground)" direction="ltr">
        {num(km, locale)} {tr(locale, "كم", "km")}
      </text>
    </g>
  );
}

/** The terrain legend: one bar from the lowest to the highest ground. */
export function TerrainLegend({ locale = "ar" }: { locale?: Locale }) {
  const m = tr(locale, "م", "m");
  return (
    <div className="flex items-center gap-2 text-xs text-muted" dir="ltr">
      <span className="figure">
        {num(Math.round(ELEV_LO), locale)} {m}
      </span>
      <span
        className="h-2.5 flex-1 rounded-full border border-border"
        style={{ background: `linear-gradient(to right, ${[0, 0.3, 0.55, 0.8, 1].map((t) => tint(ELEV_LO + t * (ELEV_HI - ELEV_LO))).join(",")})` }}
      />
      <span className="figure">
        {num(Math.round(ELEV_HI), locale)} {m}
      </span>
    </div>
  );
}
