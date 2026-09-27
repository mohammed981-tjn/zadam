import Link from "next/link";
import { ROUTE } from "@/lib/arcCanal";
import {
  BASE,
  NEIGHBOUR_LABELS,
  classRegions,
  isobands,
  townValues,
  type Bands,
  type Pt,
  type Shape,
} from "@/lib/mapDraw";
import { CELL_DEG, LAYERS, SUDAN_BORDER, type Layer, type RainGrid } from "@/lib/rainMap";

/**
 * خريطة السودان: الطبقة المختارة فوق أساسٍ جغرافيّ.
 *
 * What makes it a map and not a chart:
 *  - the ground: the neighbours in a quiet grey with their names, the Red
 *    Sea, the Nile and its tributaries, the lakes, and the state lines, so a
 *    reader finds their own place before they read a colour;
 *  - the data as smooth bands (src/lib/mapDraw.ts), not a grid of squares;
 *  - numbers where people look for them — at the towns — rather than in
 *    every square;
 *  - a north arrow, a scale bar and the degree marks, and a legend drawn as
 *    one stepped bar.
 *
 * NORTH IS UP AND EAST IS RIGHT although the page is right-to-left — a map is
 * not text. The x axis is shrunk by cos 16° so the country is not stretched.
 * Server-rendered SVG with no script: it costs nothing after the HTML
 * arrives, which matters on the connections it is read on.
 */

const { west, south, east, north } = BASE.frame;
const KX = Math.cos((16 * Math.PI) / 180);
export const W = 400;
export const H = (W * (north - south)) / ((east - west) * KX);
export const x = (lon: number) => ((lon - west) / (east - west)) * W;
export const y = (lat: number) => H - ((lat - south) / (north - south)) * H;
export const f1 = (n: number) => n.toFixed(1);

export const ringPath = (ring: readonly (readonly [number, number])[], close = true) =>
  ring.map(([lon, lat], i) => `${i ? "L" : "M"}${f1(x(lon))} ${f1(y(lat))}`).join("") + (close ? "Z" : "");
const shapePath = (shape: Shape) => shape.map((r) => ringPath(r)).join("");

export const BORDER = ringPath(SUDAN_BORDER);
const CANAL = ringPath(ROUTE.map((p) => [p.lon, p.lat] as Pt), false);
const CANAL_INK = "#0e7c86";

export const arDigits = (n: number) => Math.round(n).toLocaleString("ar-SA", { useGrouping: false });

/** 200 km at 15°N, in degrees of longitude. */
const SCALE_KM = 200;
const SCALE_DEG = SCALE_KM / (111.32 * Math.cos((15 * Math.PI) / 180));

export function Ground() {
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill="var(--map-sea)" />
      {BASE.neighbours.map((n, k) => (
        <path key={k} d={ringPath(n.ring)} fill="var(--map-land)" stroke="var(--map-land-edge)" strokeWidth={0.7} />
      ))}
      {NEIGHBOUR_LABELS.map((n) => (
        <text key={n.name} x={x(n.lon)} y={y(n.lat)} textAnchor="middle" fontSize={8.5} fill="var(--map-label)">
          {n.name}
        </text>
      ))}
      <text x={x(38.25)} y={y(21.25)} textAnchor="middle" fontSize={8} fontStyle="italic" fill="var(--map-water)">
        <tspan x={x(38.25)}>البحر</tspan>
        <tspan x={x(38.25)} dy={9}>
          الأحمر
        </tspan>
      </text>
    </>
  );
}

export function Water() {
  return (
    <g>
      {BASE.rivers.map((r, k) => (
        <g key={k} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={ringPath(r.line, false)} stroke="var(--card)" strokeWidth={r.main ? 3.4 : 2.2} opacity={0.8} />
          <path d={ringPath(r.line, false)} stroke="var(--map-water)" strokeWidth={r.main ? 1.8 : 1} />
        </g>
      ))}
      {BASE.lakes.map((l, k) => (
        <path key={k} d={ringPath(l.ring)} fill="var(--map-water)" stroke="var(--card)" strokeWidth={0.5} />
      ))}
    </g>
  );
}

