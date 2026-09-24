import {
  ROUTE,
  PLACES,
  WHITE_NILE,
  BLUE_NILE,
  MAIN_NILE,
  distanceKm,
  type GeoPoint,
} from "@/lib/arcCanal";
import {
  CORRIDOR,
  crossingRows,
  elevationRange,
  shadingBlocks,
  soilAlongRoute,
  wrbInfo,
} from "@/lib/canalMap";

/**
 * الممرّ: الوديان والتربة وما يعبره المسار.
 *
 * Two maps of the same frame and one table. The first is the ground and where
 * water runs over it — the drainage lines are derived from the elevation grid,
 * because on this plain almost none of the khors is drawn on any map, and a
 * canal that cuts across the slope meets every one of them. The second is the
 * soil either side of the line. The table is the list a designer counts and
 * prices from: every drainage line, mapped waterway, road and railway the
 * route crosses, by kilometre from Jebel Aulia.
 *
 * North up, east right, x shrunk by cos 15.5° — the same rules as the route
 * map above, so the two can be read against each other.
 */

const { south, west, north, east } = CORRIDOR.bbox;
const KX = Math.cos((15.5 * Math.PI) / 180);
const PLOT_W = 400;
const PLOT_H = (PLOT_W * (north - south)) / ((east - west) * KX);
const x = (lon: number) => ((lon - west) / (east - west)) * PLOT_W;
const y = (lat: number) => PLOT_H - ((lat - south) / (north - south)) * PLOT_H;
const line = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([lon, lat], i) => `${i ? "L" : "M"}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join("");
const geo = (pts: GeoPoint[]) => line(pts.map((p) => [p.lon, p.lat] as const));
const routePath = geo(ROUTE);

const n0 = (v: number) => Math.round(v).toLocaleString("ar", { useGrouping: false });
const n1 = (v: number) => v.toLocaleString("ar", { maximumFractionDigits: 1 });

/** Low ground green, high ground tan — the same ramp as the terrain layer on /rain. */
function tint(z: number, lo: number, hi: number): string {
  const t = hi > lo ? (z - lo) / (hi - lo) : 0;
  const stops = [
    [0, [217, 234, 211]],
    [0.35, [181, 213, 155]],
    [0.6, [230, 220, 160]],
    [0.85, [209, 178, 118]],
    [1, [169, 125, 79]],
  ] as const;
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1];
      const [t1, c1] = stops[k];
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((v, i) => Math.round(v + f * (c1[i] - v)));
      return `rgb(${c.join(",")})`;
    }
  }
  return "rgb(169,125,79)";
}

function Frame({
  children,
  label,
  clipId,
}: {
  children: React.ReactNode;
  label: string;
  clipId: string;
}) {
  return (
    <svg viewBox={`-2 -2 ${PLOT_W + 4} ${PLOT_H + 4}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={PLOT_W} height={PLOT_H} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{children}</g>
      <rect x={0} y={0} width={PLOT_W} height={PLOT_H} fill="none" stroke="var(--border)" />
    </svg>
  );
}

function Rivers() {
  return (
    <g fill="none" stroke="#2a6db0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d={geo(WHITE_NILE)} />
      <path d={geo(BLUE_NILE)} />
      <path d={geo(MAIN_NILE)} strokeWidth={4} />
    </g>
  );
}

function Route() {
  return (
    <>
      <path d={routePath} fill="none" stroke="var(--card)" strokeWidth={6} strokeLinejoin="round" />
      <path d={routePath} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" />
    </>
  );
}

function Places() {
  return (
    <>
      {PLACES.map((p) => (
        <g key={p.name}>
          <circle cx={x(p.lon)} cy={y(p.lat)} r={3} fill="var(--foreground)" />
          <text
            x={x(p.lon) + 6}
            y={y(p.lat) + 4}
            fontSize={10}
            fill="var(--foreground)"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {p.name}
          </text>
        </g>
      ))}
    </>
  );
}

