import { STATIONS } from "@/lib/agronomy";
import { BAND_LABEL, fetchWeekForecast } from "@/lib/forecast";

const n1 = (v: number) => v.toLocaleString("ar", { maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v * 100).toLocaleString("ar")}٪`;
const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("ar", {
    weekday: "long",
    timeZone: "Africa/Khartoum",
  });

/**
 * «هذا الأسبوع» تحت الحاسبة: المطرُ المتوقّع مقابل ما يأخذه الجوّ، لكل محطة.
 *
 * Rendered on the server from one cached request, so the page ships no extra
 * JavaScript for it. If Open-Meteo is unreachable the section says so in one
 * line and the calculator above is untouched.
 */
export default async function WeekForecast() {
  const week = await fetchWeekForecast(STATIONS);

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">هذا الأسبوع: المطر مقابل حاجة الجوّ</h2>
      <p className="mt-2 text-sm leading-7 text-muted">
        توقّعُ الأيام السبعة القادمة لكل محطة: المطرُ المتوقّع، والبخر-نتح
        المرجعيّ (ما يأخذه الجوّ من حقلٍ معشوشب — الأساسُ الذي تُحسب عليه حاجة
        كل محصول)، ونسبةُ الأوّل من الثاني. هو وصفٌ للأسبوع لا أمرٌ بالريّ: المطرُ
        المتوقّع احتمال، والفعّالُ منه أقلّ من كلّه.
      </p>

      {!week ? (
        <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted">
          تعذّر جلبُ التوقّع الآن. الحاسبةُ أعلاه تعمل كما هي على المعدّلات
          الشهرية.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-muted/10 text-xs text-muted">
              <tr>
                <th className="p-3 text-start font-medium">المحطة</th>
                <th className="p-3 text-start font-medium">مطر ٧ أيام</th>
                <th className="p-3 text-start font-medium">حاجة الجوّ</th>
                <th className="p-3 text-start font-medium">النسبة</th>
                <th className="p-3 text-start font-medium">الأسبوع</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((s) => {
                const w = week.get(s.key);
                if (!w) return null;
                return (
                  <tr key={s.key} className="border-t border-border align-top">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="figure p-3">{n1(w.rainMm)} مم</td>
                    <td className="figure p-3">{n1(w.et0Mm)} مم</td>
                    <td className="figure p-3">{pct(w.rainShare)}</td>
                    <td className="p-3 text-xs leading-6">
                      {BAND_LABEL[w.band]}
                      {w.firstRainDay && (
                        <span className="block text-muted">
                          أوّلُ مطرٍ يُعتدّ به: {dayName(w.firstRainDay)}
                        </span>
                      )}
                      <span className="block text-muted">
                        أعلى حرارة: {n1(w.tmaxC)}°
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        المصدر: <span dir="ltr">Open-Meteo</span> — نماذجُ الأرصاد الوطنية
        مجمّعة، ويُحدَّث كل ثلاث ساعات.
      </p>
    </section>
  );
}