/**
 * North arrow and scale bar together in the top-left corner, over Libya,
 * where nothing else is drawn; the degree marks along the top and right.
 */
export function Furniture() {
  const sx = x(22.4);
  const sy = y(23.25);
  const sw = x(22.4 + SCALE_DEG) - sx;
  return (
    <g fill="var(--foreground)" fontSize={7.5}>
      {/* north arrow */}
      <g transform={`translate(${f1(x(21.55))} ${f1(y(23.25))})`}>
        <path d="M0 -9 L4 3 L0 0.5 L-4 3 Z" fill="var(--foreground)" />
        <text y={12} textAnchor="middle" fontSize={8} fontWeight={700}>
          ش
        </text>
      </g>
      {/* scale bar, two halves */}
      <g transform={`translate(${f1(sx)} ${f1(sy)})`}>
        <rect x={0} y={-3} width={sw / 2} height={3} fill="var(--foreground)" />
        <rect x={sw / 2} y={-3} width={sw / 2} height={3} fill="var(--card)" stroke="var(--foreground)" strokeWidth={0.5} />
        <text x={sw / 2} y={-5.5} textAnchor="middle" direction="ltr">
          {arDigits(SCALE_KM)} كم
        </text>
      </g>
      {/* degree marks on the frame */}
      {[25, 30, 35].map((lon) => (
        <g key={`lon${lon}`} fill="var(--map-label)">
          <line x1={x(lon)} x2={x(lon)} y1={0} y2={4} stroke="var(--map-label)" strokeWidth={0.6} />
          <text x={x(lon)} y={12} textAnchor="middle" fontSize={7}>
            {arDigits(lon)}° ق
          </text>
        </g>
      ))}
      {[10, 15, 20].map((lat) => (
        <g key={`lat${lat}`} fill="var(--map-label)">
          <line x1={W} x2={W - 4} y1={y(lat)} y2={y(lat)} stroke="var(--map-label)" strokeWidth={0.6} />
          <text x={W - 6} y={y(lat) + 2.5} textAnchor="end" fontSize={7} direction="ltr">
            {arDigits(lat)}° ش
          </text>
        </g>
      ))}
    </g>
  );
}

function BandsDrawn({ bands, layer }: { bands: Bands; layer: Layer }) {
  return (
    <>
      <path d={BORDER} fill={layer.bands[bands.base].fill} />
      {bands.bands.map((b) =>
        b.shapes.map((s, k) => (
          <path key={`${b.band}-${k}`} d={shapePath(s)} fill={layer.bands[b.band].fill} fillRule="evenodd" />
        )),
      )}
    </>
  );
}

const SIDES = {
  r: { dx: 5, dy: 3, anchor: "start" },
  l: { dx: -5, dy: 3, anchor: "end" },
  t: { dx: 0, dy: -5, anchor: "middle" },
  b: { dx: 0, dy: 11, anchor: "middle" },
} as const;

