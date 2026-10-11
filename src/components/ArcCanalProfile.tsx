"use client";

import { useState } from "react";
import {
  ROUTE,
  LANDMARKS,
  SOURCE_ELEVATION_M,
  distanceKm,
  summarise,
} from "@/lib/arcCanal";
import { placeName } from "@/lib/enNames";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

/**
 * The measured long-section of the canal route.
 *
 * DIRECTION
 *
 * Distance grows leftward. The page is right-to-left and every label on it is
 * Arabic, so the reader's eye starts at the right — which is where the water
 * starts, at Jebel Aulia. Forcing a left-to-right axis under right-to-left text
 * makes the reader travel backwards along the route they are reading about.
 *
 * WHAT IS LABELLED, AND WHAT IS NOT
 *
 * Five landmarks out of forty-one samples. A value on every point is chaos and
 * goes unread; these five are the ones the argument rests on — the source, the
 * two ridges, the saddle between them, and the terminus that sits above the
 * source. Everything else is carried by the axis and the hover.
 *
 * THE DASHED RULE IS THE WHOLE CHART
 *
 * The horizontal line at 377 m is the reservoir. Every one of the forty-one
 * samples sits above it, which is the finding: there is no gravity segment
 * anywhere on this alignment, and the studies' talk of gravity distribution has
 * nothing under it.
 */

const W = 800;
const H = 340;
const PLOT_LEFT = 24;
const PLOT_RIGHT = 726; // y-axis ticks live to the right of this, RTL-style
const PLOT_TOP = 34;
const PLOT_BOTTOM = 268;

const E_MIN = 370;
const E_MAX = 450;

const x = (index: number) =>
  PLOT_RIGHT - (index / (ROUTE.length - 1)) * (PLOT_RIGHT - PLOT_LEFT);

const y = (elevation: number) =>
  PLOT_BOTTOM -
  ((elevation - E_MIN) / (E_MAX - E_MIN)) * (PLOT_BOTTOM - PLOT_TOP);

const TICKS = [380, 400, 420, 440];

