import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { normalizeArabic } from "@/lib/retrieval";
import type { KnowledgeEntry, Lead } from "@/types/database";
import PromoteAnswer from "@/components/PromoteAnswer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

interface QuestionRow {
  id: string;
  question: string;
  /** What the assistant answered, kept so it can be reviewed into the base. */
  answer_text: string | null;
  promoted_at: string | null;
  matched_entries: number;
  answered: boolean;
  /**
   * Which layer answered. Null for anything logged before the column existed,
   * which is not the same as "the model answered" — see the split below.
   */
  answer_source: string | null;
  created_at: string;
}

/** The layers that cost nothing and cannot be hallucinated. */
const LOCAL_SOURCES = new Set([
  "canal",
  "calculator",
  "climate",
  "market",
  "knowledge",
  "platform",
]);

const SOURCE_LABEL: Record<string, string> = {
  canal: "ملفّ القناة",
  calculator: "حاسبة FAO-56",
  climate: "المحطات المناخية",
  market: "FAOSTAT",
  knowledge: "قاعدة المعرفة",
  platform: "حالة المنصّة",
  cache: "ذاكرة مؤقتة",
  model: "نموذج لغوي",
  no_engine: "بلا محرّك",
  engine_failed: "أخفقت المحرّكات",
};

const SOURCE_LABEL_EN: Record<string, string> = {
  canal: "Canal file",
  calculator: "FAO-56 calculator",
  climate: "Weather stations",
  market: "FAOSTAT",
  knowledge: "Knowledge base",
  platform: "Platform status",
  cache: "Cache",
  model: "Language model",
  no_engine: "No engine",
  engine_failed: "Engines failed",
};

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
  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const pct = locale === "en" ? "%" : "٪";

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

  /*
   * How much of the assistant runs without a model.
   *
   * Measured over the questions that actually carry a source, not over all of
   * them: rows logged before answer_source existed are null, and counting those
   * as model answers would report the backlog as a running cost. The
   * denominator says so.
   */
  const attributed = questions.filter((q) => q.answer_source !== null);
  const localAnswers = attributed.filter((q) =>
    LOCAL_SOURCES.has(q.answer_source!),
  );
  const localShare =
    attributed.length === 0
      ? null
      : Math.round((localAnswers.length / attributed.length) * 100);

  const bySource = new Map<string, number>();
  for (const q of attributed) {
    bySource.set(q.answer_source!, (bySource.get(q.answer_source!) ?? 0) + 1);
  }
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]);

  const cropCounts = new Map<string, number>();
  for (const e of kb) cropCounts.set(e.crop, (cropCounts.get(e.crop) ?? 0) + 1);

  const cards = [
    {
      l: t("أسئلة مسجّلة", "Questions logged"),
      v: questions.length,
      s: t(`${recentQuestions} خلال أسبوع`, `${recentQuestions} in the past week`),
    },
    { l: t("بلا إجابة في القاعدة", "No match in the base"), v: gaps.length, s: t("فجوات معرفية", "Knowledge gaps") },
    {
      l: t("أُجيب بلا نموذج", "Answered without a model"),
      v: localShare === null ? "—" : `${localShare}${pct}`,
      s:
        attributed.length === 0
          ? t("لا قياس بعد", "Not measured yet")
          : t(`من ${attributed.length} سؤالاً مسنداً`, `of ${attributed.length} attributed questions`),
    },
    { l: t("عملاء محتملون", "Leads"), v: leads.length, s: t(`${recentLeads} خلال أسبوع`, `${recentLeads} in the past week`) },
    { l: t("مُدخلات المعرفة", "Knowledge entries"), v: kb.length, s: t(`${cropCounts.size} موضوعاً`, `${cropCounts.size} topics`) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("تحليلات المنصة", "Platform analytics")}</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "ما يسأل عنه الزوار هو أرخص بحث سوق ممكن — والأسئلة التي عجزت قاعدة المعرفة عن مطابقتها هي قائمة جاهزة بما يجب كتابته تالياً.",
          "What visitors ask is the cheapest market research there is — and the questions the knowledge base could not match are a ready list of what to write next.",
        )}
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

      {sourceRows.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-lg font-bold">{t("من أجاب، ولكم مرّة", "Who answered, and how often")}</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            {t(
              "كل طبقة فوق «نموذج لغوي» تُجيب بلا كلفة وبلا احتمال هلوسة. وما يصل إلى النموذج هو قائمة ما يستحقّ أن يُبنى له مُجيب — وهذه هي الفائدة العملية من هذا الجدول.",
              "Every layer above “Language model” answers at no cost and cannot hallucinate. What reaches the model is the list of what deserves its own answerer — that is the practical use of this table.",
            )}
          </p>

          <ul className="flex flex-col gap-2">
            {sourceRows.map(([src, count]) => {
              const share = Math.round((count / attributed.length) * 100);
              return (
                <li key={src} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0">
                    {(locale === "en" ? SOURCE_LABEL_EN : SOURCE_LABEL)[src] ?? src}
                  </span>
                  {/* A bar rather than a chart library: one dimension, ten
                      rows, and it has to render inside a server component. */}
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                    <span
                      className={`block h-full rounded-full ${
                        LOCAL_SOURCES.has(src) ? "bg-primary" : "bg-muted"
                      }`}
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-start text-xs text-muted">
                    {count} · {share}{pct}
                  </span>
                </li>
              );
            })}
          </ul>

          {questions.length > attributed.length && (
            <p className="mt-3 text-xs text-muted">
              {t(
                `و${questions.length - attributed.length} سؤالاً بلا طبقة مسجّلة — سُجّلت قبل إضافة العمود، ولا تُحتسب في النسبة أعلاه.`,
                `And ${questions.length - attributed.length} questions with no recorded layer — logged before the column was added, and not counted in the share above.`,
              )}
            </p>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">
          {t("فجوات قاعدة المعرفة", "Knowledge base gaps")} ({gaps.length})
        </h2>
        <p className="mb-4 text-sm text-muted">
          {t(
            "أسئلة لم يجد لها المسترجِع أي مُدخل مطابق. كل سطر هنا مُدخل معرفة ينقصك — ومعه ما أجاب به المساعد، محفوظاً بانتظار أن تراجعه وتنسبه إلى مصدرٍ فيدخل القاعدة.",
            "Questions the retriever found no matching entry for. Each line is a knowledge entry you are missing — with what the assistant answered, kept until you review it and attribute it to a source so it enters the base.",
          )}
        </p>
        {gaps.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            {t("لا توجد فجوات مسجّلة — كل سؤال حتى الآن وجد ما يطابقه.", "No gaps logged — every question so far found a match.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gaps.slice(0, 25).map((q) => (
              <PromoteAnswer
                key={q.id}
                questionId={q.id}
                question={q.question}
                answer={q.answer_text}
                createdAt={q.created_at}
                promoted={q.promoted_at !== null}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">{t("أكثر ما يسأل عنه الزوار", "What visitors ask about most")}</h2>
        {topTerms.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            {t("لم تُسجّل أسئلة بعد.", "No questions logged yet.")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topTerms.map(([term, count]) => (
              <span
                key={term}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
              >
                {term}
                <span className="ms-2 text-xs font-bold text-primary">
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
            {t("أسئلة فشل المحرّك في الرد عليها", "Questions the engine failed to answer")} ({failed.length})
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
        <h2 className="mb-4 text-lg font-bold">{t("تغطية قاعدة المعرفة", "Knowledge base coverage")}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-start">
              <tr>
                <th className="px-4 py-3">{t("الموضوع", "Topic")}</th>
                <th className="px-4 py-3">{t("عدد المُدخلات", "Entries")}</th>
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
          {t("عرض بيانات العملاء المحتملين", "View lead details")}
        </Link>
      </p>
    </div>
  );
}
