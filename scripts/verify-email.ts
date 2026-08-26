/**
 * البريد الصادر — فحص ما يمكن فحصه بلا مفتاح.
 *
 * CI holds no credentials that reach anything real, so nothing here sends a
 * message. What it does check is the part that actually broke platforms before:
 * the behaviour around the send, not the send itself.
 *
 *   - an unconfigured deployment must report that and carry on, never throw;
 *   - a caller must never be able to mistake "not configured" for "sent";
 *   - the recipient list must be parsed the way an operator would write it.
 *
 * The last one is not padding. `ADMIN_ALERT_EMAIL` is edited by hand under
 * pressure, and a trailing comma silently producing an empty recipient is
 * exactly how an alert stops arriving with nothing in the logs to say why.
 */

import { alertRecipients, emailConfigured, sendEmail } from "../src/lib/email";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

/** Each case restores the environment, so order never matters. */
async function withEnv(
  vars: Record<string, string | undefined>,
  body: () => Promise<void> | void,
) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await body();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function main() {
  console.log("\nالبريد الصادر:\n");

  console.log("حين لا يكون مضبوطاً:");
  await withEnv(
    { RESEND_API_KEY: undefined, EMAIL_FROM: undefined, ADMIN_ALERT_EMAIL: undefined },
    async () => {
      const outcome = await sendEmail({
        to: ["someone@example.com"],
        subject: "س",
        text: "ن",
      });

      ok(
        outcome.sent === false && outcome.reason === "unconfigured",
        "يُرجع «غير مضبوط» ولا يرمي استثناءً",
      );

      // The distinction the caller depends on. A deployment with no key and a
      // deployment whose provider refused are different problems, and collapsing
      // them means the second one is never fixed because it looks like the first.
      ok(
        outcome.sent === false && outcome.reason !== "failed",
        "ولا يخلط بين «غير مضبوط» و«حاول وفشل»",
      );

      ok(emailConfigured() === false, "وemailConfigured تقول لا");
      ok(alertRecipients().length === 0, "ولا مستقبِلين");
    },
  );

  console.log("\nقائمة المستقبِلين:");
  await withEnv({ ADMIN_ALERT_EMAIL: "a@example.com" }, () => {
    ok(alertRecipients().length === 1, "عنوان واحد يُقرأ عنواناً واحداً");
  });

  await withEnv({ ADMIN_ALERT_EMAIL: " a@example.com , b@example.com " }, () => {
    const list = alertRecipients();
    ok(
      list.length === 2 && list[0] === "a@example.com" && list[1] === "b@example.com",
      "والمسافات حول الفواصل تُقلَّم — تُكتب باليد وتُلصَق من مكان آخر",
    );
  });

  await withEnv({ ADMIN_ALERT_EMAIL: "a@example.com,," }, () => {
    ok(
      alertRecipients().length === 1,
      "والفاصلة الزائدة لا تُنتج مستقبِلاً فارغاً يبتلع التنبيه",
    );
  });

  await withEnv({ ADMIN_ALERT_EMAIL: "   " }, () => {
    ok(alertRecipients().length === 0, "والقيمة الفارغة ليست عنواناً");
  });

  console.log("\nحين يكون المفتاح موجوداً والقائمة فارغة:");
  await withEnv(
    {
      RESEND_API_KEY: "test-key-not-real",
      EMAIL_FROM: "sudagri@example.com",
      ADMIN_ALERT_EMAIL: undefined,
    },
    async () => {
      ok(emailConfigured() === false, "لا يُعدّ مضبوطاً بلا من يُرسَل إليه");

      // No network call: an empty `to` is refused before the provider is reached,
      // so this case runs in CI without touching anything outside the process.
      const outcome = await sendEmail({ to: [], subject: "س", text: "ن" });
      ok(
        outcome.sent === false && outcome.reason === "unconfigured",
        "ورسالةٌ بلا مستقبِل تُرفض قبل الشبكة، لا عندها",
      );
    },
  );

  console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
