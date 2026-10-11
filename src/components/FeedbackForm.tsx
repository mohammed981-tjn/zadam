"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  sendFeedback,
  FEEDBACK_KIND_LABEL,
  type FeedbackKind,
} from "@/lib/feedback";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

const KINDS = Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[];

const KIND_EN: Record<FeedbackKind, string> = {
  suggestion: "Suggestion",
  problem: "Problem",
  question: "Question",
};

/*
 * The messages sendFeedback and /api/feedback return are written in Arabic.
 * They are matched here by their exact text so an English reader gets them in
 * English; a message not listed is shown as it came.
 */
const MESSAGE_EN: Record<string, string> = {
  "اكتب ملاحظتك أولاً.": "Write your note first.",
  "تعذّر الوصول للخادم. تحقّق من الاتصال ثم أعد المحاولة.":
    "Could not reach the server. Check your connection and try again.",
  "انقطع الاتصال قبل أن تصل ملاحظتك. ما كتبته ما زال موجوداً — اضغط إرسال مرة أخرى.":
    "The connection dropped before your note arrived. What you wrote is still here — press send again.",
  "طلب غير مفهوم، أعد المحاولة.": "The request was not understood. Please try again.",
  "أرسلت عدة ملاحظات خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.":
    "You sent several notes within a minute. Wait a little, then try again.",
  "تعذّر حفظ ملاحظتك الآن، حاول مرة أخرى.":
    "Your note could not be saved just now. Please try again.",
  "وصلت ملاحظتك، شكراً. سترى ردّ الإدارة في صفحة الملاحظات وفي إشعاراتك.":
    "Your note has arrived, thank you. You will see the team's reply on the feedback page and in your notifications.",
  "وصلت ملاحظتك، شكراً. إن تركت وسيلة تواصل فسنردّ عليها.":
    "Your note has arrived, thank you. If you left a contact, we will reply there.",
  "حدث خطأ غير متوقع، حاول مرة أخرى.": "Something unexpected went wrong. Please try again.",
};

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
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const say = (message: string) => (en ? (MESSAGE_EN[message] ?? message) : message);
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
        <p className="text-sm text-primary">{say(result.message)}</p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="self-start text-sm underline"
        >
          {t("أرسل ملاحظة أخرى", "Send another note")}
        </button>
      </div>
    );
  }

  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2" aria-label={t("نوع الملاحظة", "Type of note")}>
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
            {en ? KIND_EN[k] : FEEDBACK_KIND_LABEL[k]}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        {t("ملاحظتك", "Your note")}
        <textarea
          name="body"
          rows={4}
          required
          maxLength={2000}
          placeholder={t("ما الذي أعجبك، أو أربكك، أو تريد إضافته؟", "What did you like, what confused you, or what would you add?")}
          className={field}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("اسمك (اختياري)", "Your name (optional)")}
          <input name="display_name" maxLength={120} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("وسيلة تواصل (اختياري)", "Contact (optional)")}
          <input
            name="contact"
            maxLength={160}
            placeholder={t("هاتف أو بريد، إن أردت رداً", "Phone or email, if you want a reply")}
            className={field}
          />
        </label>
      </div>

      {!signedIn && (
        <p className="text-xs leading-relaxed text-muted">
          {t(
            "تكتب بلا حساب، وهذا مقصود. إن تركت وسيلة تواصل ردّت الإدارة عليها؛ وإن سجّلت الدخول رأيت الردّ داخل المنصّة ووصلك إشعار به.",
            "You can write without an account, on purpose. If you leave a contact, the team replies there; if you sign in, you see the reply on the platform and get a notification.",
          )}
        </p>
      )}

      {result && !result.ok && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {say(result.message)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? t("جارٍ الإرسال...", "Sending...") : t("أرسل الملاحظة", "Send note")}
      </button>
    </form>
  );
}