export function Label({
  t,
  strong,
}: {
  t: { name: string; lon: number; lat: number; side: keyof typeof SIDES };
  strong: string | null;
}) {
  const cx = x(t.lon);
  const cy = y(t.lat);
  const pos = SIDES[t.side];
  return (
    <g>
      <circle cx={cx} cy={cy} r={2.3} fill="var(--foreground)" stroke="var(--card)" strokeWidth={1} />
      <text
        x={cx + pos.dx}
        y={cy + pos.dy}
        textAnchor={pos.anchor}
        direction="ltr"
        fontSize={8.5}
        fill="var(--foreground)"
        stroke="var(--card)"
        strokeWidth={2.6}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {t.name}
        {strong != null && (
          <tspan fontWeight={800} fontSize={9.5}>
            {" "}
            {strong}
          </tspan>
        )}
      </text>
    </g>
  );
}

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
  const clipId = `sudan-${layer.key}`;
  const bands =
    layer.key === "soil" ? classRegions(grid.cells) : layer.key === "lands" ? null : isobands(grid.cells, layer);
  const towns = townValues(grid.cells, layer);
  const lands = layer.key === "lands" ? grid.cells.filter((c) => c.lands) : [];
  const fmt = (v: number) => (layer.key === "rain" && v < 0.5 ? "٠" : arDigits(v));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${f1(H)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`خريطة السودان: ${layer.note}، ${layer.unit}`}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={BORDER} />
          </clipPath>
          <clipPath id={`${clipId}-frame`}>
            <rect x={0} y={0} width={W} height={H} rx={10} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId}-frame)`}>
          <Ground />

          <g clipPath={`url(#${clipId})`}>
            {bands ? <BandsDrawn bands={bands} layer={layer} /> : <path d={BORDER} fill="var(--card)" />}
            {/* State lines: approximate (Natural Earth), there to find one's place. */}
            <g fill="none" stroke="var(--map-state)" strokeWidth={0.7} strokeDasharray="3 2">
              {BASE.states.map((s, k) => (
                <path key={k} d={ringPath(s.ring)} />
              ))}
            </g>
          </g>

          <Water />
          <path d={BORDER} fill="none" stroke="var(--foreground)" strokeWidth={1.2} strokeLinejoin="round" />

          {showCanal && <path d={CANAL} fill="none" stroke={CANAL_INK} strokeWidth={2.6} strokeLinecap="round" />}

          {lands.map((c) => {
            const r = 5 + 3 * Math.sqrt(c.lands!);
            return (
              <g key={`${c.lon},${c.lat}`}>
                <circle cx={x(c.lon)} cy={y(c.lat)} r={r} fill="#2a6424" fillOpacity={0.85} stroke="var(--card)" strokeWidth={1} />
                <text x={x(c.lon)} y={y(c.lat) + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#ffffff">
                  {arDigits(c.lands!)}
                </text>
              </g>
            );
          })}

          {/*
            No verified land listed yet: say so on the map itself. An empty
            white country read as an unfinished map (the owner, 27 September).
          */}
          {layer.key === "lands" && lands.length === 0 && (
            <g>
              <rect x={W / 2 - 118} y={H * 0.44 - 22} width={236} height={40} rx={8} fill="var(--card)" stroke="var(--border)" />
              <text x={W / 2} y={H * 0.44 - 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--foreground)">
                لا أراضٍ موثّقة معروضة بعد
              </text>
              <text x={W / 2} y={H * 0.44 + 11} textAnchor="middle" fontSize={9} fill="var(--muted)">
                تظهر هنا حين يوثّق المزارعون أراضيهم ويعرضونها
              </text>
            </g>
          )}

          {showTowns &&
            towns.map((t) => (
              <Label key={t.name} t={t} strong={t.value == null || layer.key === "lands" ? null : fmt(t.value)} />
            ))}

          <Furniture />
        </g>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="var(--border)" rx={10} />
      </svg>

      <figcaption className="mt-3 flex flex-col gap-2">
        {legend && layer.key !== "lands" && <StepLegend layer={layer} />}
        {legend && layer.key === "lands" && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block size-4 rounded-full" style={{ background: "#2a6424" }} />
            الرقم عدد الأراضي الموثّقة في المربّع (نحو {arDigits(CELL_DEG * 111)} كم)
          </p>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-5 rounded-full" style={{ background: "var(--map-water)" }} />
            النيل وروافده
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t border-dashed border-muted" />
            حدود الولايات (تقريبية)
          </li>
          {showCanal && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded-full" style={{ background: CANAL_INK }} />
              <Link href="/arc-canal" className="underline">
                مسار القناة القوسية
              </Link>
            </li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}

/**
 * One bar in the bands' colours with the thresholds under it — the way a
 * weather map's key is drawn, and easier to match against the map than a
 * list of swatches. Low values on the left, as on every such bar.
 */
function StepLegend({ layer }: { layer: Layer }) {
  return (
    <div className="flex flex-col gap-1" dir="ltr">
      <div className="flex h-3 overflow-hidden rounded-full border border-border">
        {layer.bands.map((b) => (
          <span key={b.min} className="flex-1" style={{ background: b.fill }} />
        ))}
      </div>
      <div className="flex text-[10px] leading-tight text-muted">
        {layer.bands.map((b) => (
          <span key={b.min} className="figure flex-1 text-center" dir="rtl">
            {b.label}
          </span>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted" dir="rtl">
        {layer.unit}
      </p>
    </div>
  );
}
