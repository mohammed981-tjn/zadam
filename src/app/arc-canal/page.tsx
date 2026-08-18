import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NotifyMeForm from "@/components/NotifyMeForm";
import type { ArcCanalFinding, ArcCanalVerdict } from "@/types/database";

export const metadata = {
  title: "القناة القوسية — قراءة صادقة في الأرقام | سودجري",
};

/**
 * The Arc Canal, shown to investors without the varnish.
 *
 * The brief was to present the project attractively. The reason this page
 * leads with what does not hold up is not caution — it is that the alternative
 * does not work. Anyone with the money to fund a scheme at this scale employs
 * people whose job is to find the weak number, and they will find the same ones
 * found here in an afternoon. A page that hid them would be discovered, and
 * everything else on the platform would be read in that light afterwards.
 *
 * So the order is deliberate: the honest verdicts first, then the part that is
 * genuinely investable now. The second is worth more because the first is
 * there.
 */

const VERDICT: Record<
  ArcCanalVerdict,
  { label: string; className: string; note: string }
> = {
  sound: {
    label: "يصمد",
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800",
    note: "راجعناه فوجدناه صحيحاً",
  },
  self_corrected: {
    label: "صحّحته الدراسة",
    className: "border-sky-600/30 bg-sky-600/10 text-sky-800",
    note: "أمسكت الدراسة خطأها بنفسها وأعلنته",
  },
  overstated: {
    label: "مبالغ فيه",
    className: "border-amber-600/30 bg-amber-600/10 text-amber-900",
    note: "الاتجاه صحيح والمقدار لا",
  },
  unsupported: {
    label: "بلا سند",
    className: "border-rose-600/30 bg-rose-600/10 text-rose-800",
    note: "لم نجد له أساساً في الوثائق",
  },
};

const ORDER: ArcCanalVerdict[] = [
  "sound",
  "self_corrected",
  "overstated",
  "unsupported",
];

