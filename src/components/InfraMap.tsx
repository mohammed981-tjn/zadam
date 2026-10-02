import raw from "../../data/sudan-infra.json";
import type { InfraData } from "@/lib/infra";
import { BASE, MAP_LABELS } from "@/lib/mapDraw";
import { BORDER, Furniture, Ground, H, Label, W, Relief, Water, arDigits, f1, ringPath, x, y } from "@/components/RainMap";

/**
 * الطرق والسكك الحديدية والكهرباء على خريطة السودان.
 *
 * The owner, 27 September, of the other USGS layers: «كل ما ذكرتها نفذها».
 * For a farmer or a trader these answer two questions: how does a crop get
 * from here to a market or to Port Sudan (roads, rail, the port), and where
 * could a pump run on the grid rather than on diesel (power lines and
 * stations). Data from scripts/build-sudan-infra.ts; it predates the war, so
 * a line drawn is a line built, not a line working today — the page says so.
 *
 * Same base as the rain map, server-rendered SVG, no script.
 */

export const INFRA = raw as InfraData;

export const FUEL_INK: Record<InfraData["stations"][number]["fuel"], { label: string; ink: string }> = {
  hydro: { label: "مائية (سدود وخزّانات)", ink: "#0e7c86" },
  thermal: { label: "حرارية (وقود وديزل وغاز)", ink: "#c2410c" },
  biomass: { label: "كتلة حيوية (مصانع السكر)", ink: "#4d7c0f" },
};

const ROAD_INK = "#a1673f";
const RAIL_INK = "#1f2937";
/** By voltage: the backbone reads first. */
const powerInk = (kv: number) => (kv >= 400 ? "#b91c1c" : kv >= 200 ? "#ea580c" : "#f59e0b");
const powerWidth = (kv: number) => (kv >= 400 ? 1.6 : kv >= 200 ? 1.1 : 0.7);

const line = (l: [number, number][]) => ringPath(l, false);
const TOWNS = new Set(["بورتسودان", "الخرطوم", "عطبرة", "دنقلا", "الأبيض", "الفاشر", "نيالا", "كسلا", "الدمازين", "كوستي"]);

export default function InfraMap() {
  const port = INFRA.ports[0];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${f1(H)}`} className="h-auto w-full" role="img" aria-label="خريطة السودان: الطرق والسكك الحديدية وخطوط الكهرباء ومحطاتها">
        <defs>
          <clipPath id="infra-sudan">
            <path d={BORDER} />
          </clipPath>
          <clipPath id="infra-frame">
            <rect x={0} y={0} width={W} height={H} rx={10} />
          </clipPath>
        </defs>

        <g clipPath="url(#infra-frame)">
          <Ground />
          <g clipPath="url(#infra-sudan)">
            <path d={BORDER} fill="var(--card)" />
            <g fill="none" stroke="var(--map-state)" strokeWidth={0.7} strokeDasharray="3 2">
              {BASE.states.map((s, k) => (
                <path key={k} d={ringPath(s.ring)} />
              ))}
            </g>
          </g>
          <Relief />
          <Water />

          <g clipPath="url(#infra-sudan)" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={INFRA.roads.map(line).join("")} stroke={ROAD_INK} strokeWidth={0.8} opacity={0.75} />
            {/* Rail as a railway is drawn on a map: a dark line with pale ties. */}
            <path d={INFRA.rail.map(line).join("")} stroke={RAIL_INK} strokeWidth={1.6} />
            <path d={INFRA.rail.map(line).join("")} stroke="var(--card)" strokeWidth={0.8} strokeDasharray="2 2" />
            {INFRA.power.map((p, k) => (
              <path key={k} d={line(p.line)} stroke={powerInk(p.kv)} strokeWidth={powerWidth(p.kv)} />
            ))}
          </g>

          <path d={BORDER} fill="none" stroke="var(--foreground)" strokeWidth={1.2} strokeLinejoin="round" />

          {MAP_LABELS.filter((t) => TOWNS.has(t.name)).map((t) => (
            <Label key={t.name} t={t} strong={null} />
          ))}

          {/* Largest last, so a big station is not hidden under a small one. */}
          {[...INFRA.stations].reverse().map((s, k) => (
            <circle
              key={k}
              cx={x(s.lon)}
              cy={y(s.lat)}
              r={s.mw ? 2.2 + Math.sqrt(s.mw) / 4 : 2.2}
              fill={FUEL_INK[s.fuel].ink}
              fillOpacity={0.85}
              stroke="#ffffff"
              strokeWidth={0.8}
            >
              <title>{`${s.nameAr ?? s.name}${s.mw ? ` — ${arDigits(s.mw)} ميغاواط` : ""}`}</title>
            </circle>
          ))}

          {port && (
            <g transform={`translate(${f1(x(port.lon))} ${f1(y(port.lat))})`}>
              <rect x={-4} y={-4} width={8} height={8} rx={1.5} fill="#1d4ed8" stroke="#ffffff" strokeWidth={1} />
              <title>ميناء بورتسودان</title>
            </g>
          )}

          <Furniture />
        </g>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="var(--border)" rx={10} />
      </svg>

      <figcaption className="mt-3 flex flex-col gap-2 text-xs text-muted">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: ROAD_INK }} />
            الطرق الرئيسية
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-5" style={{ background: `repeating-linear-gradient(90deg, ${RAIL_INK} 0 3px, #ffffff 3px 5px)`, outline: `1px solid ${RAIL_INK}` }} />
            السكك الحديدية
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-5" style={{ background: powerInk(500) }} />
            كهرباء ٤٠٠–٥٠٠ ك.ف
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: powerInk(220) }} />
            ٢٠٠–٢٣٠ ك.ف
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-px w-5" style={{ background: powerInk(110) }} />
            أقلّ من ٢٠٠ ك.ف
          </li>
        </ul>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(FUEL_INK).map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full" style={{ background: v.ink }} />
              محطة {v.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm" style={{ background: "#1d4ed8" }} />
            ميناء بورتسودان (بضائع، ونفط وغاز)
          </li>
        </ul>
        <p>حجم الدائرة بقدرة المحطة.</p>
      </figcaption>
    </figure>
  );
}