export default function ArcCanalProfile() {
  const [hover, setHover] = useState<number | null>(null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const m = t("م", "m");
  const s = summarise();

  const line = ROUTE.map(
    (p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.elevation).toFixed(1)}`,
  ).join(" ");

  const area =
    `M ${x(0).toFixed(1)} ${PLOT_BOTTOM} ` +
    ROUTE.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.elevation).toFixed(1)}`).join(" ") +
    ` L ${x(ROUTE.length - 1).toFixed(1)} ${PLOT_BOTTOM} Z`;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Client pixels → viewBox units, so the hit test is right at any width.
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const t = (PLOT_RIGHT - vx) / (PLOT_RIGHT - PLOT_LEFT);
    const i = Math.round(t * (ROUTE.length - 1));
    setHover(i >= 0 && i < ROUTE.length ? i : null);
  }

  const active = hover === null ? null : ROUTE[hover];

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">
          {t("المقطع الطولي للمسار — مقيساً لا مُقدَّراً", "The route's long section — measured, not estimated")}
        </h3>
        <p className="text-sm leading-relaxed text-muted">
          {t(
            "٤١ عيّنة ارتفاع من قمر SRTM بدقّة ٣٠ متراً، من جبل أولياء (يميناً) إلى السروراب (يساراً). الخط المتقطّع منسوب الخزان.",
            "41 elevation samples from the SRTM satellite at 30 m resolution, from Jebel Aulia (right) to Sarurab (left). The dashed line is the reservoir level.",
          )}
        </p>
      </figcaption>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[34rem]"
          role="img"
          aria-label={t(
            `المقطع الطولي: أعلى نقطة ${s.peak.elevation} متراً، ومنسوب الخزان ${SOURCE_ELEVATION_M} متراً، والنهاية ${s.terminusElevation} متراً`,
            `Long section: highest point ${s.peak.elevation} m, reservoir level ${SOURCE_ELEVATION_M} m, end ${s.terminusElevation} m`,
          )}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines: hairline, solid, one step off the surface. */}
          {TICKS.map((t) => (
            <g key={t}>
              <line
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PLOT_RIGHT + 8}
                y={y(t) + 4}
                fontSize={12}
                fill="var(--color-muted)"
              >
                {t}
              </text>
            </g>
          ))}
          <text
            x={PLOT_RIGHT + 8}
            y={PLOT_TOP - 14}
            fontSize={11}
            fill="var(--color-muted)"
          >
            {t("متر", "metres")}
          </text>

          <path d={area} fill="var(--color-primary)" opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* The reservoir level — the line every sample stays above. */}
          <line
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={y(SOURCE_ELEVATION_M)}
            y2={y(SOURCE_ELEVATION_M)}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text
            x={PLOT_LEFT + 4}
            y={y(SOURCE_ELEVATION_M) - 6}
            fontSize={11}
            fill="var(--color-muted)"
          >
            {t("منسوب الخزان", "Reservoir level")} {SOURCE_ELEVATION_M} {m}
          </text>

          {/* Five direct labels, deliberately. */}
          {LANDMARKS.map((l) => {
            const p = ROUTE[l.index];
            const above = p.elevation >= 425;
            return (
              <g key={l.index}>
                <circle
                  cx={x(l.index)}
                  cy={y(p.elevation)}
                  r={4.5}
                  fill="var(--color-primary)"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                />
                <text
                  x={x(l.index)}
                  y={above ? y(p.elevation) - 12 : y(p.elevation) + 20}
                  fontSize={12}
                  fontWeight={600}
                  textAnchor="middle"
                  fill="var(--color-foreground)"
                >
                  {placeName(l.name, locale)}
                </text>
                <text
                  x={x(l.index)}
                  y={above ? y(p.elevation) - 12 + 14 : y(p.elevation) + 20 + 14}
                  fontSize={11}
                  textAnchor="middle"
                  fill="var(--color-muted)"
                >
                  {p.elevation} {m}
                </text>
              </g>
            );
          })}

          {/* Hover crosshair. */}
          {active && (
            <g>
              <line
                x1={x(active.index)}
                x2={x(active.index)}
                y1={PLOT_TOP}
                y2={PLOT_BOTTOM}
                stroke="var(--color-muted)"
                strokeWidth={1}
              />
              <circle
                cx={x(active.index)}
                cy={y(active.elevation)}
                r={5}
                fill="var(--color-primary)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            </g>
          )}

          {/* Distance axis, both ends named so the direction is unmistakable. */}
          <line
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={PLOT_BOTTOM}
            y2={PLOT_BOTTOM}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
          <text
            x={PLOT_RIGHT}
            y={PLOT_BOTTOM + 22}
            fontSize={12}
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {t("٠ كم — جبل أولياء", "0 km — Jebel Aulia")}
          </text>
          <text
            x={PLOT_LEFT}
            y={PLOT_BOTTOM + 22}
            fontSize={12}
            textAnchor="start"
            fill="var(--color-muted)"
          >
            {Math.round(s.lengthKm)} {t("كم — السروراب", "km — Sarurab")}
          </text>
        </svg>
      </div>

      <p className="min-h-[1.5rem] text-sm text-muted" aria-live="polite">
        {active
          ? t(
              `عند ${distanceKm(active.index).toFixed(1)} كم: ${active.elevation} متراً — أي ${active.elevation - SOURCE_ELEVATION_M} متراً فوق الخزان.`,
              `At ${distanceKm(active.index).toFixed(1)} km: ${active.elevation} m — that is ${active.elevation - SOURCE_ELEVATION_M} m above the reservoir.`,
            )
          : t("مرّر المؤشّر على المقطع لقراءة أي نقطة.", "Move the pointer over the section to read any point.")}
      </p>

      {/* The table is not a fallback — it is the version a screen reader, a
          printer and a sceptic can all use. */}
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          {t("القراءات الإحدى والأربعون كجدول", "All forty-one readings as a table")}
        </summary>
        <div className="max-h-80 overflow-auto px-4 pb-4">
          <table className="w-full text-start text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-muted">
                <th className="py-1 text-start font-normal">{t("كم", "km")}</th>
                <th className="py-1 text-start font-normal">{t("خط العرض", "Latitude")}</th>
                <th className="py-1 text-start font-normal">{t("خط الطول", "Longitude")}</th>
                <th className="py-1 text-start font-normal">{t("الارتفاع (م)", "Elevation (m)")}</th>
              </tr>
            </thead>
            <tbody>
              {ROUTE.map((p) => (
                <tr key={p.index} className="border-t border-border">
                  <td className="py-1">{distanceKm(p.index).toFixed(1)}</td>
                  <td className="py-1">{p.lat.toFixed(4)}</td>
                  <td className="py-1">{p.lon.toFixed(4)}</td>
                  <td className="py-1 font-medium">{p.elevation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
