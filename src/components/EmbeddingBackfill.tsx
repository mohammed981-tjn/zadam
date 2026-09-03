"use client";

import { useState } from "react";
import {
  runEmbeddingBackfill,
  type EmbeddingRunResult,
} from "@/app/admin/embeddings/actions";

/**
 * زرُّ حساب المتّجهات الناقصة.
 *
 * WHY A BUTTON REPLACES A DOCUMENTED COMMAND
 *
 * New knowledge entries arrive without vectors, and the way to give them one
 * was a terminal command carrying two secrets. That is not a small ask of an
 * operator who works from a phone: it is the difference between the semantic
 * half of the assistant working on new entries and not working at all. The
 * command still exists for anyone with a checkout — both press the same engine,
 * `src/lib/backfillEmbeddings.ts`, so neither can hold its own opinion about
 * which rows are stale.
 *
 * WHY IT ASKS TO BE PRESSED AGAIN INSTEAD OF FINISHING
 *
 * One press embeds one batch, because a serverless request is killed on its
 * wall clock without an error anyone can read. So the honest interface is a
 * number that goes down: `remaining` is recomputed from the rows on every
 * press, so nothing is lost between them and a press too many is free.
 *
 * The count is not rendered once by the page and left to go stale here — after
 * each press this shows what the server just measured, which is the only number
 * that reflects the write that actually happened.
 */
export default function EmbeddingBackfill({
  initialPending,
}: {
  /** What the page measured when it rendered. Replaced by the first press. */
  initialPending: number;
}) {
  const [result, setResult] = useState<EmbeddingRunResult | null>(null);
  const [pending, setPending] = useState(false);

  // Before any press, the page's own count. After one, the server's.
  const remaining = result?.remaining ?? initialPending;
  const done = remaining === 0;

  async function handlePress() {
    if (pending) return;
    setPending(true);
    try {
      setResult(await runEmbeddingBackfill());
    } catch {
      // A rejected Server Function is a transport failure, not a refusal the
      // action chose to report. Say which it is rather than showing nothing.
      setResult({
        ok: false,
        message: "تعذّر الوصول إلى الخادم. تحقّق من الاتصال وأعد المحاولة.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium">متّجهات قاعدة المعرفة</h2>

      <p className="mt-2 text-sm leading-6 text-muted">
        المُدخل بلا متّجه ليس معطوباً — يجده البحث اللفظي. لكنّ البحث الدلالي
        يتخطّاه، وهو النصف الذي يجده حين لا يستعمل السائل كلماته.
      </p>

      <p className="mt-3 text-sm">
        {done ? (
          <span className="font-medium">لا مُدخلَ ينتظر حساباً.</span>
        ) : (
          <>
            <span className="font-medium">{remaining}</span> مُدخلاً ينتظر
            حساباً.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={handlePress}
        disabled={pending || done}
        className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "جارٍ الحساب…" : done ? "مكتملة" : "احسب المتّجهات الناقصة"}
      </button>

      {result && (
        <div
          role="status"
          className={`mt-3 rounded-lg border p-3 text-sm ${
            result.ok
              ? "border-border bg-background"
              : "border-danger/40 bg-danger/5"
          }`}
        >
          <p className={result.ok ? undefined : "text-danger"}>
            {result.message}
          </p>

          {result.model && (
            <p className="mt-1 text-xs text-muted">المزوّد: {result.model}</p>
          )}

          {/* Failures are named, not folded into a count nobody can act on. */}
          {result.problems && result.problems.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-danger">
              {result.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
