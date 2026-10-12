/**
 * خطٌّ صغيرٌ لتاريخ السعر — SVG مضمّن، بلا مكتبة وبلا شيفرة عميل.
 *
 * One series, so no legend: the card's title names it. The line is drawn in
 * the current text colour and the last point is marked, because "where is it
 * now" is the question the reader brings. Each point carries a native <title>,
 * which is the hover layer a phone-first page can afford without JavaScript.
 * The points are spaced by date, not by index: the bulletins arrive with gaps
 * of days or weeks, and even spacing would draw a month's jump as a day's.
 */
export default function Sparkline({
  points,
  label,
  width = 120,
  height = 32,
}: {
  points: { date: string; price: number }[];
  label: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const pad = 4;
  const t = points.map((p) => new Date(`${p.date}T00:00:00Z`).getTime());
  const v = points.map((p) => p.price);
  const [t0, t1] = [Math.min(...t), Math.max(...t)];
  const [v0, v1] = [Math.min(...v), Math.max(...v)];
  const x = (i: number) => pad + ((t[i] - t0) / (t1 - t0 || 1)) * (width - 2 * pad);
  const y = (i: number) => height - pad - ((v[i] - v0) / (v1 - v0 || 1)) * (height - 2 * pad);
  const d = points.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(" ");
  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="overflow-visible text-primary"
      // The time axis runs left to right in both languages, like every chart.
      style={{ direction: "ltr" }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(i)} r={i === last ? 4 : 6} fill={i === last ? "currentColor" : "transparent"}>
          <title>{`${p.date}: ${p.price.toLocaleString("en-US")}`}</title>
        </circle>
      ))}
    </svg>
  );
}
