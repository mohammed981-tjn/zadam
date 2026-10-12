import Link from "next/link";
import FxConverter from "@/components/FxConverter";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { FX_CURRENCIES, FX_NAME, FX_SOURCE_URL, fetchOfficialRates } from "@/lib/fxRates";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "أسعار العملات مقابل الجنيه السوداني | سوداقري", "Exchange rates against the Sudanese pound | Sudagri"),
    description: tr(
      locale,
      "السعر الرسمي للدولار والريال والدرهم والجنيه المصري وغيرها مقابل الجنيه السوداني، يُحدَّث يومياً، مع محوّل للعملات.",
      "The official rate of the dollar, riyal, dirham, Egyptian pound and others against the Sudanese pound, updated daily, with a converter.",
    ),
  };
}

const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default async function RatesPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const rates = await fetchOfficialRates();
  const updated = rates
    ? new Date(rates.updatedAt).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SD-u-nu-latn", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("أسعار العملات مقابل الجنيه السوداني", "Exchange rates against the Sudanese pound")}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        {t(
          "السعر الرسمي، يُحدَّث مرّة في اليوم. هذا ليس سعر السوق الموازي، وقد يكون الفرق بينهما كبيراً؛ فاحسب به وأنت تعرف أيّ سعر تستعمل.",
          "The official rate, updated once a day. This is not the parallel-market rate, and the gap between the two can be large; calculate with it knowing which rate you are using.",
        )}
      </p>

      {rates === null ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6 text-sm">
          {t(
            "تعذّر جلب الأسعار الآن من المصدر. أعد المحاولة بعد قليل.",
            "The rates could not be fetched from the source just now. Try again shortly.",
          )}
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
            <div className="text-sm text-muted">{t("الدولار الأمريكي — السعر الرسمي", "US dollar — official rate")}</div>
            <div className="mt-1 text-4xl font-black">
              {n2(rates.sdgPer.USD)} <span className="text-lg font-bold">{t("جنيه", "SDG")}</span>
            </div>
            <div className="mt-2 text-xs text-muted">
              {t("آخر تحديث من المصدر:", "Last updated by the source:")} {updated}
            </div>
          </div>

          <table className="mb-8 w-full overflow-hidden rounded-2xl border border-border bg-card text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("العملة", "Currency")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("بالجنيه السوداني", "In Sudanese pounds")}</th>
              </tr>
            </thead>
            <tbody>
              {FX_CURRENCIES.map((c) => (
                <tr key={c} className="border-t border-border">
                  <td className="px-4 py-2">
                    {locale === "en" ? FX_NAME[c].en : FX_NAME[c].ar} <span className="text-muted">({c})</span>
                  </td>
                  <td className="px-4 py-2 font-bold">{n2(rates.sdgPer[c])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-3 text-lg font-bold">{t("محوّل العملات", "Currency converter")}</h2>
          <FxConverter sdgPer={rates.sdgPer} />
        </>
      )}

      <section className="mt-8 flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">{t("من أين تأتي الأسعار", "Where the rates come from")}</h2>
        <p className="leading-relaxed">
          {t(
            "من خدمة ExchangeRate-API المفتوحة، وهي تتبع المصادر الرسمية وتُحدَّث يومياً. سعر السوق الموازي سيُضاف بجانبه يدوياً مع تاريخه، لأنّه لا مصدر آلياً موثوقاً له.",
            "From ExchangeRate-API's open service, which follows official sources and updates daily. The parallel-market rate will be added beside it by hand, with its date, because it has no reliable automatic source.",
          )}{" "}
          <a href={FX_SOURCE_URL} className="text-primary underline" target="_blank" rel="noopener noreferrer">
            Rates By Exchange Rate API
          </a>
        </p>
        <p className="leading-relaxed">
          {t("تستعمل الأسعار هنا ", "The rates here feed the ")}
          <Link href="/tools/feasibility" className="text-primary underline">
            {t("دراسة الجدوى المرحلية", "staged feasibility study")}
          </Link>
          {t(" لتحويل التكلفة بين الدولار والجنيه.", ", which converts its cost between dollars and pounds.")}
        </p>
      </section>

      <div className="mt-6">
        <ShareWhatsApp
          text={t("أسعار العملات مقابل الجنيه السوداني — سوداقري", "Exchange rates against the Sudanese pound — Sudagri")}
          path="/rates"
          locale={locale}
        />
      </div>
    </div>
  );
}