export default function ArcCanalCorridor() {
  const { lo, hi } = elevationRange();
  const blocks = shadingBlocks(2);
  const segs = CORRIDOR.drainage.segments;
  const maxKm2 = Math.max(1, ...segs.map((s) => s.km2));
  const width = (km2: number) => 0.6 + 3.4 * (Math.log(km2) / Math.log(maxKm2));
  const soilCells = CORRIDOR.soil.cells.filter((c) => c.wrb);
  const soilKinds = [...new Set(soilCells.map((c) => c.wrb!))];
  const crossings = CORRIDOR.crossings;
  const rows = crossingRows();
  const channelCount = rows.filter((r) => r.kind === "channel").length;
  const bridgeCount = rows.filter((r) => r.kind === "road" || r.kind === "rail").length;
  const soilRuns = soilAlongRoute(ROUTE, distanceKm);
  const namedPlaces = CORRIDOR.nearPlaces.filter((p) => p.name);
  const unnamedPlaces = CORRIDOR.nearPlaces.length - namedPlaces.length;
  const half = CORRIDOR.soil.step / 2;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">الممرّ — الوديان والتربة وما يعبره المسار</h2>
        <p className="leading-relaxed text-muted">
          القياسات أعلاه على خطّ المسار نفسه. هذه الخرائط لما حوله: أين يجري ماء
          المطر على سهل أم درمان الغربي، وأيّ هذه المجاري تقطعها القناة فتحتاج
          عبّارةً أو معبر سيول، وما التربة على جانبيها، وما الطرق والقرى التي
          يمرّ بها.
          {CORRIDOR.mock && (
            <strong className="text-danger"> بياناتٌ تجريبية — لم يُجلب المسح الحقيقي بعد.</strong>
          )}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ───────── التضاريس والوديان ───────── */}
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <figcaption>
            <h3 className="font-semibold">التضاريس ومجاري السيول</h3>
            <p className="text-xs leading-relaxed text-muted">
              المجاري مشتقّةٌ من الارتفاعات: كلُّ خطٍّ يصرّف {n0(CORRIDOR.drainage.minKm2)} كم² فأكثر،
              ويزداد سُمكه بمساحة ما يصرّفه.
            </p>
          </figcaption>
          <Frame clipId="corridor-terrain" label="خريطة تضاريس ممرّ القناة ومجاري السيول المشتقّة منها، مع مسار القناة والطرق والقرى">
            {blocks.map((b) => (
              <rect
                key={`${b.lon},${b.lat}`}
                x={x(b.lon - CORRIDOR.grid.step / 2)}
                y={y(b.lat + b.size - CORRIDOR.grid.step / 2)}
                width={x(west + b.size) - x(west) + 0.4}
                height={y(south) - y(south + b.size) + 0.4}
                fill={tint(b.z, lo, hi)}
              />
            ))}
            <Rivers />
            <g stroke="#3b82c4" strokeLinecap="round" opacity={0.9}>
              {segs.map((s, k) => (
                <line
                  key={k}
                  x1={x(s.a[0])}
                  y1={y(s.a[1])}
                  x2={x(s.b[0])}
                  y2={y(s.b[1])}
                  strokeWidth={width(s.km2)}
                />
              ))}
            </g>
            <g fill="none" stroke="#1f5fa8" strokeWidth={1.2} strokeDasharray="4 3">
              {CORRIDOR.osm.waterways.map((w, k) => (
                <path key={k} d={line(w.coords)} />
              ))}
            </g>
            <g fill="none" stroke="#555" strokeWidth={1.2}>
              {CORRIDOR.osm.roads.map((r, k) => (
                <path key={k} d={line(r.coords)} strokeWidth={r.kind === "trunk" || r.kind === "primary" ? 1.8 : 1} />
              ))}
            </g>
            <g fill="none" stroke="#222" strokeWidth={1.4} strokeDasharray="6 2 1 2">
              {CORRIDOR.osm.railways.map((r, k) => (
                <path key={k} d={line(r.coords)} />
              ))}
            </g>
            <Route />
            {crossings
              .filter((c) => c.kind === "drainage")
              .map((c) => (
                <circle
                  key={`c${c.chainageKm}`}
                  cx={x(c.lon)}
                  cy={y(c.lat)}
                  r={3.2}
                  fill="var(--card)"
                  stroke="#1f5fa8"
                  strokeWidth={1.6}
                />
              ))}
            <Places />
          </Frame>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded" style={{ background: "#3b82c4" }} />
              مجرى سيل مشتقّ
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t border-dashed" style={{ borderColor: "#1f5fa8" }} />
              مجرى في OpenStreetMap
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5" style={{ background: "#555" }} />
              طريق
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded bg-primary" />
              القناة
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: "#1f5fa8" }} />
              حيث تعبر القناة مجرى
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-8 rounded-sm" style={{ background: `linear-gradient(to left, ${tint(hi, lo, hi)}, ${tint(lo, lo, hi)})` }} />
              <span className="figure">{n0(lo)}–{n0(hi)} م</span>
            </li>
          </ul>
        </figure>

        {/* ───────── التربة ───────── */}
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <figcaption>
            <h3 className="font-semibold">أنواع التربة</h3>
            <p className="text-xs leading-relaxed text-muted">
              المجموعة الأرجح في كل مربّعٍ (نحو ١١ كم) بتصنيف WRB العالمي، من
              SoilGrids بدقّة ٢٥٠ م.
            </p>
          </figcaption>
          <Frame clipId="corridor-soil" label="خريطة أنواع التربة في ممرّ القناة القوسية مع مسار القناة">
            <rect x={0} y={0} width={PLOT_W} height={PLOT_H} fill="var(--card)" />
            {soilCells.map((c) => (
              <rect
                key={`${c.lon},${c.lat}`}
                x={x(c.lon - half)}
                y={y(c.lat + half)}
                width={x(west + 2 * half) - x(west) + 0.4}
                height={y(south) - y(south + 2 * half) + 0.4}
                fill={wrbInfo(c.wrb)!.fill}
                stroke="var(--card)"
                strokeWidth={0.6}
              />
            ))}
            <Rivers />
            <Route />
            <Places />
          </Frame>
          <ul className="flex flex-col gap-1.5 text-xs">
            {soilKinds.map((k) => {
              const w = wrbInfo(k)!;
              const count = soilCells.filter((c) => c.wrb === k).length;
              return (
                <li key={k} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-block size-3.5 shrink-0 rounded-sm border border-border"
                    style={{ background: w.fill }}
                  />
                  <span>
                    <strong>{w.ar}</strong>{" "}
                    <span className="figure text-muted">({n0(count)} مربّعاً)</span>
                    {w.note && <span className="block text-muted">{w.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </figure>
      </div>

      {/* ───────── التربة على خطّ المسار ───────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 font-semibold">التربة على خطّ القناة نفسه</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          {soilRuns.map((r, k) => {
            const w = wrbInfo(r.wrb);
            return (
              <li key={k} className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block size-3 shrink-0 rounded-sm border border-border"
                  style={{ background: w?.fill ?? "transparent" }}
                />
                <span>
                  <span className="figure">
                    الكيلو {n0(r.fromKm)}–{n0(r.toKm)}
                  </span>
                  : <strong>{w?.ar ?? "غير معروفة"}</strong>
                  {w?.note && <span className="text-muted"> — {w.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ───────── ما يعبره المسار ───────── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">ما يعبره المسار</h3>
        <p className="text-sm leading-relaxed text-muted">
          بعد المأخذ تقطع القناة{" "}
          <strong className="text-foreground">{n0(channelCount)} مجرى سيل</strong> و
          <strong className="text-foreground">{n0(bridgeCount)} طريقاً أو سكّة</strong>. العمل
          المتوقّع لكلّ مجرى مصنّفٌ بمساحة حوضه وحدها — للعدّ والتسعير الأوّلي
          لا للتصميم: التصميم يحتاج شدّة المطر في العاصفة، ولا سجلَّ لها على هذا
          السهل.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/10 text-xs text-muted">
              <tr>
                <th className="p-2 text-start font-medium">الكيلو</th>
                <th className="p-2 text-start font-medium">ما يُعبَر</th>
                <th className="p-2 text-start font-medium">مساحة الحوض</th>
                <th className="p-2 text-start font-medium">العمل المتوقّع</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-t border-border align-top">
                  <td className="figure p-2">{n1(r.chainageKm)}</td>
                  <td className="p-2">{r.label}</td>
                  <td className="figure p-2">{r.km2 != null ? `${n0(r.km2)} كم²` : "—"}</td>
                  <td className="p-2">{r.work}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {CORRIDOR.nearPlaces.length > 0 && (
          <p className="text-sm leading-relaxed">
            <strong>
              {n0(CORRIDOR.nearPlaces.length)} قريةً وحلّةً على بُعد ٣ كم من المسار:
            </strong>{" "}
            {namedPlaces.map((p, k) => (
              <span key={k}>
                {k > 0 && "، "}
                {p.name}{" "}
                <span className="figure text-muted">(الكيلو {n0(p.chainageKm)})</span>
              </span>
            ))}
            {unnamedPlaces > 0 && <>، و{n0(unnamedPlaces)} بلا اسمٍ في الخريطة</>}. هؤلاء
            أوّل من يُسأل عن المسار، وأوّل من ينتفع به.
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        الارتفاعات: {CORRIDOR.sources.elevation}، بشبكة {n0(CORRIDOR.grid.step * 111)} كم تقريباً.
        المجاري والطرق والقرى: <span dir="ltr">{CORRIDOR.sources.osm}</span>. التربة:{" "}
        <span dir="ltr">{CORRIDOR.sources.soil}</span>. جُلبت في {CORRIDOR.fetchedAt}.
      </p>
    </section>
  );
}
