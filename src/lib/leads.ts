/**
 * Sending a visitor's contact details, from the browser.
 *
 * The one rule this file exists to enforce: **it never rejects.** Every caller
 * gets `{ ok, message }` back, always.
 *
 * That is not defensive style for its own sake. Both contact forms on the
 * platform were written as
 *
 *     setPending(true);
 *     setResult(await submitLead(formData));
 *     setPending(false);
 *
 * and a rejected promise there skips the last two lines forever: no message, no
 * released button, the spinner frozen on "جارٍ الإرسال..." with the typed phone
 * number still on screen and going nowhere. To the person holding the phone the
 * connection simply died — which is exactly how it was reported, and the leads
 * table had never received a row.
 *
 * A caller cannot forget to handle a failure of a function that has none.
 */

export type LeadResult = { ok: boolean; message: string };

/**
 * A request left hanging is the failure mode with no natural end.
 *
 * On a weak mobile connection a fetch can stay open indefinitely; without a
 * deadline the button stays disabled until the page is reloaded. Fifteen
 * seconds is far longer than the insert needs and short enough that a person
 * has not yet given up.
 */
const TIMEOUT_MS = 15_000;

export async function sendLead(formData: FormData): Promise<LeadResult> {
  const payload = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    contact: String(formData.get("contact") ?? "").trim(),
    role: String(formData.get("role") ?? "other"),
    interest: String(formData.get("interest") ?? "").trim(),
  };

  // Checked here as well as on the server, so an empty field costs a glance
  // rather than a round trip.
  if (!payload.full_name || !payload.contact) {
    return { ok: false, message: "الاسم ووسيلة التواصل مطلوبان." };
  }

  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // A body is expected on success and on every handled failure. If parsing
    // fails the response came from something other than the route — a proxy
    // page, an interstitial — and saying "the network is unstable" is closer to
    // the truth than any message the body might have carried.
    const data = (await res.json().catch(() => null)) as LeadResult | null;

    if (data && typeof data.message === "string") {
      return { ok: Boolean(data.ok), message: data.message };
    }

    return {
      ok: false,
      message: "تعذّر الوصول للخادم. تحقّق من الاتصال ثم أعد المحاولة.",
    };
  } catch {
    /*
     * A timeout, an offline device, or a request cut mid-flight. The visitor
     * cannot act on the distinction, and every one of them is answered the same
     * way: keep what they typed, tell them plainly, let them press again.
     */
    return {
      ok: false,
      message: "انقطع الاتصال قبل أن تصل بياناتك. بياناتك ما زالت مكتوبة — اضغط إرسال مرة أخرى.",
    };
  }
}
