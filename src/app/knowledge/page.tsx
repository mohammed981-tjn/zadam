import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import KnowledgeCard from "@/components/KnowledgeCard";
import { topicLabel } from "@/lib/format";
import type { KnowledgeEntry } from "@/types/database";

export const metadata = {
  title: "قاعدة المعرفة الزراعية · سودجري",
  description:
    "تجارب زراعية موثّقة، كلٌّ منها بدولتها المرجعية وبتنبيهٍ متى تحتاج المعلومة تحققاً محلياً قبل تطبيقها في السودان.",
};

/**
 * قاعدة المعرفة — الصفحة التي كانت تُوعَد ولا توجد.
 *
 * WHY THIS FILE IS A BUG FIX AND NOT A FEATURE
 *
 * The landing page linked `/knowledge` twice — once from the tool grid and once
 * from a «القاعدة كاملة ←» call to action under the heading «أحدث ما في قاعدة
 * المعرفة». There was no `src/app/knowledge` directory. Both links returned
 * 404, and had done since the links were written: the route appears nowhere in
 * the repository's history.
 *
 * Behind them sit 152 entries, 116 of them eligible for public listing. The
 * single richest thing the platform owns was one dead href away from every
 * visitor it ever had.
 *
 * WHY THE TWO FILTERS ARE THE ONES THE HOME PAGE USES
 *
 * `assistant_only` entries are regional reference material the assistant reads
 * and the pages do not show; mining lives in `/mining` because mixing it into
 * an agricultural feed confuses the visitor who came for one of the two. This
 * page must agree with the home page it continues, or «القاعدة كاملة» would
 * show a different base than the one it promised.
 *
 * وتعذّرُ القراءة ليس «لا مداخل»
 *
 * A failed read renders as an empty knowledge base — a claim about the
 * platform — so the two are told apart, as they are on the farmer page.
 */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("*")
    .neq("crop", "تعدين")
    .eq("assistant_only", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("knowledge: read failed", error);
  }

  const all = (data ?? []) as KnowledgeEntry[];

  // تُبنى من المداخل نفسِها لا من قائمةٍ ثابتة: موضوعٌ لا مدخلَ له زرٌّ يقود
  // إلى فراغ، وموضوعٌ يُضاف لاحقاً كان سيغيب عن قائمةٍ مكتوبةٍ باليد.
  const topics = [...new Set(all.map((e) => e.topic))].sort();
  const active = topic && topics.includes(topic as never) ? topic : null;
  const entries = active ? all.filter((e) => e.topic === active) : all;

  const chip =
    "rounded-full border px-3 py-1.5 text-sm transition hover:border-primary";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">قاعدة المعرفة الزراعية</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        تجارب موثّقة من دولٍ سبقتنا في محاصيلَ نزرعها. وكلُّ مدخلٍ يحمل{" "}
        <strong className="text-foreground">دولته المرجعية</strong> — لأنّ ما
        نجح في مصر أو الهند ليس وعداً بأن ينجح في الجزيرة، والفرقُ في التربة
        والمناخ والسوق. اقرأها على أنّها نقطةُ بداية للسؤال، لا جواباً نهائياً.
      </p>

      {error ? (
        <p className="mt-8 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
          تعذّر قراءة قاعدة المعرفة الآن — <strong>والخلل عندنا</strong>، لا أنّ
          القاعدة فارغة. أعد المحاولة بعد قليل.
        </p>
      ) : all.length === 0 ? (
        <p className="mt-8 text-muted">قاعدة المعرفة قيد الإعداد حالياً.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/knowledge"
              className={`${chip} ${active ? "border-border" : "border-primary bg-primary/10 text-primary"}`}
            >
              الكل ({all.length})
            </Link>
            {topics.map((t) => (
              <Link
                key={t}
                href={`/knowledge?topic=${encodeURIComponent(t)}`}
                className={`${chip} ${active === t ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {topicLabel(t)} ({all.filter((e) => e.topic === t).length})
              </Link>
            ))}
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      )}

      <p className="mt-10 rounded-2xl border border-border bg-card p-5 text-sm leading-7 text-muted">
        ولم تجد ما تبحث عنه؟{" "}
        <Link href="/feedback" className="text-primary underline">
          اكتب لنا
        </Link>{" "}
        بالمحصول والسؤال — فما يُسأل عنه مرّتين يُضاف. ولقسم التعدين قاعدتُه
        الخاصّة في{" "}
        <Link href="/mining" className="text-primary underline">
          صفحة التعدين
        </Link>
        .
      </p>
    </div>
  );
}
