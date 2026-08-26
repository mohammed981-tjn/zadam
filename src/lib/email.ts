/**
 * البريد الصادر — الطبقة الوحيدة التي تخرج من المنصّة إلى شخص لا يفتحها.
 *
 * WHY THIS EXISTS
 *
 * Every notification the platform sends today lands in the `notifications`
 * table and is read from a page inside the app. That works for people who log
 * in, and it is exactly wrong for the one case that matters most: a visitor
 * leaves their contact details on the lead form, an administrator is notified —
 * and sees it whenever they next open the site. If that is three days, the lead
 * waited three days.
 *
 * So this is not about visibility, it is about latency, and latency is the
 * whole value of a lead. It is also the reason `INVESTMENT_LIVE` must not be
 * switched on before this works: a feature that swallows a prospective investor
 * is worse than one that does not exist.
 *
 * WHY HTTP AND NOT SMTP
 *
 * Raw SMTP from a serverless function means a socket, a connection pool that
 * cannot be pooled, and a dependency. One `fetch` to a provider's API has none
 * of those and no package to keep updated. The provider is confined to
 * `deliver()` below — swapping it is one function, not a refactor.
 *
 * WHAT IT DOES WHEN IT CANNOT SEND
 *
 * It returns, it does not throw. The caller has already recorded the thing that
 * matters; email is the second-best copy. A lead saved and unmailed is a
 * problem to fix in the logs. A lead refused because the mail provider was down
 * is a visitor lost for a reason that had nothing to do with them.
 */

export type EmailOutcome =
  | { sent: true }
  /** Not configured. Expected on a deployment that has not set the key yet. */
  | { sent: false; reason: "unconfigured" }
  /** Configured and tried, and it failed. This one is worth alerting on. */
  | { sent: false; reason: "failed"; detail: string };

export interface OutgoingEmail {
  to: string[];
  subject: string;
  /** Plain text only, deliberately — see the note in `deliver`. */
  text: string;
  /** Set when the message is about someone the recipient will want to answer. */
  replyTo?: string;
}

const ENDPOINT = "https://api.resend.com/emails";

/**
 * The only function that knows which provider this is.
 *
 * Plain text and no HTML on purpose. These are operational messages to a
 * handful of people, an HTML body doubles the surface for mistakes, and a text
 * part is what most spam filters weigh anyway. When the platform sends its
 * first message to a farmer rather than to an operator, that is the moment to
 * reconsider — not before.
 */
async function deliver(
  key: string,
  from: string,
  message: OutgoingEmail,
): Promise<EmailOutcome> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      // A hung provider must not hold a serverless invocation open until the
      // platform's own timeout kills it mid-request.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      /*
       * The body is read for the log and never returned to a caller that might
       * render it: a provider error can quote the recipient address back, and
       * that address is a visitor's.
       */
      const body = await response.text().catch(() => "");
      return {
        sent: false,
        reason: "failed",
        detail: `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send one message. Never throws.
 *
 * `RESEND_API_KEY` and `EMAIL_FROM` are read at call time rather than at module
 * load, so a deployment that adds them does not need a rebuild to start
 * sending — and so this module can be imported by a verify script that has
 * neither.
 */
export async function sendEmail(
  message: OutgoingEmail,
): Promise<EmailOutcome> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) return { sent: false, reason: "unconfigured" };

  const to = message.to.map((a) => a.trim()).filter(Boolean);
  if (to.length === 0) return { sent: false, reason: "unconfigured" };

  return deliver(key, from, { ...message, to });
}

/**
 * Who gets operational alerts.
 *
 * Read from an environment variable rather than from the administrators' own
 * accounts, and that is a deliberate limit: an address in `auth.users` was
 * given to sign in with, not to be alerted at. Turning a login into a mailing
 * list is how a platform starts sending mail nobody agreed to receive.
 *
 * Comma-separated, so a second person can be added without a deploy.
 */
export function alertRecipients(): string[] {
  return (process.env.ADMIN_ALERT_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

/** True when this deployment can actually send. For diagnostics to report. */
export function emailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      alertRecipients().length > 0,
  );
}
