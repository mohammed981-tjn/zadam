"use client";

import { useState } from "react";
import { sendLead } from "@/lib/leads";

/**
 * Shown in place of the invest form while the money flow is closed. Turns a
 * dead-end ("not available yet") into a way for the visitor to be told when it
 * opens, and reuses the existing leads table rather than inventing a new one.
 */
export default function NotifyMeForm({ interest }: { interest: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  // onSubmit, so a failed send leaves the typed name and number in place for a
  // one-press retry instead of clearing the form under the visitor.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const formData = new FormData(e.currentTarget);
    setPending(true);
    // sendLead never rejects, so `pending` is always cleared — the frozen
    // "جارٍ الإرسال..." button was the whole bug.
    setResult(await sendLead(formData));
    setPending(false);
  }

  if (result?.ok) {
    return (
      <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
        {result.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="interest" value={interest} />
      <input type="hidden" name="role" value="investor" />
      <label className="flex flex-col gap-1 text-sm">
        الاسم
        <input
          type="text"
          name="full_name"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        هاتف أو بريد إلكتروني
        <input
          type="text"
          name="contact"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "جارٍ الإرسال..." : "أبلغوني عند الإطلاق"}
      </button>
      {result && !result.ok && (
        <p className="text-sm text-danger">{result.message}</p>
      )}
    </form>
  );
}
