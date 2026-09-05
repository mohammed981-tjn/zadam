"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { KNOWLEDGE_TOPICS } from "@/lib/knowledgeTopics";

export interface PromoteResult {
  ok: boolean;
  message: string;
}


/**
 * اعتمادُ جوابِ المساعد مُدخلَ معرفة — البوّابةُ التي تفصل المخزونَ عن القاعدة.
 *
 * WHY THIS GATE EXISTS AT ALL
 *
 * The owner asked for the assistant to store what it finds. It now does — but
 * into a holding area, not into `knowledge_entries`. The difference is the
 * whole value of that table: every row in it carries where it came from, and
 * the site promises visitors an «إجابة موثّقة». A model answer poured in
 * unattributed makes the base something nobody vouches for, and within a month
 * the assistant is citing itself.
 *
 * So an administrator reads the answer, adds the source, and lets it in. One
 * press — not retyping — because a gate that costs ten minutes is a gate that
 * gets skipped, and then the holding area fills up and nothing reaches the base
 * at all.
 *
 * WHY THE WRITE IS ONE FUNCTION AND NOT TWO STATEMENTS
 *
 * Creating the entry and marking the question promoted must not come apart. Two
 * calls from here, and a failure between them leaves either an orphan entry
 * nobody knows the origin of, or a question flagged as promoted with nothing to
 * show for it. `promote_assistant_answer` does both or neither, and refuses a
 * non-admin itself rather than trusting this file to have checked.
 */
export async function promoteAnswer(
  questionId: string,
  formData: FormData,
): Promise<PromoteResult> {
  const { supabase } = await requireAdmin();

  const str = (k: string) => String(formData.get(k) ?? "").trim();

  const topic = str("topic");
  if (!(KNOWLEDGE_TOPICS as readonly string[]).includes(topic)) {
    return { ok: false, message: "موضوع غير معروف." };
  }

  const sourceNote = str("source_note");
  if (!sourceNote) {
    return {
      ok: false,
      message:
        "المصدر مطلوب. مُدخلٌ بلا مصدرٍ يجعل المساعد بعد شهرٍ يستشهد بنفسه — " +
        "اكتب من أين جاءت هذه المعلومة، ولو «مراجعة يدوية من الإدارة».",
    };
  }

  const { error } = await supabase.rpc("promote_assistant_answer", {
    p_question_id: questionId,
    p_crop: str("crop"),
    p_topic: topic,
    p_title: str("title"),
    p_content: str("content"),
    p_source_note: sourceNote,
    p_source_country: str("source_country") || null,
  });

  if (error) {
    console.error("analytics: promote failed", error);
    // The function raises with sentences meant to be read, so the message is
    // passed through rather than replaced with a generic failure. It says
    // things like "المصدر مطلوب" and "هذا السؤال اعتُمد من قبل" — both of
    // which the administrator can act on, unlike "تعذّر الحفظ".
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/analytics");
  return {
    ok: true,
    message:
      "اعتُمد المُدخل ودخل قاعدة المعرفة. احسب متّجهاته من لوحة الإدارة ليجده " +
      "البحث الدلالي أيضاً.",
  };
}
