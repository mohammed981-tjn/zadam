import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeArabic } from "@/lib/retrieval";
import type { KnowledgeEntry, Lead } from "@/types/database";

interface QuestionRow {
  id: string;
  question: string;
  matched_entries: number;
  answered: boolean;
  created_at: string;
}

/** Words that carry no signal when counting what visitors ask about. */
const NOISE = new Set(
  [
    "من",
    "في",
    "على",
    "عن",
    "الي",
    "الى",
    "هل",
    "ما",
    "ماذا",
    "كيف",
    "متي",
    "اين",
    "لماذا",
    "هو",
    "هي",
    "هذا",
    "هذه",
    "ذلك",
    "التي",
    "الذي",
    "و",
    "او",
    "كان",
    "يكون",
    "مع",
    "كل",
    "بعض",
    "غير",
    "بين",
    "عند",
    "لكن",
    "اريد",
    "افضل",
    "يمكن",
    "يجب",
    "لدي",
    "عندي",
    "انا",
    "نحن",
    "افضلها",
    "شنو",
  ].map(normalizeArabic),
);

/**
 * Kept out of the component body: reading the clock during render is impure,
 * and the lint rule is right to object to it.
 */
function countLastWeek(
  questions: { created_at: string }[],
  leads: { created_at: string }[],
) {
  const cutoff = Date.now() - 7 * 86_400_000;
  const since = (rows: { created_at: string }[]) =>
    rows.filter((r) => new Date(r.created_at).getTime() > cutoff).length;

  return { recentQuestions: since(questions), recentLeads: since(leads) };
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const [{ data: questionRows }, { data: leadRows }, { data: kbRows }] =
    await Promise.all([
      supabase
        .from("assistant_questions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("knowledge_entries").select("crop, topic, title"),
    ]);

  const questions = (questionRows ?? []) as QuestionRow[];
  const leads = (leadRows ?? []) as Lead[];
  const kb = (kbRows ?? []) as Pick<
    KnowledgeEntry,
    "crop" | "topic" | "title"
  >[];

  // Questions the retriever matched nothing for: the shortest path to knowing
  // what the knowledge base is missing.
  const gaps = questions.filter((q) => q.matched_entries === 0);
  const failed = questions.filter((q) => !q.answered);

  const termCounts = new Map<string, number>();
  for (const q of questions) {
    const seen = new Set<string>();
    for (const raw of normalizeArabic(q.question).split(/[^\p{L}\p{N}]+/u)) {
      if (raw.length <= 2 || NOISE.has(raw) || seen.has(raw)) continue;
      seen.add(raw);
      termCounts.set(raw, (termCounts.get(raw) ?? 0) + 1);
    }
  }
  const topTerms = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18);

  const { recentQuestions, recentLeads } = countLastWeek(questions, leads);

  const cropCounts = new Map<string, number>();
  for (const e of kb) cropCounts.set(e.crop, (cropCounts.get(e.crop) ?? 0) + 1);

  const cards = [
    {
      l: "أسئلة مسجّلة",
      v: questions.length,
      s: `${recentQuestions} خلال أسبوع`,
    },
    { l: "بلا إجابة في القاعدة", v: gaps.length, s: "فجوات معرفية" },
    { l: "عملاء محتملون", v: leads.length, s: `${recentLeads} خلال أسبوع` },
    { l: "مُدخلات المعرفة", v: kb.length, s: `${cropCounts.size} موضوعاً` },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">تحليلات المنصة</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        ما يسأل عنه الزوار هو أرخص بحث سوق ممكن — والأسئلة التي عجزت قاعدة
        المعرفة عن مطابقتها هي قائمة جاهزة بما يجب كتابته تالياً.
      </p>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.l}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted">{c.l}</p>
            <p className="mt-1 text-2xl font-black">{c.v}</p>
            <p className="text-xs text-muted">{c.s}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">
          فجوات قاعدة المعرفة ({gaps.length})
        </h2>
        <p className="mb-4 text-sm text-muted">
          أسئلة لم يجد لها المسترجِع أي مُدخل مطابق. كل سطر هنا مُدخل معرفة
          ينقصك.
        </p>
        {gaps.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            لا توجد فجوات مسجّلة — كل سؤال حتى الآن وجد ما يطابقه.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gaps.slice(0, 25).map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm"
              >
                {q.question}
                <span className="mr-2 text-xs text-muted">
                  {new Date(q.created_at).toLocaleDateString("ar-EG")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">أكثر ما يسأل عنه الزوار</h2>
        {topTerms.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            لم تُسجّل أسئلة بعد.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topTerms.map(([term, count]) => (
              <span
                key={term}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
              >
                {term}
                <span className="mr-2 text-xs font-bold text-primary">
                  {count}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {failed.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">
            أسئلة فشل المحرّك في الرد عليها ({failed.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {failed.slice(0, 10).map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm"
              >
                {q.question}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">تغطية قاعدة المعرفة</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-right">
              <tr>
                <th className="px-4 py-3">الموضوع</th>
                <th className="px-4 py-3">عدد المُدخلات</th>
              </tr>
            </thead>
            <tbody>
              {[...cropCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([crop, count]) => (
                  <tr key={crop} className="border-t border-border">
                    <td className="px-4 py-2">{crop}</td>
                    <td className="px-4 py-2">{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/admin/leads" className="text-primary underline">
          عرض بيانات العملاء المحتملين
        </Link>
      </p>
    </div>
  );
}
