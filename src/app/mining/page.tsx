import { createClient } from "@/lib/supabase/server";
import KnowledgeCard from "@/components/KnowledgeCard";
import type { KnowledgeEntry } from "@/types/database";

export const metadata = {
  title: "التعدين | سودجري",
  description:
    "معرفة عملية للمعدّنين: السلامة، والاستخلاص بلا زئبق، وجيولوجيا الذهب في السودان.",
};

export default async function MiningPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("crop", "تعدين")
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as KnowledgeEntry[];

  return (
    <div>
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <div className="mb-3 text-4xl">⛏️</div>
          <h1 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
            قسم التعدين
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            قسم مستقل تماماً عن الزراعة. هدفه الآن واحد: معرفة تحمي حياة المعدّن
            — السلامة في الحفر، والاستخلاص بلا زئبق، وأين يوجد الذهب ولماذا.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-danger">
            <span aria-hidden>⚠️</span> اقرأ هذا قبل أي شيء
          </h2>
          <p className="text-sm leading-relaxed">
            حرق ملغم الزئبق في مكان مغلق أو قرب السكن يسمّم من فيه لا العامل
            وحده، والضرر العصبي منه لا يُشفى. والنزول لإنقاذ مصاب في حفرة بلا
            تهوية يقتل المُنقِذ أيضاً — أغلب حوادث الاختناق تأخذ اثنين لا
            واحداً. التفاصيل العملية في البطاقات أدناه، واسأل مساعد سودجري عن أي
            منها.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold">
          معرفة التعدين ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="text-muted">قيد الإعداد.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border border-border bg-card p-6">
          <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            قيد التطوير
          </span>
          <h2 className="mb-3 text-lg font-bold">
            سجلّ إثبات المنشأ — الخطوة القادمة
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            نبني سجلاً يوثّق سلسلة الحيازة: موقع الاستخراج بإحداثياته، ومن
            استخرج، وبأي طريقة، وكيف انتقل. تسجيل معلومات فقط — لا بيع ولا وساطة
            ولا عمولة.
          </p>
          <div className="mb-4 rounded-xl bg-background p-4 text-sm leading-relaxed">
            <p className="mb-2 font-bold">لماذا هذا وليس سوق تداول؟</p>
            <p className="text-muted">
              في ١٣ يوليو ٢٠٢٦ حظر الاتحاد الأوروبي شراء واستيراد ونقل الذهب
              سوداني المنشأ من أي جهة داخله، وبعده بأيام فرضت بريطانيا عقوبات
              على شبكات ذهب سودانية. أي منصة تربط بائعاً بمشترٍ دولي اليوم لن
              تجد مشترياً قانونياً. لكن القيمة في هذا القطاع انتقلت أصلاً من
              امتلاك الذهب إلى{" "}
              <strong className="text-foreground">إثبات مصدره</strong>، ومن يبني
              هذا الإثبات الآن يكون جاهزاً ببيانات سنوات حين تُفتح القناة — لا
              بنظام فارغ.
            </p>
          </div>
          <p className="text-sm text-muted">
            الذهب المستخرج بلا زئبق له سوق مستعدّ يدفع أكثر — وهذا ما سيوثّقه
            السجل أولاً.
          </p>
        </div>
      </section>
    </div>
  );
}
