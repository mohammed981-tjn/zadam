import Link from "next/link";
import FxConverter from "@/components/FxConverter";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import {
  CBOS_NOTE,
  FX_NAME,
  FX_SOURCE_URL,
  FX_STALE_DAYS,
  ageInDays,
  fetchCrossRates,
  poundsPer,
  readFxReference,
  type FxCurrency,
  type QuotedRate,
} from "@/lib/fxRates";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "أسعار العملات مقابل الجنيه السوداني | سوداقري", "Exchange rates against the Sudanese pound | Sudagri"),
    description: tr(
      locale,
      "سعر الدولار والريال والدرهم وغيرها بالجنيه السوداني: سعر البنك والسوق الموازي، كلٌّ بتاريخه ومصدره، مع محوّل للعملات.",
      "The dollar, riyal, dirham and others in Sudanese pounds: the bank rate and the parallel market, each with its date and source, with a converter.",
    ),
  };
}

const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default async function RatesPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const ref = readFxReference();
  const cross = await fetchCrossRates();
  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(en ? "en-GB" : "ar-SD-u-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const quote = (title: string, q: QuotedRate) => {
    const age = ageInDays(q.date);
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
        <div className="text-sm text-muted">{title}</div>
        <div className="mt-1 text-3xl font-black">
          {n2(q.sell)} <span className="text-base font-bold">{t("جنيه للدولار", "SDG per dollar")}</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {t(`شراء ${n2(q.buy)} · بيع ${n2(q.sell)}`, `Buy ${n2(q.buy)} · Sell ${n2(q.sell)}`)}
        </div>
        <div className={`mt-2 text-xs ${age > FX_STALE_DAYS ? "font-bold text-danger" : "text-muted"}`}>
          {t("بتاريخ", "As of")} {day(q.date)}
          {age > FX_STALE_DAYS && t(` — مضى ${age} أيام، فتحقّق قبل أن تعتمده`, ` — ${age} days old, check before relying on it`)}
          {" · "}
          <a href={q.source} className="underline" target="_blank" rel="noopener noreferrer">
            {t("المصدر", "Source")}
          </a>
        </div>
      </div>
    );
  };

  const bankTable = ref ? poundsPer(ref.bank.sell, cross) : {};
  const parallelTable = ref ? poundsPer(ref.parallel.sell, cross) : {};
  const rows = Object.keys(bankTable) as FxCurrency[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("أسعار العملات مقابل الجنيه السوداني", "Exchange rates against the Sudanese pound")}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        {t(
          "سعران للجنيه، لأنّ الفرق بينهما كبير: سعر البنك، وسعر السوق الموازي. كلٌّ بتاريخه ومصدره.",
          "Two rates for the pound, because the gap between them is large: the bank rate and the parallel-market rate, each with its date and source.",
        )}
      </p>

      {ref === null ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6 text-sm">
          {t("تعذّرت قراءة الأسعار الآن.", "The rates could not be read just now.")}
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {quote(t(`سعر البنك — ${ref.bank.name_ar}`, `Bank rate — ${ref.bank.name_en}`), ref.bank)}
            {quote(t("السوق الموازي", "Parallel market"), ref.parallel)}
          </div>

          <table className="mb-8 w-full overflow-hidden rounded-2xl border border-border bg-card text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("العملة", "Currency")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("بسعر البنك", "At the bank rate")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("بالسوق الموازي", "Parallel market")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c} className="border-t border-border">
                  <td className="px-4 py-2">
                    {en ? FX_NAME[c].en : FX_NAME[c].ar} <span className="text-muted">({c})</span>
                  </td>
                  <td className="px-4 py-2 font-bold">{n2(bankTable[c] ?? 0)}</td>
                  <td className="px-4 py-2">{n2(parallelTable[c] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-3 text-lg font-bold">{t("محوّل العملات", "Currency converter")}</h2>
          <FxConverter bank={bankTable} parallel={parallelTable} />
        </>
      )}

      <section className="mt-8 flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">{t("من أين تأتي الأسعار", "Where the rates come from")}</h2>
        <p className="leading-relaxed">
          {t(
            `نشرة بنك السودان المركزي على موقعه متوقّفة منذ ${day(CBOS_NOTE.lastBulletin)}، وفي ${day(CBOS_NOTE.liberalised)} حرّر البنك سعر الصرف وترك لكلّ مصرف أن يعلن سعره (المنشور ${CBOS_NOTE.circular}). لذلك نعرض سعر بنك الخرطوم، أكبر المصارف، وسعر السوق الموازي، ونحدّثهما يومياً من مصادر منشورة نذكرها بجانب كلّ رقم. ولا نعرض رقماً قديماً على أنّه سعر اليوم.`,
            `The Central Bank of Sudan's bulletin on its website has not been updated since ${day(CBOS_NOTE.lastBulletin)}, and on ${day(CBOS_NOTE.liberalised)} the bank freed the exchange rate and left each bank to announce its own (circular ${CBOS_NOTE.circular}). So we show the rate of the Bank of Khartoum, the largest bank, and the parallel market, updated daily from published sources named beside each figure. We never show an old figure as today's rate.`,
          )}{" "}
          <a href={CBOS_NOTE.liberalisedSource} className="text-primary underline" target="_blank" rel="noopener noreferrer">
            {t("خبر التحرير", "The liberalisation")}
          </a>
        </p>
        <p className="leading-relaxed">
          {t(
            "أسعار العملات الأخرى مقابل الدولار (الريال والدرهم واليورو…) من خدمة ExchangeRate-API المفتوحة.",
            "Other currencies against the dollar (riyal, dirham, euro…) come from ExchangeRate-API's open service.",
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
