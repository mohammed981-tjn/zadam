import {
  ROUTE,
  PLACES,
  distanceKm,
  type GeoPoint,
} from "@/lib/arcCanal";
import {
  BuiltUp,
  Contours,
  NorthArrow,
  ScaleBar,
  Soil,
  Terrain,
  TerrainLegend,
  Water,
  shapePath,
} from "@/components/map/CorridorGround";
import {
  CORRIDOR,
  LAND_COVER,
  coverInfo,
  crossingRows,
  soilAlongRoute,
  wrbInfo,
} from "@/lib/canalMap";
import { placeName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

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

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "ar");
const n0 = (v: number, locale: Locale) => Math.round(v).toLocaleString(tag(locale), { useGrouping: false });
const n1 = (v: number, locale: Locale) => v.toLocaleString(tag(locale), { maximumFractionDigits: 1 });

/** 10 km at this scale, for the scale bar on every frame. */
const KM10 = x(west + 10 / 107.3) - x(west);

/**
 * One frame for all three maps: the same box, clip, north arrow and scale,
 * so the terrain, the soil and the land cover read against one another.
 */
function Frame({
  children,
  label,
  clipId,
  locale,
}: {
  children: React.ReactNode;
  label: string;
  clipId: string;
  locale: Locale;
}) {
  return (
    <svg viewBox={`-2 -2 ${PLOT_W + 4} ${PLOT_H + 4}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={PLOT_W} height={PLOT_H} rx={8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {children}
        <NorthArrow x={PLOT_W - 18} y={30} locale={locale} />
        <ScaleBar x={12} y={PLOT_H - 12} px={KM10} km={10} locale={locale} />
      </g>
      <rect x={0} y={0} width={PLOT_W} height={PLOT_H} fill="none" stroke="var(--border)" rx={8} />
    </svg>
  );
}

const P = { x, y };

/** Drainage lines drawn on the map: the larger ones, so the pattern shows. */
const DRAW_MIN_KM2 = 100;

/** The Nile and the reservoir as they lie, traced from ESA WorldCover's water. */
function Rivers() {
  return <Water p={P} />;
}

function Route() {
  return (
    <>
      <path d={routePath} fill="none" stroke="var(--card)" strokeWidth={6} strokeLinejoin="round" />
      <path d={routePath} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" />
    </>
  );
}

function Places({ locale }: { locale: Locale }) {
  return (
    <>
      {PLACES.map((p) => (
        <g key={p.name}>
          <circle cx={x(p.lon)} cy={y(p.lat)} r={3} fill="var(--foreground)" />
          <text
            x={x(p.lon) + 6}
            y={y(p.lat) + 4}
            fontSize={10}
            fontWeight={600}
            fill="var(--foreground)"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {placeName(p.name, locale)}
          </text>
        </g>
      ))}
    </>
  );
}

/**
 * What covers the ground today, from ESA WorldCover. The number that matters
 * is the strip either side of the line, not the whole frame: the frame takes
 * in Omdurman, the line does not.
 */
function LandCoverSection({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const lc = LAND_COVER;
  // Classes under half a percent are noise at this accuracy; they stay in the file.
  const strip = lc.shares.strip.filter((s) => s.pct >= 0.5);
  const inFrame = (cls: number) => lc.shares.corridor.find((s) => s.cls === cls)?.pct ?? 0;
  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <figcaption>
        <h3 className="font-semibold">{t("الغطاء الأرضي اليوم", "Land cover today")}</h3>
        <p className="text-xs leading-relaxed text-muted">
          {t(
            "ما على الأرض من زرعٍ وبناءٍ وماء، من خريطة الغطاء الأرضي الأوروبية (ESA WorldCover ٢٠٢١) بدقّة ١٠ أمتار، مرسومةً مناطقَ متّصلة (البقع الأصغر من نصف كيلومتر لا تظهر هنا، وتدخل في النِّسب).",
            "What is on the ground — crops, buildings, water — from the European land-cover map (ESA WorldCover 2021) at 10 m resolution, drawn as joined areas (patches smaller than half a kilometre do not show here but are counted in the shares).",
          )}
        </p>
      </figcaption>
      <div className="grid gap-4 md:grid-cols-2">
        <Frame
          clipId="corridor-cover"
          locale={locale}
          label={t(
            "خريطة الغطاء الأرضي في ممرّ القناة القوسية مع مسار القناة",
            "Land-cover map of the Arc Canal corridor with the canal route",
          )}
        >
          {/* Bare ground is the base; every other class is a region over it. */}
          <rect x={0} y={0} width={PLOT_W} height={PLOT_H} fill={coverInfo(60)!.fill} />
          {lc.regions.map((r) =>
            r.shapes.map((s, k) => (
              <path key={`${r.cls}-${k}`} d={shapePath(P, s)} fill={coverInfo(r.cls)!.fill} fillRule="evenodd" />
            )),
          )}
          <BuiltUp p={P} />
          <Water p={P} />
          <Route />
          <Places locale={locale} />
        </Frame>
        <div className="flex flex-col gap-3 text-sm">
          <p className="leading-relaxed">
            {t("في شريط", "In a strip of")} <span className="figure">{n0(lc.bufferKm, locale)}</span>{" "}
            {t("كم على جانبَي الخطّ:", "km either side of the line:")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {strip.map(({ cls, pct }) => {
              const c = coverInfo(cls)!;
              return (
                <li key={cls} className="flex items-start gap-2">
                  <span className="mt-1 inline-block size-3.5 shrink-0 rounded-sm border border-border" style={{ background: c.fill }} />
                  <span>
                    <strong>{en ? c.en : c.ar}</strong>{" "}
                    <span className="figure">
                      {n1(pct, locale)}
                      {t("٪", "%")}
                    </span>
                    <span className="figure text-xs text-muted">
                      {en
                        ? ` (${n1(inFrame(cls), locale)}% across the whole frame)`
                        : ` (في الإطار كلّه ${n1(inFrame(cls), locale)}٪)`}
                    </span>
                    {(en ? c.noteEn : c.note) && (
                      <span className="block text-xs text-muted">{en ? c.noteEn : c.note}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div>
            <h4 className="mb-1 font-medium">{t("على الخطّ نفسه", "On the line itself")}</h4>
            <ul className="flex flex-col gap-1 text-sm">
              {lc.along
                .filter((r) => r.toKm > r.fromKm)
                .map((r) => (
                  <li key={r.fromKm}>
                    <span className="figure">
                      {t("الكيلو", "km")} {n1(r.fromKm, locale)}–{n1(r.toKm, locale)}
                    </span>
                    : {(en ? coverInfo(r.cls)?.en : coverInfo(r.cls)?.ar) ?? t("غير معروف", "unknown")}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">
        {t(
          "الصورة لسنة ٢٠٢١ ودقّتها الإجمالية نحو ٧٧٪ بتقدير منتجيها؛ تكفي لمعرفة غالب الأرض، لا لحصر الحيازات — ذلك مسحٌ ميداني.",
          "The picture is for 2021, and its overall accuracy is about 77% by its producers' estimate: enough to know what most of the ground is, not to count holdings — that takes a field survey.",
        )}
      </p>
    </figure>
  );
}

export default function ArcCanalCorridor({ locale = "ar" }: { locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  // The larger lines only: every one of them is on the crossings list below,
  // but drawn all together the small ones hide the pattern they belong to.
  const segs = CORRIDOR.drainage.segments.filter((s) => s.km2 >= DRAW_MIN_KM2);
  const maxKm2 = Math.max(1, ...segs.map((s) => s.km2));
  const width = (km2: number) => 0.6 + 3.4 * (Math.log(km2) / Math.log(maxKm2));
  const soilCells = CORRIDOR.soil.cells.filter((c) => c.wrb);
  const soilKinds = [...new Set(soilCells.map((c) => c.wrb!))];
  const crossings = CORRIDOR.crossings;
  const rows = crossingRows(locale);
  const channelCount = rows.filter((r) => r.kind === "channel").length;
  const bridgeCount = rows.filter((r) => r.kind === "road" || r.kind === "rail").length;
  const soilRuns = soilAlongRoute(ROUTE, distanceKm);
  const namedPlaces = CORRIDOR.nearPlaces.filter((p) => p.name);
  const unnamedPlaces = CORRIDOR.nearPlaces.length - namedPlaces.length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">
          {t("الممرّ — الوديان والتربة وما يعبره المسار", "The corridor — wadis, soil and what the route crosses")}
        </h2>
        <p className="leading-relaxed text-muted">
          {t(
            "القياسات أعلاه على خطّ المسار نفسه. هذه الخرائط لما حوله: أين يجري ماء المطر على سهل أم درمان الغربي، وأيّ هذه المجاري تقطعها القناة فتحتاج عبّارةً أو معبر سيول، وما التربة على جانبيها، وما الطرق والقرى التي يمرّ بها.",
            "The measurements above are on the route line itself. These maps are of what lies around it: where rainwater runs across the plain west of Omdurman, which of those channels the canal cuts and so needs a culvert or flood crossing, what soil lies on either side, and which roads and villages it passes.",
          )}
          {CORRIDOR.mock && (
            <strong className="text-danger">
              {t(" بياناتٌ تجريبية — لم يُجلب المسح الحقيقي بعد.", " Test data — the real survey has not been fetched yet.")}
            </strong>
          )}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ───────── التضاريس والوديان ───────── */}
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <figcaption>
            <h3 className="font-semibold">{t("التضاريس ومجاري السيول", "Terrain and flood channels")}</h3>
            <p className="text-xs leading-relaxed text-muted">
              {en
                ? `Colours are ground height, with contour lines every ${n0(10, locale)} metres. The channels are derived from the elevations: those drawn drain ${n0(DRAW_MIN_KM2, locale)} km² or more, thicker with the area they drain (the table below counts every channel from ${n0(CORRIDOR.drainage.minKm2, locale)} km²).`
                : `الألوان ارتفاع الأرض، وخطوط الكنتور كل ${n0(10, locale)} أمتار. والمجاري مشتقّةٌ من الارتفاعات: المرسوم منها ما يصرّف ${n0(DRAW_MIN_KM2, locale)} كم² فأكثر، ويزداد سُمكه بمساحة ما يصرّفه (والجدول أدناه يعدّ كلّ مجرى من ${n0(CORRIDOR.drainage.minKm2, locale)} كم²).`}
            </p>
          </figcaption>
          <Frame
            clipId="corridor-terrain"
            locale={locale}
            label={t(
              "خريطة تضاريس ممرّ القناة ومجاري السيول المشتقّة منها، مع مسار القناة والطرق والقرى",
              "Terrain map of the canal corridor and the flood channels derived from it, with the canal route, roads and villages",
            )}
          >
            <Terrain p={P} />
            <Contours p={P} />
            <Rivers />
            <g stroke="#2f78c0" strokeLinecap="round" opacity={0.85}>
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
            <Places locale={locale} />
          </Frame>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded" style={{ background: "#3b82c4" }} />
              {t("مجرى سيل مشتقّ", "Derived flood channel")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t border-dashed" style={{ borderColor: "#1f5fa8" }} />
              {t("مجرى في OpenStreetMap", "Channel in OpenStreetMap")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5" style={{ background: "#555" }} />
              {t("طريق", "Road")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded bg-primary" />
              {t("القناة", "The canal")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: "#1f5fa8" }} />
              {t("حيث تعبر القناة مجرى", "Where the canal crosses a channel")}
            </li>
          </ul>
          <TerrainLegend locale={locale} />
        </figure>

        {/* ───────── التربة ───────── */}
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <figcaption>
            <h3 className="font-semibold">{t("أنواع التربة", "Soil types")}</h3>
            <p className="text-xs leading-relaxed text-muted">
              {t(
                "المجموعة الأرجح بتصنيف WRB العالمي من SoilGrids، قُرئت كل ١١ كم ورُسمت حدودها ناعمةً بين النقاط — تقريبيّةٌ بقدر تباعدها.",
                "The most likely group in the international WRB classification, from SoilGrids, read every 11 km with smooth boundaries drawn between the points — as approximate as their spacing.",
              )}
            </p>
          </figcaption>
          <Frame
            clipId="corridor-soil"
            locale={locale}
            label={t(
              "خريطة أنواع التربة في ممرّ القناة القوسية مع مسار القناة",
              "Soil-type map of the Arc Canal corridor with the canal route",
            )}
          >
            <Soil p={P} />
            <Rivers />
            <Route />
            <Places locale={locale} />
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
                    <strong>{en ? w.en : w.ar}</strong>{" "}
                    <span className="figure text-muted">
                      ({n0(count, locale)} {t("مربّعاً", "squares")})
                    </span>
                    {(en ? w.noteEn : w.note) && <span className="block text-muted">{en ? w.noteEn : w.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </figure>
      </div>

      {/* ───────── التربة على خطّ المسار ───────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 font-semibold">{t("التربة على خطّ القناة نفسه", "Soil along the canal line itself")}</h3>
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
                    {t("الكيلو", "km")} {n0(r.fromKm, locale)}–{n0(r.toKm, locale)}
                  </span>
                  : <strong>{(en ? w?.en : w?.ar) ?? t("غير معروفة", "unknown")}</strong>
                  {(en ? w?.noteEn : w?.note) && <span className="text-muted"> — {en ? w?.noteEn : w?.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ───────── الغطاء الأرضي ───────── */}
      <LandCoverSection locale={locale} />

      {/* ───────── ما يعبره المسار ───────── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t("ما يعبره المسار", "What the route crosses")}</h3>
        <p className="text-sm leading-relaxed text-muted">
          {en ? (
            <>
              After the intake the canal cuts{" "}
              <strong className="text-foreground">{n0(channelCount, locale)} flood channels</strong> and{" "}
              <strong className="text-foreground">{n0(bridgeCount, locale)} roads or railways</strong>. The expected
              work at each channel is classed by its catchment area alone — for counting and first pricing, not for
              design: design needs storm rainfall intensity, and there is no record of it for this plain.
            </>
          ) : (
            <>
              بعد المأخذ تقطع القناة{" "}
              <strong className="text-foreground">{n0(channelCount, locale)} مجرى سيل</strong> و
              <strong className="text-foreground">{n0(bridgeCount, locale)} طريقاً أو سكّة</strong>. العمل
              المتوقّع لكلّ مجرى مصنّفٌ بمساحة حوضه وحدها — للعدّ والتسعير الأوّلي
              لا للتصميم: التصميم يحتاج شدّة المطر في العاصفة، ولا سجلَّ لها على هذا
              السهل.
            </>
          )}
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/10 text-xs text-muted">
              <tr>
                <th className="p-2 text-start font-medium">{t("الكيلو", "km")}</th>
                <th className="p-2 text-start font-medium">{t("ما يُعبَر", "Crossed")}</th>
                <th className="p-2 text-start font-medium">{t("مساحة الحوض", "Catchment area")}</th>
                <th className="p-2 text-start font-medium">{t("العمل المتوقّع", "Expected work")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-t border-border align-top">
                  <td className="figure p-2">{n1(r.chainageKm, locale)}</td>
                  <td className="p-2">{r.label}</td>
                  <td className="figure p-2">{r.km2 != null ? `${n0(r.km2, locale)} ${t("كم²", "km²")}` : "—"}</td>
                  <td className="p-2">{r.work}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {CORRIDOR.nearPlaces.length > 0 && (
          <p className="text-sm leading-relaxed">
            <strong>
              {en
                ? `${n0(CORRIDOR.nearPlaces.length, locale)} villages and settlements within 3 km of the route:`
                : `${n0(CORRIDOR.nearPlaces.length, locale)} قريةً وحلّةً على بُعد ٣ كم من المسار:`}
            </strong>{" "}
            {namedPlaces.map((p, k) => (
              <span key={k}>
                {k > 0 && t("، ", ", ")}
                {p.name}{" "}
                <span className="figure text-muted">
                  ({t("الكيلو", "km")} {n0(p.chainageKm, locale)})
                </span>
              </span>
            ))}
            {unnamedPlaces > 0 &&
              (en ? (
                <>, and {n0(unnamedPlaces, locale)} with no name on the map</>
              ) : (
                <>، و{n0(unnamedPlaces, locale)} بلا اسمٍ في الخريطة</>
              ))}
            {t(
              ". هؤلاء أوّل من يُسأل عن المسار، وأوّل من ينتفع به.",
              ". They are the first to be asked about the route, and the first to benefit from it.",
            )}
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        {en ? (
          <>
            Elevations: {CORRIDOR.sources.elevation}, on a grid of about {n0(CORRIDOR.grid.step * 111, locale)} km.
            Channels, roads and villages: {CORRIDOR.sources.osm}. Soil: {CORRIDOR.sources.soil}. Fetched{" "}
            {CORRIDOR.fetchedAt}.
          </>
        ) : (
          <>
            الارتفاعات: {CORRIDOR.sources.elevation}، بشبكة {n0(CORRIDOR.grid.step * 111, locale)} كم تقريباً.
            المجاري والطرق والقرى: <span dir="ltr">{CORRIDOR.sources.osm}</span>. التربة:{" "}
            <span dir="ltr">{CORRIDOR.sources.soil}</span>. جُلبت في {CORRIDOR.fetchedAt}.
          </>
        )}
      </p>
    </section>
  );
}
