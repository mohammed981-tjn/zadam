import Link from "next/link";
import FeasibilityStudy from "@/components/FeasibilityStudy";
import { loadCropMarkets } from "@/lib/marketData";
import { readFxReference } from "@/lib/fxRates";
import { fetchSudanLocust } from "@/lib/locust";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "دراسة الجدوى المرحلية — سوداقري", "Phased feasibility study — Sudagri"),
  };
}

/**
 * The fourth of the engineer's four points, made usable.
 *
 * "Separate financial contracting for each phase, after a feasibility study for
 * that phase." The platform could already cost a whole season; what it could
 * not do was answer the question a farmer actually faces, which is never "is
 * this season viable" in the abstract but "having spent what I have spent, do I
 * pay the next instalment".
 */
export default async function FeasibilityPage({ searchParams }: { searchParams: Promise<{ crop?: string }> }) {
  const { crop } = await searchParams;
  /*
   * null means the reference could not be read at all, which is not the same
   * as a crop having no reference — and the difference has to reach the reader.
   *
   * Falling back to an empty map would render every crop as "no price
   * reference", which is a claim about Sudanese agriculture rather than about
   * an outage on our side. The tool itself still works either way: the cost and
   * water sides are computed locally, and the study already accepts a price
   * typed by hand. So the degradation is honest and usable — it just has to say
   * which of the two happened.
   */
  const [markets, locust] = await Promise.all([loadCropMarkets(), fetchSudanLocust()]);
  const fx = readFxReference();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t("أداة · سوداقري", "Tool · Sudagri")}</p>
        <h1 className="text-3xl font-bold leading-tight">
          {t("دراسة الجدوى المرحلية", "Phased feasibility study")}
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          {en ? (
            <>
              A season is not paid for in one go, and the harvest comes once, at the end. So the question is not
              &ldquo;is the season viable&rdquo; but{" "}
              <strong>&ldquo;having spent what I have spent, do I pay the next instalment?&rdquo;</strong> — and this
              tool answers it phase by phase.
            </>
          ) : (
            <>
              الموسم لا يُدفع دفعةً واحدة، والحصاد يأتي مرّة في آخره. فالسؤال ليس
              «هل الموسم مجدٍ» بل <strong>«وقد أنفقتُ ما أنفقت، هل أدفع القسط
              التالي؟»</strong> — وهذه الأداة تجيبه مرحلةً مرحلة.
            </>
          )}
        </p>
        <ShareWhatsApp
          path="/tools/feasibility"
          text={t(
            "دراسة جدوى مرحلية: أين آخر مخرج آمن قبل أن تُنفق أكثر؟",
            "A phased feasibility study: where is the last safe exit before you spend more?",
          )}
          locale={locale}
          className="my-3"
        />
      </header>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-sm leading-relaxed">
        <h2 className="mb-2 font-semibold">{t("كيف تقرأ النتيجة", "How to read the result")}</h2>
        {en ? (
          <>
            <p>
              At each phase we add up what has been spent by its end, then turn it into{" "}
              <strong>the yield that pays it back at harvest</strong>. That yield rises with every instalment, and at
              some phase it goes beyond what this crop actually achieves in Sudan.
            </p>
            <p className="mt-2">
              That phase is the <strong>last safe exit</strong>: the last point at which stopping is the cheaper
              mistake. It is entirely missing from any study that gives one number for the whole season, because a
              single number assumes everything has already been paid.
            </p>
          </>
        ) : (
          <>
            <p>
              عند كل مرحلة نجمع ما أُنفق حتى نهايتها، ثم نحوّله إلى{" "}
              <strong>الغلّة التي تُعيده عند الحصاد</strong>. هذه الغلّة ترتفع مع كل
              قسط، وعند مرحلةٍ ما تتجاوز ما يبلغه هذا المحصول فعلاً في السودان.
            </p>
            <p className="mt-2">
              تلك المرحلة هي <strong>آخر مخرج آمن</strong>: آخر نقطة يكون التوقّف
              عندها هو الخطأ الأرخص. وهي غائبة تماماً عن أي دراسة تُعطي رقماً واحداً
              للموسم كلّه، لأن الرقم الواحد يفترض أن كل شيء دُفع أصلاً.
            </p>
          </>
        )}
      </section>

      {markets === null && (
        <section className="rounded-xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
          <h2 className="mb-2 font-semibold">
            {t("تعذّر الوصول إلى مرجعية FAOSTAT الآن", "The FAOSTAT reference cannot be reached right now")}
          </h2>
          {en ? (
            <>
              <p>
                The fault is ours, not the crops&apos;: the reference exists and we could not read it at this moment.
                So do not read the dashes below as &ldquo;there is no reference price for this crop&rdquo;.
              </p>
              <p className="mt-2">
                The rest of the study works as usual — cost and water need are computed in your browser —{" "}
                <strong>so enter your price by hand</strong> and the result will be complete.
              </p>
            </>
          ) : (
            <>
              <p>
                الخلل عندنا لا في المحاصيل: المرجعية موجودة، ولم نستطع قراءتها في
                هذه اللحظة. فلا تقرأ الشُّرَط أدناه على أنها «لا يوجد سعر مرجعي
                لهذا المحصول».
              </p>
              <p className="mt-2">
                وبقيّة الدراسة تعمل كما هي — التكلفة والاحتياج المائي محسوبان داخل
                متصفحك — <strong>فأدخِل سعرك يدوياً</strong> وستكتمل النتيجة.
              </p>
            </>
          )}
        </section>
      )}

      <FeasibilityStudy markets={markets ?? {}} initialCrop={crop} sdgPerUsd={fx?.bank.sell ?? null} sdgPerUsdParallel={fx?.parallel.sell ?? null} locust={locust} />

      <section className="flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">
          {t("من أين تأتي الأرقام", "Where the numbers come from")}
        </h2>
        {en ? (
          <>
            <p className="leading-relaxed">
              Yield and price come from the FAOSTAT reference loaded into the platform. The water need comes from the
              same FAO-56 engine behind the{" "}
              <Link href="/tools/water" className="text-primary underline">
                water requirement calculator
              </Link>
              . The phase instalments use the same shares as the platform&apos;s season budget releases, so the study
              cannot differ from the contract built on it.
            </p>
            <p className="leading-relaxed">
              You enter the operations cost yourself: providers&apos; prices vary by region and season, and the{" "}
              <Link href="/services" className="text-primary underline">
                services catalogue
              </Link>{" "}
              shows verified providers&apos; prices to build your figure from.
            </p>
          </>
        ) : (
          <>
            <p className="leading-relaxed">
              الغلّة والسعر من مرجعية FAOSTAT المحمَّلة في المنصّة. الاحتياج المائي
              من محرّك FAO-56 نفسه الذي تعمل به{" "}
              <Link href="/tools/water" className="text-primary underline">
                حاسبة الاحتياج المائي
              </Link>
              . ونسب أقساط المراحل هي نفسها نسب صرف ميزانية الموسم في المنصّة، حتى لا
              تختلف الدراسة عن العقد الذي تُبنى عليه.
            </p>
            <p className="leading-relaxed">
              وتكلفة العمليات تُدخِلها أنت: تسعيرة المزوّدين تختلف بالمنطقة والموسم،
              و
              <Link href="/services" className="text-primary underline">
                كتالوج الخدمات
              </Link>{" "}
              يعرض أسعار الجهات الموثّقة لتبني منها رقمك.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
