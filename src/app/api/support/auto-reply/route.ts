import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import { retrieveRelevant, type RetrievableEntry } from "@/lib/retrieval";
import { pageContextLine } from "@/lib/pageHelp";

/**
 * الردُّ الآليّ على الشكاوى — بعد ربع ساعة، وإن لم يردّ إنسان.
 *
 * WHY A DELAY AND NOT AN INSTANT REPLY
 *
 * An instant machine answer arrives before any person could have read the
 * complaint, and the writer knows it. It reads as being brushed off, and the
 * next complaint does not get written. A delayed reply that fires only when
 * nobody has answered says something different: someone had the chance, nobody
 * did yet, here is what the platform can tell you meanwhile.
 *
 * So this endpoint never decides *whether* a complaint is due — the database
 * does, from a policy row an administrator can change. And the write re-checks
 * that no human replied in the meantime, because a model call takes seconds and
 * an administrator may answer inside them.
 *
 * WHY THE ANSWER IS DELIBERATELY MODEST
 *
 * The prompt below forbids promising anything: no refund, no timeline, no
 * commitment. A machine that promises on the platform's behalf creates an
 * obligation nobody agreed to, and the person who has to break it is the
 * operator. What it may do is answer from the knowledge base, explain how the
 * platform works, and say plainly that a person will follow up. That is worth
 * more at minute fifteen than silence, and it is the most it can honestly be.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Enough for a handful per run; the schedule catches the rest on its next pass. */
const BATCH = 10;

const SYSTEM_PROMPT = `أنت مساعد الدعم في منصّة "سودجري" الزراعية السودانية. وصلتك رسالة من زائر — شكوى أو سؤال — ولم يردّ عليها موظّف بعد.

اكتب ردّاً عربياً قصيراً (٣ إلى ٦ أسطر) يفعل ما يلي وحده:
- يعترف بما قاله الزائر تحديداً، لا بعبارة عامة.
- يجيب عن سؤاله إن كان في معرفة المنصّة المرفقة أدناه ما يجيبه، ويذكر مصدره إن وُجد.
- يشرح كيف يعمل الأمر في المنصّة إن كانت المشكلة سوء فهم.
- ينتهي بأنّ موظّفاً سيراجع الرسالة ويتابع.

وهذه ممنوعة منعاً باتّاً:
- لا تَعِد بتعويض ولا استرداد ولا خصم ولا هدية.
- لا تَعِد بموعد ("خلال ٢٤ ساعة"، "غداً") — لا تملك جدول أحد.
- لا تعتذر اعتذاراً يقرّ بخطأ لم يثبت ("نعتذر عن خطئنا").
- لا تخترع سياسة ولا رقماً ولا اسم موظّف.
- لا تقل إنّك ذكاء اصطناعي ولا إنّك آلة — الصفحة تقول ذلك بنفسها فوق ردّك، فتكرارُه حشو.

وإن لم تكن تعرف، فقل ذلك صراحةً: أنّ المسألة تحتاج موظّفاً وأنّها وصلته. جوابٌ صادقٌ قصير أنفع من جوابٍ يبدو كاملاً وهو مخترع.

اكتب نصاً عادياً بلا رموز تنسيق.`;

export async function POST(req: NextRequest) {
  /*
   * Closed to anyone without the scheduler's secret — and unlike /api/health,
   * closed *hard*. This endpoint spends model quota and writes replies that
   * visitors read; an open version of it is a way to burn the budget and to
   * post text under the platform's name.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("support: CRON_SECRET is not set, so auto-reply will not run");
    return NextResponse.json(
      { ok: false, error: "غير مُهيّأ" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("support: SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "غير مُهيّأ" }, { status: 503 });
  }

  const engines = buildEngines({
    geminiKey: process.env.GEMINI_API_KEY,
    openRouterKey: process.env.OPENROUTER_API_KEY,
    openRouterModels: process.env.OPENROUTER_MODELS,
  });

  if (engines.length === 0) {
    // Not an error: the platform simply cannot answer without a model, and the
    // complaints stay in the queue for a person. Reported so a silent gap in
    // configuration does not look like a silent gap in complaints.
    return NextResponse.json({
      ok: true,
      skipped: "no_engine",
      note: "لا محرّك مُعرَّف، فالرسائل تنتظر موظّفاً.",
    });
  }

  const [{ data: dueRows, error: dueError }, { data: knowledgeRows }] =
    await Promise.all([
      supabase.rpc("feedback_awaiting_auto_reply", { p_limit: BATCH }),
      supabase
        .from("knowledge_entries")
        .select("crop, topic, title, content, source_country, source_note"),
    ]);

  if (dueError) {
    console.error("support: could not read the queue", dueError);
    return NextResponse.json({ ok: false, error: "تعذّر قراءة الطابور" }, { status: 500 });
  }

  const due = (dueRows ?? []) as {
    id: string;
    kind: string;
    body: string;
    page_path: string | null;
    created_at: string;
  }[];

  if (due.length === 0) {
    return NextResponse.json({ ok: true, due: 0, replied: 0 });
  }

  const knowledge = (knowledgeRows ?? []) as RetrievableEntry[];

  let replied = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const note of due) {
    // Only the entries that bear on this note, not the whole base: a prompt
    // stuffed with everything answers worse than one given the relevant few.
    const matched = retrieveRelevant(note.body, knowledge, 8);
    const pageLine = note.page_path ? pageContextLine(note.page_path) : "";

    const { result, attempts } = await generateWithFallback(
      engines,
      SYSTEM_PROMPT,
      [
        pageLine && `الصفحة التي كُتبت منها الرسالة: ${pageLine}`,
        `نوع الرسالة: ${note.kind}`,
        `نصّ الزائر:\n${note.body}`,
        matched.length
          ? `معرفة المنصّة ذات الصلة (JSON):\n${JSON.stringify(matched)}`
          : "لا يوجد في قاعدة المعرفة ما يخصّ هذه الرسالة.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    if (!result) {
      // Every engine down. The note stays in the queue and the next run tries
      // again — which is right: an unanswered complaint should keep asking to
      // be answered, not be quietly marked as handled.
      console.error(
        `support: every engine failed for ${note.id}`,
        attempts.map((a) => `${a.engine} — ${a.reason}`).join(" | "),
      );
      failures.push(note.id);
      continue;
    }

    const text = result.text.replace(/[*#_`]+/g, "").trim();
    if (!text) {
      failures.push(note.id);
      continue;
    }

    // The function re-checks that no human replied while the model was
    // thinking, and reports whether it actually wrote. `false` is not a
    // failure — it is the delay doing its job.
    const { data: wrote, error: writeError } = await supabase.rpc(
      "record_feedback_auto_reply",
      { p_id: note.id, p_reply: text, p_engine: result.engine },
    );

    if (writeError) {
      console.error("support: could not record the reply", note.id, writeError);
      failures.push(note.id);
    } else if (wrote) {
      replied++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    due: due.length,
    replied,
    /** Answered by a person while the model was working — the intended outcome. */
    supersededByHuman: skipped,
    failed: failures.length,
  });
}
