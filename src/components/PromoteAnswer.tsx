"use client";

import { useState } from "react";
import {
  promoteAnswer,
  KNOWLEDGE_TOPICS,
  type PromoteResult,
} from "@/app/admin/analytics/promote";

const TOPIC_LABEL: Record<string, string> = {
  agronomy: "زراعة",
  economics: "اقتصاد",
  institutional: "مؤسسي وتنظيمي",
  livestock: "ثروة حيوانية",
  water: "مياه وريّ",
  soil: "تربة",
  pest: "آفات",
  variety: "أصناف",
  technology: "تقنية",
  general: "عام",
};

/**
 * بطاقةُ فجوة: السؤال، وما أجاب به المساعد، وزرُّ الاعتماد.
 *
 * WHY THE ANSWER IS SHOWN COLLAPSED
 *
 * The gap list is read as a list — twenty-five questions at a glance, to see
 * what visitors keep asking. Expanding every answer inline would bury that. The
 * answer opens when the administrator has decided to act on that one.
 *
 * WHY THE TITLE AND CONTENT ARE PRE-FILLED AND EDITABLE
 *
 * Pre-filled because a gate that means retyping an answer is a gate nobody
 * passes, and then the holding area grows while the base does not. Editable
 * because what a model wrote to one visitor is rarely phrased as a knowledge
 * entry — it answers a person, where an entry has to answer everyone who asks
 * anything near it.
 *
 * WHY THERE IS NO PROMOTE BUTTON WITHOUT AN ANSWER
 *
 * Older rows were logged before answers were kept, and questions the engines
 * failed on never had one. There is nothing to promote in either case, and a
 * button that opens an empty form invites writing an entry from the question
 * alone — which is exactly the unsourced guess this gate exists to keep out.
 */
export default function PromoteAnswer({
  questionId,
  question,
  answer,
  createdAt,
  promoted,
}: {
  questionId: string;
  question: string;
  answer: string | null;
  createdAt: string;
  promoted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PromoteResult | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      const outcome = await promoteAnswer(questionId, formData);
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    } catch {
      setResult({ ok: false, message: "تعذّر الوصول إلى الخادم." });
    } finally {
      setPending(false);
    }
  }

  const field =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

  return (
    <li className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>{question}</span>
        <span className="text-xs text-muted">
          {new Date(createdAt).toLocaleDateString("ar-EG")}
        </span>
      </div>

      {promoted ? (
        <p className="mt-2 text-xs text-muted">✓ اعتُمد مُدخلَ معرفة.</p>
      ) : answer ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs text-primary underline"
        >
          {open ? "إخفاء" : "اقرأ الجواب واعتمده مُدخلاً"}
        </button>
      ) : (
        <p className="mt-2 text-xs text-muted">
          بلا جوابٍ محفوظ — سُجّل قبل حفظ الأجوبة، أو عجزت المحرّكات عنه.
        </p>
      )}

      {open && answer && (
        <form action={submit} className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium" htmlFor={`crop-${questionId}`}>
                المحصول أو الباب
              </label>
              <input
                id={`crop-${questionId}`}
                name="crop"
                className={field}
                placeholder="عام"
              />
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor={`topic-${questionId}`}>
                الموضوع
              </label>
              <select id={`topic-${questionId}`} name="topic" className={field} defaultValue="general">
                {KNOWLEDGE_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {TOPIC_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium"
                htmlFor={`country-${questionId}`}
              >
                بلد المرجع
              </label>
              <input
                id={`country-${questionId}`}
                name="source_country"
                className={field}
                placeholder="السودان"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium" htmlFor={`title-${questionId}`}>
              العنوان
            </label>
            <input
              id={`title-${questionId}`}
              name="title"
              className={field}
              defaultValue={question.slice(0, 120)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium" htmlFor={`content-${questionId}`}>
              المحتوى — راجعه قبل الاعتماد
            </label>
            <textarea
              id={`content-${questionId}`}
              name="content"
              className={field}
              rows={6}
              defaultValue={answer}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium" htmlFor={`source-${questionId}`}>
              المصدر — إلزامي
            </label>
            <input
              id={`source-${questionId}`}
              name="source_note"
              className={field}
              placeholder="من أين جاءت هذه المعلومة؟ ولو «مراجعة يدوية من الإدارة»"
              required
            />
            <p className="mt-1 text-xs text-muted">
              قيمةُ قاعدة المعرفة كلُّها أنّ كلَّ سطرٍ فيها منسوبٌ إلى مصدر.
              ومُدخلٌ بلا مصدرٍ يجعل المساعد بعد شهرٍ يستشهد بنفسه.
            </p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "جارٍ الاعتماد…" : "اعتمده مُدخلَ معرفة"}
          </button>
        </form>
      )}

      {result && (
        <p
          role="status"
          className={`mt-2 text-xs ${result.ok ? "text-muted" : "text-danger"}`}
        >
          {result.message}
        </p>
      )}
    </li>
  );
}
