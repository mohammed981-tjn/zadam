import { BuiltUp, NorthArrow, ScaleBar, Terrain, Water } from "@/components/map/CorridorGround";
import {
  ROUTE,
  PLACES,
  LOW_LIFT_SEGMENT,
  prominence,
  RIDGE_PROMINENCE_M,
  type GeoPoint,
} from "@/lib/arcCanal";
import { placeName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

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
 * The ground under it is real: the terrain in soft bands, the built-up land
 * of Omdurman and Khartoum, and the Nile and the Jebel Aulia reservoir traced
 * from where ESA WorldCover finds water — a study argued entirely in terms of
 * distance from the Nile deserves a Nile that is where the Nile is.
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

export default function ArcCanalMap({ locale = "ar" }: { locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const ridges = ROUTE.filter(
    (_, i) => prominence(ROUTE, i) >= RIDGE_PROMINENCE_M,
  );
  const lowLift = ROUTE.slice(LOW_LIFT_SEGMENT.from, LOW_LIFT_SEGMENT.to + 1);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{t("المسار على الخريطة", "The route on the map")}</h3>
        <p className="text-sm leading-relaxed text-muted">
          {t(
            "القوس من خزان جبل أولياء جنوباً إلى السروراب شمالاً، وأقصى غربه ٢٨ كم غرب أم درمان. الشمال إلى أعلى.",
            "The arc runs from the Jebel Aulia reservoir in the south to Sarurab in the north, its westernmost point 28 km west of Omdurman. North is up.",
          )}
        </p>
      </figcaption>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-auto w-full max-w-md"
          role="img"
          aria-label={t(
            "خريطة تخطيطية: القناة القوسية غرب أم درمان بين خزان جبل أولياء والسروراب، مع مجرى النيلين الأبيض والأزرق والنيل الرئيسي",
            "Sketch map: the Arc Canal west of Omdurman between the Jebel Aulia reservoir and Sarurab, with the White Nile, the Blue Nile and the main Nile",
          )}
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

          <g clipPath="url(#arc-canal-frame)">
            <Terrain p={{ x, y }} opacity={0.7} />
            <BuiltUp p={{ x, y }} />
            <Water p={{ x, y }} />
          </g>
          <rect x={PAD} y={PAD} width={PLOT_W} height={PLOT_H} fill="none" stroke="var(--border)" />
          <g fontSize={10} fontStyle="italic" fill="var(--map-water)" stroke="var(--card)" strokeWidth={2.5} paintOrder="stroke" textAnchor="middle">
            <text x={x(32.51)} y={y(15.38)}>{t("النيل الأبيض", "White Nile")}</text>
            <text x={x(32.575)} y={y(15.545)}>{t("النيل الأزرق", "Blue Nile")}</text>
          </g>

          {/* The canal, on a pale casing so it reads over every ground. */}
          <path
            d={path(ROUTE)}
            fill="none"
            stroke="var(--card)"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
                {r.elevation} {t("م", "m")}
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
                fontWeight={600}
                fill="var(--color-foreground)"
                stroke="var(--color-card)"
                strokeWidth={2.5}
                paintOrder="stroke"
              >
                {placeName(p.name, locale)}
              </text>
            </g>
          ))}

          {/* Scale bar — a drawing that cannot be measured is a picture. */}
          <ScaleBar x={PAD + 8} y={PAD + PLOT_H - 10} px={scaleWidth} km={SCALE_KM} locale={locale} />
          <NorthArrow x={PAD + PLOT_W - 16} y={PAD + 28} locale={locale} />
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="inline-block h-1 w-6 rounded bg-primary" />
          {t("مسار القناة (٩٤ كم)", "Canal route (94 km)")}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded bg-accent" />
          {t("الأرض على منسوب الخزان — النواة المقترحة", "Ground at reservoir level — the proposed core")}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-danger" />
          {t("الحاجزان", "The two ridges")}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded" style={{ background: "var(--map-water)" }} />
          {t("النيل وخزان جبل أولياء", "The Nile and the Jebel Aulia reservoir")}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded" style={{ background: "#c9a6a0" }} />
          {t("المباني (أم درمان والخرطوم)", "Built-up land (Omdurman and Khartoum)")}
        </li>
      </ul>

      <p className="text-xs text-muted">
        {t(
          "الماء والمباني من خريطة الغطاء الأرضي ESA WorldCover ٢٠٢١، والتضاريس من Copernicus، وارتفاعات المسار من SRTM ٣٠ م.",
          "Water and buildings from the ESA WorldCover 2021 land-cover map, terrain from Copernicus, and the route's elevations from 30 m SRTM.",
        )}
      </p>
    </figure>
  );
}
