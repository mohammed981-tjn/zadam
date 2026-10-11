import WaterCalculator from "@/components/WaterCalculator";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import WeekForecast from "@/components/WeekForecast";
import FilmPlayer from "@/components/FilmPlayer";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "حاسبة الاحتياج المائي | سوداقري", "Water requirement calculator | Sudagri"),
    description: tr(
      locale,
      "احسب كم يحتاج محصولك من الماء بمعيار FAO-56، شهراً بشهر، حسب منطقتك وطريقة الري.",
      "Work out how much water your crop needs with the FAO-56 standard, month by month, for your region and irrigation method.",
    ),
  };
}

export default async function WaterToolPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("حاسبة الاحتياج المائي", "Water requirement calculator")}</h1>
      <p className="mb-2 mt-2 text-sm text-muted">
        {locale === "en" ? (
          <>
            How much water does your crop really need? The calculator applies the internationally recognised{" "}
            FAO-56 standard: it computes reference evapotranspiration from your region&apos;s latitude and
            temperatures, multiplies it by the crop coefficient across the growth stages, subtracts the effective
            rain, and divides by the efficiency of the irrigation method.
          </>
        ) : (
          <>
            كم يحتاج محصولك من الماء فعلاً؟ الحاسبة تطبّق معيار{" "}
            <span dir="ltr">FAO-56</span> المعتمد دولياً: تحسب البخر-نتح المرجعي من
            خط عرض منطقتك ودرجات حرارتها، ثم تضربه في معامل المحصول عبر مراحل نموّه،
            وتخصم المطر الفعّال، وتقسم على كفاءة طريقة الري.
          </>
        )}
      </p>
      <ShareWhatsApp
        path="/tools/water"
        text={t(
          "كم يحتاج محصولك من الماء؟ حاسبة مجانية على مناخ ولايتك:",
          "How much water does your crop need? A free calculator based on your state's climate:",
        )}
        locale={locale}
        className="my-3"
      />

      <figure className="my-6">
        <FilmPlayer
          base="/video/water-wide"
          poster="/video/water-wide.jpg"
          label={t("فيلم سوداقري: ماءٌ في مكانه", "A Sudagri film: water where it belongs")}
        />
      </figure>
      <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        {locale === "en" ? (
          <>
            The climate data used are <strong className="font-bold">indicative averages</strong> for planning, not
            measured station records. Use the result to estimate size and cost, and check it with an agricultural
            extension officer before designing an actual irrigation network.
          </>
        ) : (
          <>
            البيانات المناخية المستخدمة{" "}
            <strong className="font-bold">معدلات استرشادية</strong> للتخطيط، وليست
            سجلات محطة مقيسة. استخدم النتيجة لتقدير الحجم والتكلفة، وراجعها مع
            الإرشاد الزراعي قبل تصميم شبكة ري فعلية.
          </>
        )}
      </p>
      <WaterCalculator />
      <WeekForecast />
    </div>
  );
}