export default async function ArcCanalPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("arc_canal_findings")
    .select("*")
    .order("sort_order");

  const findings = (data ?? []) as ArcCanalFinding[];
  const counts = Object.fromEntries(
    ORDER.map((v) => [v, findings.filter((f) => f.verdict === v).length]),
  ) as Record<ArcCanalVerdict, number>;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-4">
        <p className="text-sm text-muted">دراسة مستقلّة · سودجري</p>
        <h1 className="text-3xl font-bold leading-tight">
          القناة القوسية الكبرى — قراءة صادقة في الأرقام
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          مشروع لريّ نصف مليون فدان غرب أم درمان من قناة طولها ٢٧٠–٢٩٥ كم. وصلتنا
          إحدى عشرة وثيقة عنه، ستٌّ منها مختلفة. راجعناها بنداً بنداً، وقارنّا كل
          رقم قابل للفحص ببيانات مقيسة.
        </p>
      </header>

      {/* The headline, stated once and plainly. */}
      <section className="rounded-xl border border-amber-600/30 bg-amber-600/5 p-5">
        <h2 className="mb-3 text-lg font-semibold">الخلاصة في سطرين</h2>
        <p className="leading-relaxed">
          الفكرة الهندسية سليمة والموقع مدروس جيداً. لكن المشروع بحجمه المعلن —
          نصف مليون فدان و١٫٥ مليار دولار — <strong>لا يجتاز عتبة الجدوى التي
          وضعها لنفسه</strong>: يشترط إنتاجية تتجاوز ٢٬٠٠٠ دولار للفدان، وأعلى
          محصول سوداني نحسبه من الغلّة الحقيقية يبلغ ١٬٨٢٧ دولاراً — والذرة
          الرفيعة ٧١.
        </p>
        <p className="mt-3 leading-relaxed">
          وهذا لا يُنهي المشروع. بداخله نواةٌ صغيرةٌ قابلة للاستثمار اليوم، وهي
          في الأسفل.
        </p>
      </section>

      {/* Scoreboard. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ORDER.map((v) => (
          <div
            key={v}
            className={`rounded-lg border p-3 text-center ${VERDICT[v].className}`}
          >
            <div className="text-2xl font-bold">{counts[v]}</div>
            <div className="text-sm font-medium">{VERDICT[v].label}</div>
            <div className="mt-1 text-xs opacity-80">{VERDICT[v].note}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">البنود، واحداً واحداً</h2>
        <p className="text-sm text-muted">
          كل بند يحمل رقم الدراسة، وحكمنا عليه، والأساس الذي حكمنا به. من يخالفنا
          يستطيع أن يرى من أين جاء الرقم بدل أن يصدّقنا.
        </p>

        <ul className="flex flex-col gap-4">
          {findings.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT[f.verdict].className}`}
                >
                  {VERDICT[f.verdict].label}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {f.axis}
                </span>
                <span className="text-xs text-muted">{f.source_doc}</span>
              </div>

              <p className="font-medium leading-relaxed">{f.claim}</p>

              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {f.study_figure && (
                  <div className="rounded-lg bg-background px-3 py-2">
                    <dt className="text-xs text-muted">رقم الدراسة</dt>
                    <dd className="font-medium">{f.study_figure}</dd>
                  </div>
                )}
                {f.platform_figure && (
                  <div className="rounded-lg bg-background px-3 py-2">
                    <dt className="text-xs text-muted">ما تقوله البيانات</dt>
                    <dd className="font-medium">{f.platform_figure}</dd>
                  </div>
                )}
              </dl>

              <p className="mt-3 text-sm leading-relaxed text-muted">
                {f.basis}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* The point of the page. */}
      <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="text-xl font-semibold">
          النواة القابلة للاستثمار — اليوم، لا بعد عشر سنوات
        </h2>

        <p className="leading-relaxed">
          كل اعتراضٍ أعلاه اعتراضٌ على <strong>الحجم</strong>، لا على الفكرة.
          الطاقة، والحصة المائية، وانهيار سعر البصل، والجدول الزمني — كلّها
          مشكلات تنشأ من نصف المليون فدان. اقسمها على مئة، فتختفي كلّها.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["٥–٢٠ ألف فدان", "بدل ٥٠٠ ألف"],
            ["٨–٣٠ مليون $", "بدل ١٬٥٠٠ مليون"],
            ["٢٠–٤٠ مليون م³", "بدل ٣ مليارات"],
          ].map(([big, small]) => (
            <div
              key={big}
              className="rounded-lg border border-border bg-card p-3 text-center"
            >
              <div className="text-lg font-bold">{big}</div>
              <div className="text-xs text-muted">{small}</div>
            </div>
          ))}
        </div>

        <ul className="flex list-disc flex-col gap-2 pr-5 leading-relaxed">
          <li>
            <strong>عند الطرف الشمالي (السروراب)</strong>، قريباً من النيل —
            فالرفع بضعة أمتار لا ٥٥، وتسقط معه محطة الـ٤٠٠ ميغاواط ومعضلتها.
          </li>
          <li>
            <strong>ريّ بالتنقيط لا بالغمر.</strong> محرّك FAO-56 في المنصّة
            يعطي ٢٬١٠١ م³ للفدان بالتنقيط مقابل ٣٬٤٣٨ بالغمر — وهذا وحده يقارب
            نصف الفجوة المائية التي تسمّيها الدراسة «هامش صفر».
          </li>
          <li>
            <strong>خضر عالية القيمة لسوق الخرطوم والتصدير الخليجي</strong> —
            وبمساحةٍ لا تُغرق السوق، وهو ما يجعل رقم ١٬٨٢٧ دولاراً للفدان قابلاً
            للتحقق بدل أن ينهار تحت ثقل المساحة.
          </li>
          <li>
            <strong>ولا يحتاج مرسوماً سيادياً بحصة مائية.</strong> هذه وحدها
            تختصر سنواتٍ من المسار.
          </li>
        </ul>

        <p className="leading-relaxed">
          والأهم: هذه النواة <strong>هي</strong> «المرحلة صفر» التي تطلبها
          الدراسة بـ١٠–١٨ مليون دولار من الدراسات. الفرق أن المزرعة تنتج غلّةً
          وتكاليفَ واستهلاكَ ماءٍ <em>مقيسة</em> بدل أن تقدّرها — ثم تبيع محصولاً
          أثناء ذلك.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">
          مهتمّ بالنواة الأولى؟ اترك اسمك
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          لا نجمع مالاً على هذه الصفحة ولا نعرض حصصاً. نجمع أسماء من يريد أن
          يُبلَّغ حين تكتمل دراسة النواة التفصيلية بأرقامها الميدانية.
        </p>
        <NotifyMeForm interest="القناة القوسية — النواة الأولى" />
      </section>

      <section className="flex flex-col gap-3 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">من أين جاءت الأرقام</h2>
        <p className="leading-relaxed">
          الغلّة وقيمة الوحدة التصديرية من قاعدة FAOSTAT المحمَّلة في المنصّة
          (٦٣٬١٥٠ مشاهدة، ٢٠١٧–٢٠٢٤). الأمطار من NASA POWER — مناخ MERRA-2
          لعشرين سنة، مقيساً عند إحداثيات كل نقطة بعينها. الاحتياج المائي من
          محرّك FAO-56 داخل المنصّة نفسها، وهو المحرّك الذي تستعمله{" "}
          <Link href="/tools/water" className="text-primary underline">
            حاسبة الاحتياج المائي
          </Link>{" "}
          — يمكنك أن تعيد الحساب بنفسك.
        </p>
        <p className="leading-relaxed">
          وما نقلناه عن الدراسات منسوبٌ إلى وثيقته في كل بند. هذه قراءتنا نحن،
          وليست وثيقةً رسمية من أصحاب المشروع.
        </p>
      </section>
    </main>
  );
}
