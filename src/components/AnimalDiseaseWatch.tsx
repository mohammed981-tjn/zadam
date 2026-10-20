import Link from "next/link";
import {
  EMPRES_URL,
  countryName,
  diseaseName,
  groupEvents,
  sourceNote,
  watchPlaces,
  type DiseaseEvent,
} from "@/lib/animalDisease";
import { tr, type Locale } from "@/lib/i18n";
import { locustDay } from "@/lib/locust";
import { stateName } from "@/lib/nafir";

/**
 * «أمراض الماشية في ولايتك» — what FAO's EMPRES-i holds for Sudan and its
 * neighbours over the last twelve months, with the farmer's own states first.
 * Counts, dates and places as FAO holds them; the caveat that an outbreak
 * nobody reported is not in the table is part of the figure.
 */
export default function AnimalDiseaseWatch({
  events,
  lands,
  locale,
}: {
  events: DiseaseEvent[] | null;
  lands: { name: string; state: string; latitude: number | null; longitude: number | null }[];
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const km = (v: number) => Math.round(v).toLocaleString("en-US");

  if (events === null) {
    return (
      <section className="mb-8 rounded-2xl border border-border bg-card p-5 text-sm text-muted">
        {t("تعذّر الوصول إلى بيانات الفاو عن أمراض الماشية الآن.", "FAO's livestock disease data could not be reached just now.")}
      </section>
    );
  }

  const groups = groupEvents(events);
  const watch = watchPlaces(lands, events);
  const alerts = watch.filter((w) => w.inState.length > 0);
  const sudanEvents = events.filter((e) => e.country === "Sudan");

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("أمراض الماشية في السودان وجيرانه", "Livestock diseases in Sudan and next door")}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {t(
          "ما وصل إلى الفاو في آخر ١٢ شهراً. يصل الحدث إلى الجدول بعد أسابيع من وقوعه، ولا يظهر هنا إلّا ما أُبلغ عنه.",
          "What reached FAO in the last 12 months. An event reaches the table weeks after it happens, and only what was reported shows here.",
        )}
      </p>

      {alerts.length > 0 && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-bold text-danger">{t("⚠ مرضٌ مُبلَّغٌ عنه في ولايتك", "⚠ A disease reported in your state")}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {alerts.map((w) => (
              <li key={w.land}>
                {t(`«${w.land}» في ${stateName(w.state, locale)}: `, `“${w.land}” in ${stateName(w.state, locale)}: `)}
                {w.inState.map((e, i) => (
                  <span key={e.id || i}>
                    {i > 0 && t("، ", ", ")}
                    {diseaseName(e.disease, locale)} ({locustDay(e.date, locale)})
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            {t(
              "اتّصل بالطبيب البيطريّ في محليّتك أو بوزارة الثروة الحيوانيّة في الولاية عن التطعيم وعزل القطيع.",
              "Call the veterinarian in your locality or the state livestock ministry about vaccination and isolating the herd.",
            )}
          </p>
        </div>
      )}

      {watch.some((w) => w.nearest) && (
        <ul className="mt-3 flex flex-col gap-0.5 text-xs">
          {watch
            .filter((w) => w.nearest)
            .map((w) => (
              <li key={w.land}>
                {t(
                  `«${w.land}»: أقرب حدثٍ مُبلَّغ عنه ${diseaseName(w.nearest!.disease, locale)} على بعد ${km(w.nearest!.km)} كم، في ${countryName(w.nearest!.country, locale)} (${locustDay(w.nearest!.date, locale)}).`,
                  `“${w.land}”: the nearest reported event is ${diseaseName(w.nearest!.disease, locale)}, ${km(w.nearest!.km)} km away in ${countryName(w.nearest!.country, locale)} (${locustDay(w.nearest!.date, locale)}).`,
                )}
              </li>
            ))}
        </ul>
      )}
      {lands.length === 0 && (
        <p className="mt-3 text-xs">
          {t("أضف أرضك بولايتها وموقعها في ", "Add your land with its state and location in ")}
          <Link href="/lands" className="text-primary underline">{t("أراضيّ", "My lands")}</Link>
          {t(" ليصلك إشعارٌ إن أُبلغ عن مرضٍ في ولايتك، ولو لم تفتح هذه الصفحة.", " and you will be notified when a disease is reported in your state, even without opening this page.")}
        </p>
      )}

      {sudanEvents.length === 0 && (
        <p className="mt-3 text-sm">{t("لم يصل إلى الفاو حدثٌ في السودان خلال هذه الفترة.", "No event in Sudan reached FAO in this period.")}</p>
      )}

      {groups.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("البلد", "Country")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("المرض", "Disease")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("الأحداث", "Events")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("آخرها", "Latest")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.country}|${g.disease}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    {countryName(g.country, locale)}
                    {g.states.length > 0 && <span className="text-xs text-muted"> ({g.states.map((s) => stateName(s, locale)).join(t("، ", ", "))})</span>}
                  </td>
                  <td className="px-3 py-2">{diseaseName(g.disease, locale)}</td>
                  <td className="px-3 py-2" dir="ltr">{g.count}</td>
                  <td className="px-3 py-2 text-muted">{locustDay(g.lastDate, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        {sourceNote(locale)}{" "}
        <a href={EMPRES_URL} target="_blank" rel="noopener noreferrer" className="underline">
          FAO EMPRES-i
        </a>
      </p>
    </section>
  );
}
