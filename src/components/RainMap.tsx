import {
  CELL_DEG,
  LAT_MAX,
  LAT_MIN,
  LON_MAX,
  LON_MIN,
  RAIN_BANDS,
  SUDAN_BORDER,
  bandFor,
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
 * A few towns so the reader can find their own place on the grid.
 *
 * With towns on, each cell's number drops to the lower part of its cell, and
 * each name sits above or below its dot — whichever side is clear of that
 * cell's number. Chosen by hand for these six and pinned by looking at it:
 * a seventh town needs the same check.
 */
const TOWNS: { name: string; lon: number; lat: number; above: boolean }[] = [
  { name: "الخرطوم", lon: 32.53, lat: 15.6, above: true },
  { name: "بورتسودان", lon: 37.22, lat: 19.62, above: true },
  { name: "القضارف", lon: 35.39, lat: 14.03, above: true },
  { name: "الأبيض", lon: 30.22, lat: 13.18, above: false },
  { name: "نيالا", lon: 24.88, lat: 12.05, above: true },
  { name: "دنقلا", lon: 30.48, lat: 19.17, above: false },
];

const ar = (n: number) => Math.round(n).toLocaleString("ar");

export default function RainMap({
  grid,
  showTowns = true,
}: {
  grid: RainGrid;
  showTowns?: boolean;
}) {
  const clipId = "sudan-clip";
  return (
    <figure>
      <svg
        viewBox={`-4 -4 ${PLOT_W + 8} ${PLOT_H + 8}`}
        className="h-auto w-full"
        role="img"
        aria-label="خريطة السودان ملوّنةً بمجموع المطر المتوقّع للأيام السبعة القادمة، بالمليمتر"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={border} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <path d={border} fill="var(--card)" />
          {grid.cells.map((c) => (
            <rect
              key={`${c.lon},${c.lat}`}
              x={x(c.lon - CELL_DEG / 2)}
              y={y(c.lat + CELL_DEG / 2)}
              width={CW}
              height={CH}
              fill={bandFor(c.rainMm).fill}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          ))}
        </g>
        <path d={border} fill="none" stroke="var(--foreground)" strokeWidth={1.2} />

        {grid.cells
          .filter((c) => c.labelled)
          .map((c) => (
            <text
              key={`t${c.lon},${c.lat}`}
              x={x(c.lon)}
              y={y(c.lat) + (showTowns ? CH * 0.2 : 0)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={700}
              fill={bandFor(c.rainMm).ink}
              // A halo in the cell's own colour, so a number near the border
              // stays legible where it runs past the clipped cell edge.
              stroke={bandFor(c.rainMm).fill}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {ar(c.rainMm)}
            </text>
          ))}

        {showTowns &&
          TOWNS.map((t) => (
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
          {RAIN_BANDS.map((b) => (
            <li key={b.min} className="flex items-center gap-1">
              <span
                className="inline-block size-3.5 rounded-sm border border-border"
                style={{ background: b.fill }}
              />
              <span className="figure">{b.label}</span>
            </li>
          ))}
          <li className="text-muted">مليمتر في ٧ أيام</li>
        </ul>
      </figcaption>
    </figure>
  );
}
