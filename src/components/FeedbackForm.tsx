"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  sendFeedback,
  FEEDBACK_KIND_LABEL,
  type FeedbackKind,
} from "@/lib/feedback";

const KINDS = Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[];

/**
 * The form, usable from any screen.
 *
 * It reads the current path itself rather than being told: the single most
 * useful thing an administrator can know about "this is confusing" is which
 * page it was written on, and it is the one fact a visitor would never think
 * to include.
 */
export default function FeedbackForm({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const pathname = usePathname();
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  // onSubmit rather than a form action, so a failed send leaves the written
  // text on screen for a one-press retry instead of clearing it underneath.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    // sendFeedback never rejects, so `pending` is always released.
    const outcome = await sendFeedback(formData, pathname);
    setResult(outcome);
    setPending(false);
    if (outcome.ok) form.reset();
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
        <p className="text-sm text-primary">{result.message}</p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="self-start text-sm underline"
        >
          أرسل ملاحظة أخرى
        </button>
      </div>
    );
  }

  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2" aria-label="نوع الملاحظة">
        {KINDS.map((k, i) => (
          <label
            key={k}
            className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium has-[:checked]:text-primary"
          >
            <input
              type="radio"
              name="kind"
              value={k}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {FEEDBACK_KIND_LABEL[k]}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        ملاحظتك
        <textarea
          name="body"
          rows={4}
          required
          maxLength={2000}
          placeholder="ما الذي أعجبك، أو أربكك، أو تريد إضافته؟"
          className={field}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          اسمك (اختياري)
          <input name="display_name" maxLength={120} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          وسيلة تواصل (اختياري)
          <input
            name="contact"
            maxLength={160}
            placeholder="هاتف أو بريد، إن أردت رداً"
            className={field}
          />
        </label>
      </div>

      {!signedIn && (
        <p className="text-xs leading-relaxed text-muted">
          تكتب بلا حساب، وهذا مقصود. إن تركت وسيلة تواصل ردّت الإدارة عليها؛ وإن
          سجّلت الدخول رأيت الردّ داخل المنصّة ووصلك إشعار به.
        </p>
      )}

      {result && !result.ok && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "جارٍ الإرسال..." : "أرسل الملاحظة"}
      </button>
    </form>
  );
}
