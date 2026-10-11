import { bandFor, type DailyTable } from "@/lib/rainMap";
import { placeName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "ar");
const n0 = (v: number, locale: Locale) => Math.round(v).toLocaleString(tag(locale));
const weekday = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(tag(locale), {
    weekday: "short",
    timeZone: "Africa/Khartoum",
  });
const dayNum = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(tag(locale), {
    day: "numeric",
    timeZone: "Africa/Khartoum",
  });

/**
 * المطر يوماً بيوم لخمس عشرة مدينة — الجدولُ الذي يُقرأ مع الخريطة.
 *
 * The map says where the week's rain falls; this says which day, which is what
 * decides whether to sow, spray or cut hay. Each cell is shaded with the same
 * blues as the map so the two read as one instrument, and a day under 1 mm is
 * a dot rather than a zero — seven zeros in a row hide the one day that
 * matters.
 *
 * The town column sticks on a phone, where the seven days scroll sideways.
 */
export default function DailyRainTable({ table, locale = "ar" }: { table: DailyTable; locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="sticky start-0 z-10 bg-card p-2 text-start font-medium">
              {t("المدينة", "Town")}
            </th>
            {table.dates.map((d) => (
              <th key={d} className="p-2 text-center font-medium">
                <span className="block">{weekday(d, locale)}</span>
                <span className="figure block">{dayNum(d, locale)}</span>
              </th>
            ))}
            <th className="p-2 text-center font-medium">{t("المجموع", "Total")}</th>
            <th className="p-2 text-center font-medium">{t("أعلى حرارة", "Max temp.")}</th>
          </tr>
        </thead>
        <tbody>
          {table.towns.map((town) => {
            const total = town.days.reduce((a, d) => a + d.rainMm, 0);
            const tmax = Math.max(...town.days.map((d) => d.tmaxC));
            return (
              <tr key={town.name} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky start-0 z-10 bg-card p-2 text-start font-medium"
                >
                  {placeName(town.name, locale)}
                </th>
                {table.dates.map((date) => {
                  const d = town.days.find((x) => x.date === date);
                  if (!d) return <td key={date} className="p-2 text-center text-muted">—</td>;
                  const b = bandFor(d.rainMm);
                  return (
                    <td
                      key={date}
                      className="figure p-2 text-center font-bold"
                      style={{ background: b.fill, color: b.ink }}
                    >
                      {d.rainMm < 1 ? "·" : n0(d.rainMm, locale)}
                    </td>
                  );
                })}
                <td className="figure p-2 text-center font-black">{n0(total, locale)}</td>
                <td className="figure p-2 text-center text-muted">{n0(tmax, locale)}°</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
