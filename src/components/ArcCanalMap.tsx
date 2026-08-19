import {
  ROUTE,
  WHITE_NILE,
  BLUE_NILE,
  MAIN_NILE,
  PLACES,
  LOW_LIFT_SEGMENT,
  prominence,
  RIDGE_PROMINENCE_M,
  type GeoPoint,
} from "@/lib/arcCanal";

/**
 * The route in plan, over the real river.
 *
 * NORTH IS UP AND EAST IS RIGHT, even though the page is right-to-left. A map
 * is not text: mirroring it to match the reading direction would put the Nile
 * west of Omdurman, and a reader who knows the ground would stop trusting
 * everything else on the page. Only the labels are RTL.
 *
 * The aspect ratio is corrected for latitude. A degree of longitude at 15.5°N
 * is 107.3 km against 110.6 km for a degree of latitude, so drawing the box
 * square would stretch the arc east-west by about 3% and flatter the geometry
 * argument this page rests on.
 *
 * Rivers come from OpenStreetMap rather than being drawn by eye — a study
 * argued entirely in terms of distance from the Nile deserves a Nile that is
 * where the Nile is.
 */

const LAT_MIN = 15.2;
const LAT_MAX = 15.84;
const LON_MIN = 32.16;
const LON_MAX = 32.6;

const PAD = 46;
const KM_PER_LAT = 110.6;
const KM_PER_LON = 107.3; // at 15.5°N

const WIDTH_KM = (LON_MAX - LON_MIN) * KM_PER_LON;
const HEIGHT_KM = (LAT_MAX - LAT_MIN) * KM_PER_LAT;

const PLOT_W = 380;
const PLOT_H = (PLOT_W * HEIGHT_KM) / WIDTH_KM;
const W = PLOT_W + PAD * 2;
const H = PLOT_H + PAD * 2;

const x = (lon: number) =>
  PAD + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * PLOT_W;
const y = (lat: number) =>
  PAD + PLOT_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * PLOT_H;

const path = (pts: GeoPoint[]) =>
  pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.lon).toFixed(1)} ${y(p.lat).toFixed(1)}`)
    .join(" ");

/** A 10 km bar, so the reader can measure the drawing instead of trusting it. */
const SCALE_KM = 10;
const scaleWidth = (SCALE_KM / WIDTH_KM) * PLOT_W;

export default function ArcCanalMap() {
  const ridges = ROUTE.filter(
    (_, i) => prominence(ROUTE, i) >= RIDGE_PROMINENCE_M,
  );
  const lowLift = ROUTE.slice(LOW_LIFT_SEGMENT.from, LOW_LIFT_SEGMENT.to + 1);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">المسار على الخريطة</h3>
        <p className="text-sm leading-relaxed text-muted">
          القوس من خزان جبل أولياء جنوباً إلى السروراب شمالاً، وأقصى غربه ٢٨ كم
          غرب أم درمان. الشمال إلى أعلى.
        </p>
      </figcaption>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-auto w-full max-w-md"
          role="img"
          aria-label="خريطة تخطيطية: القناة القوسية غرب أم درمان بين خزان جبل أولياء والسروراب، مع مجرى النيلين الأبيض والأزرق والنيل الرئيسي"
        >
          {/*
            The rivers run off the edge of the frame, because they run off the
            edge in reality — the Nile does not begin at Jebel Aulia or stop at
            Sarurab. Clipping to the plot rectangle is what makes that read as a
            map rather than as three curves that happen to end.
          */}
          <defs>
            <clipPath id="arc-canal-frame">
              <rect x={PAD} y={PAD} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>

          <g
            clipPath="url(#arc-canal-frame)"
            className="text-sky-700 dark:text-sky-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={path(WHITE_NILE)} />
            <path d={path(BLUE_NILE)} />
            <path d={path(MAIN_NILE)} strokeWidth={4} />
          </g>
          <text
            x={x(32.475)}
            y={y(15.36)}
            fontSize={10}
            className="fill-sky-700 dark:fill-sky-400"
            textAnchor="middle"
          >
            النيل الأبيض
          </text>
          <text
            x={x(32.575)}
            y={y(15.52)}
            fontSize={10}
            className="fill-sky-700 dark:fill-sky-400"
            textAnchor="middle"
          >
            النيل الأزرق
          </text>

          {/* The canal. */}
          <path
            d={path(ROUTE)}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* The stretch at reservoir level — the corrected pilot location. */}
          <path
            d={path(lowLift)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.85}
          />

          {/* Ridges: the two obstacles, by prominence. */}
          {ridges.map((r) => (
            <g key={r.index}>
              <circle
                cx={x(r.lon)}
                cy={y(r.lat)}
                r={5}
                fill="var(--color-danger)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
              <text
                x={x(r.lon) - 9}
                y={y(r.lat) + 4}
                fontSize={10}
                textAnchor="end"
                fill="var(--color-foreground)"
              >
                {r.elevation} م
              </text>
            </g>
          ))}

          {/* Places. */}
          {PLACES.map((p) => (
            <g key={p.name}>
              <circle
                cx={x(p.lon)}
                cy={y(p.lat)}
                r={3.5}
                fill="var(--color-foreground)"
              />
              <text
                x={x(p.lon) + 7}
                y={y(p.lat) + 4}
                fontSize={10}
                fill="var(--color-foreground)"
              >
                {p.name}
              </text>
            </g>
          ))}

          {/* Scale bar — a drawing that cannot be measured is a picture. */}
          <g transform={`translate(${PAD}, ${H - 18})`}>
            <line
              x1={0}
              x2={scaleWidth}
              y1={0}
              y2={0}
              stroke="var(--color-foreground)"
              strokeWidth={2}
            />
            <line x1={0} x2={0} y1={-4} y2={4} stroke="var(--color-foreground)" strokeWidth={2} />
            <line
              x1={scaleWidth}
              x2={scaleWidth}
              y1={-4}
              y2={4}
              stroke="var(--color-foreground)"
              strokeWidth={2}
            />
            <text x={scaleWidth / 2} y={-8} fontSize={10} textAnchor="middle" fill="var(--color-muted)">
              {SCALE_KM} كم
            </text>
          </g>

          {/* North arrow. */}
          <g transform={`translate(${W - PAD + 6}, ${PAD + 4})`}>
            <line x1={0} x2={0} y1={16} y2={0} stroke="var(--color-muted)" strokeWidth={1.5} />
            <path d="M -4 5 L 0 -2 L 4 5 Z" fill="var(--color-muted)" />
            <text x={0} y={30} fontSize={10} textAnchor="middle" fill="var(--color-muted)">
              ش
            </text>
          </g>
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="inline-block h-1 w-6 rounded bg-primary" />
          مسار القناة (٩٤ كم)
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded bg-accent" />
          الأرض على منسوب الخزان — النواة المقترحة
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-danger" />
          الحاجزان
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-1 w-6 rounded bg-sky-700 dark:bg-sky-400" />
          النيل
        </li>
      </ul>

      <p className="text-xs text-muted">
        مجرى النهر من OpenStreetMap ومساهميه (ODbL)، والارتفاعات من SRTM ٣٠ م.
      </p>
    </figure>
  );
}
