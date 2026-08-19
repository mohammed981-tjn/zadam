import Link from "next/link";
import FeasibilityStudy from "@/components/FeasibilityStudy";
import { loadCropMarkets } from "@/lib/marketData";

export const metadata = {
  title: "دراسة الجدوى المرحلية — سودجري",
};

/**
 * The fourth of the engineer's four points, made usable.
 *
 * "Separate financial contracting for each phase, after a feasibility study for
 * that phase." The platform could already cost a whole season; what it could
 * not do was answer the question a farmer actually faces, which is never "is
 * this season viable" in the abstract but "having spent what I have spent, do I
 * pay the next instalment".
 */
export default async function FeasibilityPage() {
  const markets = await loadCropMarkets();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted">أداة · سودجري</p>
        <h1 className="text-3xl font-bold leading-tight">
          دراسة الجدوى المرحلية
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          الموسم لا يُدفع دفعةً واحدة، والحصاد يأتي مرّة في آخره. فالسؤال ليس
          «هل الموسم مجدٍ» بل <strong>«وقد أنفقتُ ما أنفقت، هل أدفع القسط
          التالي؟»</strong> — وهذه الأداة تجيبه مرحلةً مرحلة.
        </p>
      </header>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-sm leading-relaxed">
        <h2 className="mb-2 font-semibold">كيف تقرأ النتيجة</h2>
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
      </section>

      <FeasibilityStudy markets={markets} />

      <section className="flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">
          من أين تأتي الأرقام
        </h2>
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
      </section>
    </main>
  );
}
