import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import KnowledgeCard from "@/components/KnowledgeCard";
import MineralsMap, { GROUPS, MINERALS, type MineralSite } from "@/components/MineralsMap";
import { arDigits } from "@/components/RainMap";
import type { KnowledgeEntry } from "@/types/database";

export const metadata = {
  title: "التعدين | سوداغري",
  description:
    "معرفة عملية للمعدّنين: السلامة، والاستخلاص بلا زئبق، وجيولوجيا الذهب في السودان.",
};

export default async function MiningPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("crop", "تعدين")
    .eq("assistant_only", false)
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as KnowledgeEntry[];

  // Largest group first: oil and gold are what most readers came for.
  const groups = new Map<string, MineralSite[]>();
  for (const s of MINERALS.sites) groups.set(s.commodityAr, [...(groups.get(s.commodityAr) ?? []), s]);
  const byCommodity = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

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
            واحداً. التفاصيل العملية في البطاقات أدناه، واسأل مساعد سوداغري عن أي
            منها.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-2 text-xl font-bold">خريطة المعادن في السودان</h2>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
          {arDigits(MINERALS.sites.length)} موقعاً: المناجم والمصانع وحقول النفط
          كما سجّلها المسح الجيولوجي الأمريكي لسنة {arDigits(MINERALS.asOf)}، قبل
          الحرب، ومعها الرواسب المعروفة. هي خريطة لمكان المعادن، لا لمن يعمل فيها
          اليوم.
        </p>
        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <MineralsMap />
          </div>
          <div className="flex flex-col gap-2">
            {byCommodity.map(([commodity, sites]) => (
              <details key={commodity} className="rounded-xl border border-border bg-card px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 font-bold">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ background: GROUPS[sites[0].group].ink }}
                    aria-hidden
                  />
                  {commodity}
                  <span className="text-sm font-normal text-muted">({arDigits(sites.length)})</span>
                </summary>
                <ul className="mt-3 flex flex-col gap-3 text-sm">
                  {sites.map((s, k) => (
                    <li key={k} className="border-t border-border pt-2">
                      <p className="font-medium">
                        {s.place ?? <span dir="ltr">{s.name}</span>}
                        {s.place && (
                          <span className="ms-2 text-xs text-muted" dir="ltr">
                            {s.name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {[
                          s.what,
                          s.also.length ? `ومعه: ${s.also.join("، ")}` : null,
                          s.state ? `ولاية ${s.state}` : null,
                          s.status,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {s.operator && (
                        <p className="text-xs text-muted" dir="ltr">
                          {s.operator}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              المصدر: المسح الجيولوجي الأمريكي (USGS)، «بيانات جغرافية لصناعات
              التعدين والبنية المرتبطة بها في أفريقيا»، ٢٠٢١، ملكية عامة. الأسماء
              بالعربية حيث الاسم العربي مؤكّد، وإلا تُركت كما كتبها المصدر.
            </p>
          </div>
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
            متاح الآن
          </span>
          <h2 className="mb-3 text-lg font-bold">سجلّ إثبات المنشأ</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            سجل يوثّق سلسلة الحيازة: موقع الاستخراج بإحداثياته، ومن استخرج، وبأي
            طريقة، وكيف انتقل. تسجيل معلومات فقط — لا بيع ولا وساطة ولا عمولة.
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
          <p className="mb-4 text-sm text-muted">
            الذهب المستخرج بلا زئبق له سوق مستعدّ يدفع أكثر — وهذا ما يوثّقه
            السجل أولاً.
          </p>
          <Link
            href="/mining/registry"
            className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            افتح سجلّ إثبات المنشأ
          </Link>
        </div>
      </section>
    </div>
  );
}
