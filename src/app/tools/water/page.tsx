import WaterCalculator from "@/components/WaterCalculator";

export const metadata = {
  title: "حاسبة الاحتياج المائي | سودجري",
  description:
    "احسب كم يحتاج محصولك من الماء بمعيار FAO-56، شهراً بشهر، حسب منطقتك وطريقة الري.",
};

export default function WaterToolPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">حاسبة الاحتياج المائي</h1>
      <p className="mb-2 mt-2 text-sm text-muted">
        كم يحتاج محصولك من الماء فعلاً؟ الحاسبة تطبّق معيار{" "}
        <span dir="ltr">FAO-56</span> المعتمد دولياً: تحسب البخر-نتح المرجعي من
        خط عرض منطقتك ودرجات حرارتها، ثم تضربه في معامل المحصول عبر مراحل نموّه،
        وتخصم المطر الفعّال، وتقسم على كفاءة طريقة الري.
      </p>
      <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        البيانات المناخية المستخدمة{" "}
        <strong className="font-bold">معدلات استرشادية</strong> للتخطيط، وليست
        سجلات محطة مقيسة. استخدم النتيجة لتقدير الحجم والتكلفة، وراجعها مع
        الإرشاد الزراعي قبل تصميم شبكة ري فعلية.
      </p>
      <WaterCalculator />
    </div>
  );
}
