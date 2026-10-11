import { STATIONS } from "@/lib/agronomy";
import { BAND_LABEL, BAND_LABEL_EN, fetchWeekForecast } from "@/lib/forecast";
import { stationName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "ar");
const n1 = (v: number, locale: Locale) => v.toLocaleString(tag(locale), { maximumFractionDigits: 1 });
const pct = (v: number, locale: Locale) =>
  locale === "en" ? `${Math.round(v * 100)}%` : `${Math.round(v * 100).toLocaleString("ar")}٪`;
const dayName = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(tag(locale), {
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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const week = await fetchWeekForecast(STATIONS);

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">
        {t("هذا الأسبوع: المطر مقابل حاجة الجوّ", "This week: rain against the air's demand")}
      </h2>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "توقّعُ الأيام السبعة القادمة لكل محطة: المطرُ المتوقّع، والبخر-نتح المرجعيّ (ما يأخذه الجوّ من حقلٍ معشوشب — الأساسُ الذي تُحسب عليه حاجة كل محصول)، ونسبةُ الأوّل من الثاني. هو وصفٌ للأسبوع لا أمرٌ بالريّ: المطرُ المتوقّع احتمال، والفعّالُ منه أقلّ من كلّه.",
          "The next seven days' forecast for each station: the expected rain, the reference evapotranspiration (what the air draws from a grass field — the basis every crop's need is calculated from), and the first as a share of the second. It describes the week; it is not an instruction to irrigate: forecast rain is a probability, and only part of it is effective.",
        )}
      </p>

      {!week ? (
        <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted">
          {t(
            "تعذّر جلبُ التوقّع الآن. الحاسبةُ أعلاه تعمل كما هي على المعدّلات الشهرية.",
            "The forecast could not be fetched just now. The calculator above still works as usual on monthly averages.",
          )}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-muted/10 text-xs text-muted">
              <tr>
                <th className="p-3 text-start font-medium">{t("المحطة", "Station")}</th>
                <th className="p-3 text-start font-medium">{t("مطر ٧ أيام", "7-day rain")}</th>
                <th className="p-3 text-start font-medium">{t("حاجة الجوّ", "Air demand")}</th>
                <th className="p-3 text-start font-medium">{t("النسبة", "Share")}</th>
                <th className="p-3 text-start font-medium">{t("الأسبوع", "The week")}</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map((s) => {
                const w = week.get(s.key);
                if (!w) return null;
                return (
                  <tr key={s.key} className="border-t border-border align-top">
                    <td className="p-3 font-medium">{stationName(s, locale)}</td>
                    <td className="figure p-3">{n1(w.rainMm, locale)} {t("مم", "mm")}</td>
                    <td className="figure p-3">{n1(w.et0Mm, locale)} {t("مم", "mm")}</td>
                    <td className="figure p-3">{pct(w.rainShare, locale)}</td>
                    <td className="p-3 text-xs leading-6">
                      {locale === "en" ? BAND_LABEL_EN[w.band] : BAND_LABEL[w.band]}
                      {w.firstRainDay && (
                        <span className="block text-muted">
                          {t("أوّلُ مطرٍ يُعتدّ به:", "First significant rain:")} {dayName(w.firstRainDay, locale)}
                        </span>
                      )}
                      <span className="block text-muted">
                        {t("أعلى حرارة:", "Max temperature:")} {n1(w.tmaxC, locale)}°
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
        {t("المصدر:", "Source:")} <span dir="ltr">Open-Meteo</span> —{" "}
        {t(
          "نماذجُ الأرصاد الوطنية مجمّعة، ويُحدَّث كل ثلاث ساعات.",
          "national weather-service models combined, updated every three hours.",
        )}
      </p>
    </section>
  );
}
