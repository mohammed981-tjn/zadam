/**
 * Sending a visitor's note or suggestion, from the browser.
 *
 * Same contract as lib/leads.ts and for the same reason: **it never rejects.**
 * A rejected promise inside `setResult(await send(...)); setPending(false)`
 * skips both remaining lines forever — no message, button frozen, the typed
 * text stranded on screen. That bug cost this platform every lead it should
 * have received for weeks, and the fix is a function that has no failure a
 * caller can forget to handle.
 */

export type FeedbackKind = "suggestion" | "problem" | "question";

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  suggestion: "اقتراح",
  problem: "مشكلة",
  question: "سؤال",
};

export type FeedbackResult = { ok: boolean; message: string };

/**
 * Keeps only an in-site path.
 *
 * The value arrives from the browser and is rendered beside the note in the
 * admin panel, so an absolute URL from another host would put an attacker's
 * link into the one screen an administrator trusts. A path is all this field
 * is ever for.
 *
 * The backslash rule is the one that is easy to leave out and is not optional:
 * browsers normalise `\` to `/` in URLs, so `/\evil.com` is treated as the
 * protocol-relative `//evil.com`. The auth callback carries the same guard for
 * the same reason, and it was found there the hard way.
 */
export function safePagePath(value: string): string | null {
  const path = value.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("\\")) return null;
  return path.slice(0, 200);
}

const TIMEOUT_MS = 15_000;

export async function sendFeedback(
  formData: FormData,
  pagePath: string,
): Promise<FeedbackResult> {
  const payload = {
    body: String(formData.get("body") ?? "").trim(),
    kind: String(formData.get("kind") ?? "suggestion"),
    display_name: String(formData.get("display_name") ?? "").trim(),
    contact: String(formData.get("contact") ?? "").trim(),
    // Sent from the client rather than read from a header: the note is about
    // the screen the visitor was looking at, and the Referer of a fetch is the
    // page URL only by convention.
    page_path: pagePath,
  };

  if (payload.body.length < 3) {
    return { ok: false, message: "اكتب ملاحظتك أولاً." };
  }

  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = (await res.json().catch(() => null)) as FeedbackResult | null;

    if (data && typeof data.message === "string") {
      return { ok: Boolean(data.ok), message: data.message };
    }

    return {
      ok: false,
      message: "تعذّر الوصول للخادم. تحقّق من الاتصال ثم أعد المحاولة.",
    };
  } catch {
    return {
      ok: false,
      message:
        "انقطع الاتصال قبل أن تصل ملاحظتك. ما كتبته ما زال موجوداً — اضغط إرسال مرة أخرى.",
    };
  }
}
