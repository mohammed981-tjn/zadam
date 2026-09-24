import Link from "next/link";
import { ROUTE } from "@/lib/arcCanal";
import {
  CELL_DEG,
  LAT_MAX,
  LAT_MIN,
  LON_MAX,
  LON_MIN,
  LAYERS,
  MAP_TOWNS,
  SUDAN_BORDER,
  bandIn,
  type Layer,
  type RainGrid,
} from "@/lib/rainMap";

/**
 * The rain grid drawn over Sudan: colour for the pattern, a number for the
 * amount.
 *
 * NORTH IS UP AND EAST IS RIGHT although the page is right-to-left — a map is
 * not text (the same rule as the canal map). The x axis is shrunk by cos 15°
 * so the country is not stretched east–west.
 *
 * Server-rendered SVG, no script: it scales to the screen and costs nothing
 * after the HTML arrives, which matters on the connections it is read on.
 */

const KX = Math.cos((15 * Math.PI) / 180);
const PLOT_W = 400;
const PLOT_H = (PLOT_W * (LAT_MAX - LAT_MIN)) / ((LON_MAX - LON_MIN) * KX);
const x = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * PLOT_W;
const y = (lat: number) => PLOT_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * PLOT_H;
const CW = x(LON_MIN + CELL_DEG);
const CH = PLOT_H - y(LAT_MIN + CELL_DEG);

const border = SUDAN_BORDER.map(
  ([lon, lat], i) => `${i === 0 ? "M" : "L"}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`,
).join("") + "Z";

/**
 * The Arc Canal on the national map. At this scale it is a small hook west
 * of Khartoum — 60 km end to end is about seven pixels across — which is the
 * honest size of it next to the country; the corridor map on /arc-canal is
 * where it is drawn to be read.
 */
const canalPath = ROUTE.map(
  (p, i) => `${i === 0 ? "M" : "L"}${x(p.lon).toFixed(1)} ${y(p.lat).toFixed(1)}`,
).join("");
const CANAL_INK = "#0e7c86";

const ar = (n: number) => Math.round(n).toLocaleString("ar", { useGrouping: false });

export default function RainMap({
  grid,
  layer = LAYERS[0],
  showTowns = true,
  showCanal = false,
  legend = true,
}: {
  grid: RainGrid;
  layer?: Layer;
  showTowns?: boolean;
  showCanal?: boolean;
  /** False when the page draws its own, fuller legend (the soil groups with what each means). */
  legend?: boolean;
}) {
  const clipId = "sudan-clip";
  // A cell with no value for this layer (elevation that failed to load) is
  // left out, so it shows as unpainted ground rather than as the lowest band.
  const cells = grid.cells.flatMap((c) => {
    const v = layer.value(c);
    return v == null ? [] : [{ ...c, v, band: bandIn(layer.bands, v) }];
  });
  return (
    <figure>
      <svg
        viewBox={`-4 -4 ${PLOT_W + 8} ${PLOT_H + 8}`}
        className="h-auto w-full"
        role="img"
        aria-label={`خريطة السودان: ${layer.note}، ${layer.unit}`}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={border} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <path d={border} fill="var(--card)" />
          {cells.map((c) => (
            <rect
              key={`${c.lon},${c.lat}`}
              x={x(c.lon - CELL_DEG / 2)}
              y={y(c.lat + CELL_DEG / 2)}
              width={CW}
              height={CH}
              fill={c.band.fill}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          ))}
        </g>
        <path d={border} fill="none" stroke="var(--foreground)" strokeWidth={1.2} />

        {showCanal && (
          <path
            d={canalPath}
            fill="none"
            stroke={CANAL_INK}
            strokeWidth={2.5}
            strokeLinecap="round"
            // A pale edge so the line reads on the dark soil and terrain bands.
            style={{ filter: "drop-shadow(0 0 1px var(--card))" }}
          />
        )}

        {cells
          .filter((c) => c.labelled && layer.numbers !== false)
          .map((c) => (
            <text
              key={`t${c.lon},${c.lat}`}
              x={x(c.pLon)}
              y={y(c.pLat) + (c.pLon === c.lon && c.pLat === c.lat && showTowns ? CH * 0.2 : 0)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.abs(c.v) >= 999.5 ? 8.5 : 11}
              fontWeight={700}
              fill={c.band.ink}
              // A halo in the cell's own colour, so a number near the border
              // stays legible where it runs past the clipped cell edge.
              stroke={c.band.fill}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {ar(c.v)}
            </text>
          ))}

        {showTowns &&
          MAP_TOWNS.map((t) => (
            <g key={t.name}>
              <circle cx={x(t.lon)} cy={y(t.lat)} r={2.5} fill="var(--danger)" />
              <text
                x={x(t.lon)}
                y={y(t.lat) + (t.above ? -5 : 11)}
                textAnchor="middle"
                fontSize={9}
                fill="var(--foreground)"
                stroke="var(--card)"
                strokeWidth={2.5}
                paintOrder="stroke"
              >
                {t.name}
              </text>
            </g>
          ))}
      </svg>

      <figcaption className="mt-3">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {legend && layer.bands.map((b) => (
            <li key={b.min} className="flex items-center gap-1">
              <span
                className="inline-block size-3.5 rounded-sm border border-border"
                style={{ background: b.fill }}
              />
              <span className="figure">{b.label}</span>
            </li>
          ))}
          {legend && <li className="text-muted">{layer.unit}</li>}
          {showCanal && (
            <li className="flex items-center gap-1">
              <span className="inline-block h-1 w-4 rounded-full" style={{ background: CANAL_INK }} />
              <Link href="/arc-canal" className="underline">مسار القناة القوسية</Link>
            </li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}
