import raw from "../../data/sudan-minerals.json";
import { BASE, MAP_LABELS } from "@/lib/mapDraw";
import { BORDER, Furniture, Ground, H, Label, W, Water, arDigits, f1, ringPath, x, y } from "@/components/RainMap";

/**
 * خريطة معادن السودان — المناجم والمصانع والحقول والرواسب المعروفة.
 *
 * The owner, 27 September: «هل هناك خرائط لتوزيع المعادن في السودان». The
 * data is the USGS Africa mineral-industries compilation (2021, public
 * domain), clipped to Sudan by .github/workflows/sudan-minerals.yml and
 * reduced by scripts/build-sudan-minerals.ts. Status is as USGS recorded it
 * for 2018 — before the war — and the page says so; it is where the minerals
 * are, not who is working them today.
 *
 * Colour is the commodity group (what a reader looks for first); shape is
 * the kind of site, because a mine and a known deposit are different claims.
 * Same base as the rain map, server-rendered SVG, no script.
 */

export type MineralSite = {
  kind: "facility" | "deposit" | "exploration";
  name: string;
  place: string | null;
  what: string;
  commodity: string;
  commodityAr: string;
  also: string[];
  group: "gold" | "metal" | "fuel" | "industrial";
  state: string | null;
  status: string | null;
  operator: string | null;
  lon: number;
  lat: number;
};

export const MINERALS = raw as { source: string; asOf: number; sites: MineralSite[] };

export const GROUPS: Record<MineralSite["group"], { label: string; ink: string }> = {
  gold: { label: "ذهب وفضة", ink: "#d4a017" },
  metal: { label: "معادن فلزّية (نحاس، كروم، حديد…)", ink: "#b5562b" },
  fuel: { label: "نفط", ink: "#5b3a8c" },
  industrial: { label: "معادن صناعية (إسمنت، جبس، ملح…)", ink: "#6b7280" },
};

export const KINDS: Record<MineralSite["kind"], string> = {
  facility: "منشأة: منجم أو مصنع أو حقل",
  deposit: "رواسب معروفة",
  exploration: "موقع استكشاف",
};

/** Towns kept few, so the sites stay readable on a phone. */
const TOWNS = new Set(["بورتسودان", "الخرطوم", "عطبرة", "دنقلا", "الأبيض", "الفاشر", "نيالا", "كسلا", "الدمازين"]);

export function Mark({ kind, ink, cx, cy, r = 4 }: { kind: MineralSite["kind"]; ink: string; cx: number; cy: number; r?: number }) {
  const common = { fill: ink, stroke: "#ffffff", strokeWidth: 0.9 };
  if (kind === "deposit")
    return <path d={`M${f1(cx)} ${f1(cy - r * 1.3)}L${f1(cx + r * 1.3)} ${f1(cy)}L${f1(cx)} ${f1(cy + r * 1.3)}L${f1(cx - r * 1.3)} ${f1(cy)}Z`} {...common} />;
  if (kind === "exploration")
    return <path d={`M${f1(cx)} ${f1(cy - r * 1.3)}L${f1(cx + r * 1.2)} ${f1(cy + r)}L${f1(cx - r * 1.2)} ${f1(cy + r)}Z`} {...common} />;
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

export default function MineralsMap() {
  // Facilities first so the rarer deposits and exploration sites sit on top.
  const order = { facility: 0, deposit: 1, exploration: 2 } as const;
  const sites = [...MINERALS.sites].sort((a, b) => order[a.kind] - order[b.kind]);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${f1(H)}`} className="h-auto w-full" role="img" aria-label={`خريطة السودان: ${arDigits(sites.length)} موقعاً معدنياً`}>
        <defs>
          <clipPath id="minerals-sudan">
            <path d={BORDER} />
          </clipPath>
          <clipPath id="minerals-frame">
            <rect x={0} y={0} width={W} height={H} rx={10} />
          </clipPath>
        </defs>

        <g clipPath="url(#minerals-frame)">
          <Ground />
          <g clipPath="url(#minerals-sudan)">
            <path d={BORDER} fill="var(--card)" />
            <g fill="none" stroke="var(--map-state)" strokeWidth={0.7} strokeDasharray="3 2">
              {BASE.states.map((s, k) => (
                <path key={k} d={ringPath(s.ring)} />
              ))}
            </g>
          </g>
          <Water />
          <path d={BORDER} fill="none" stroke="var(--foreground)" strokeWidth={1.2} strokeLinejoin="round" />

          {MAP_LABELS.filter((t) => TOWNS.has(t.name)).map((t) => (
            <Label key={t.name} t={t} strong={null} />
          ))}

          {sites.map((s, k) => (
            <g key={k}>
              <title>{`${s.commodityAr} — ${s.place ?? s.name}`}</title>
              <Mark kind={s.kind} ink={GROUPS[s.group].ink} cx={x(s.lon)} cy={y(s.lat)} />
            </g>
          ))}

          <Furniture />
        </g>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="var(--border)" rx={10} />
      </svg>

      <figcaption className="mt-3 flex flex-col gap-2 text-xs text-muted">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(GROUPS).map(([key, g]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full" style={{ background: g.ink }} />
              {g.label}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(KINDS) as MineralSite["kind"][]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
                <Mark kind={k} ink="var(--foreground)" cx={7} cy={7} r={4.2} />
              </svg>
              {KINDS[k]}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
