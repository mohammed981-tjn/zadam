"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeProvider } from "@/lib/embedding";
import { backfillEmbeddings } from "@/lib/backfillEmbeddings";

/**
 * زرُّ حساب المتّجهات — البديل عن أمرٍ طرفيٍّ لا يملك صاحبُ المنصّة حاسوباً لتشغيله.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Adding knowledge entries leaves them without vectors, and the documented way
 * to fix that was a command line carrying two secrets. That instruction assumed
 * a checkout and a terminal. This platform's administrator works from a phone,
 * so the instruction was not a workaround for him — it was a wall, and the
 * feature it gated (semantic retrieval over new entries) simply stayed off.
 *
 * The keys are already on the server: the assistant embeds every question with
 * the same provider key, and phone signup already uses the service role. So
 * nothing new is trusted here. What is new is that the operator no longer has
 * to hold either.
 *
 * WHY IT IS NOT DANGEROUS TO EXPOSE AS A BUTTON
 *
 * It writes one column family — embedding, embedding_model, embedding_updated_at
 * — on rows that already exist. It creates nothing, deletes nothing, and cannot
 * change what an entry says. The worst a repeated press does is re-embed rows
 * that are already current, which the staleness rule declines to do anyway.
 *
 * WHY ONE BATCH PER PRESS
 *
 * A serverless request is killed on its wall clock with no error anyone can
 * read. One provider call and its updates fit; twenty do not. So this does
 * BATCH_SIZE entries and returns how many are left — press again while that is
 * above zero. Nothing is lost between presses: `remaining` is recomputed from
 * the rows, never carried in a counter.
 */

export interface EmbeddingRunResult {
  ok: boolean;
  message: string;
  /** Present on success, so the page can decide whether to invite another press. */
  remaining?: number;
  embedded?: number;
  scanned?: number;
  model?: string;
  problems?: string[];
}

export async function runEmbeddingBackfill(): Promise<EmbeddingRunResult> {
  // Server Functions are reachable by direct POST, not only from the page that
  // renders the form — so the action establishes the caller itself.
  await requireAdmin();

  const provider = activeProvider();
  if (!provider) {
    return {
      ok: false,
      message:
        "لا مزوّدَ متّجهاتٍ مُعرَّفٌ على هذا النشر. أضف JINA_API_KEY (من jina.ai/embeddings) " +
        "أو GEMINI_API_KEY في إعدادات المشروع، ثم أعد المحاولة.",
    };
  }

  // knowledge_entries is admin-write under RLS, and this runs as the project
  // rather than as the signed-in admin so the write does not depend on which
  // policy happens to match a session.
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message:
        "مفتاحُ الخدمة (SUPABASE_SERVICE_ROLE_KEY) غير مُعرَّفٍ على هذا النشر، " +
        "فلا يمكن الكتابة في قاعدة المعرفة.",
    };
  }

  let outcome;
  try {
    outcome = await backfillEmbeddings({
      supabase,
      provider,
      maxBatches: 1,
    });
  } catch (err) {
    // The provider's message can carry an upstream body. Log it whole, and
    // hand the browser a sentence rather than someone else's error text.
    console.error("admin: embedding backfill failed", err);
    return {
      ok: false,
      message: "تعذّر حسابُ المتّجهات. راجع سجلّ الخادم — فُصِّل الخطأ هناك.",
    };
  }

  if (outcome.pending === 0) {
    return {
      ok: true,
      message: `لا شيء ينتظر. المُدخلات الـ${outcome.scanned} كلُّها محسوبةٌ بـ${outcome.model}.`,
      remaining: 0,
      embedded: 0,
      scanned: outcome.scanned,
      model: outcome.model,
    };
  }

  revalidatePath("/admin");

  const done = `حُسبت ${outcome.embedded} من ${outcome.pending}`;
  const left =
    outcome.remaining > 0
      ? ` — بقي ${outcome.remaining}. اضغط مرّةً أخرى.`
      : " — اكتملت جميعها.";
  const failedNote =
    outcome.failed > 0 ? ` وفشلت ${outcome.failed}؛ التفصيل أدناه.` : "";

  return {
    ok: outcome.failed === 0,
    message: done + left + failedNote,
    remaining: outcome.remaining,
    embedded: outcome.embedded,
    scanned: outcome.scanned,
    model: outcome.model,
    problems: outcome.problems,
  };
}
