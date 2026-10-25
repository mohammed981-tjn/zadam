import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatches } from "@/lib/cronAuth";
import { refreshPrices } from "@/lib/priceRefresh";
import { evaluatePriceAlerts } from "@/lib/priceAlerts";
import { runBookkeeping } from "@/lib/bookkeeping";
import { syncFaostat } from "@/lib/faostatSync";
import { DAILY_DEADLINE_MS, DAILY_RESERVE_MS, dailySteps, runSteps } from "@/lib/dailyCheck";

/**
 * Daily health check, which also keeps the database from being paused.
 *
 * Supabase pauses a Free plan project after about seven days without user
 * database activity, and names regular requests from the connected application
 * as the way to prevent it. A bare ping would satisfy that, but a request made
 * every day forever should earn its keep: this runs the checks that actually
 * matter — is there an admin to receive the review queue, is the knowledge base
 * reachable, has anything been published without passing review — and records
 * the answer. Staying awake is then a side effect of monitoring.
 *
 * The checks themselves live in the database, in run_system_check. They are
 * questions about the data, and a security-definer function can see past
 * row-level security to count admins and pending submissions, which an
 * anonymous request never could.
 *
 * WHY THIS CALLS AS THE PROJECT AND NOT AS A VISITOR
 *
 * It used to use the ordinary client, which worked only because `anon` held
 * EXECUTE on run_system_check — and that grant was the problem. The function is
 * SECURITY DEFINER, so anyone holding the public key could call it directly and
 * receive exactly the counts `system_checks_admin_read` exists to withhold: how
 * many administrators the platform has, how much is queued unreviewed, how much
 * was published without approval. And not only read them — every call inserts a
 * row and runs a delete across the table, at whatever rate the caller likes.
 *
 * This is a scheduled job with no session, so it has no visitor identity to
 * borrow in the first place. Moving it to the service-role client is what makes
 * the grant removable, and the two land together.
 */

// Never cached: a cached health check is not a health check, and a cached
// response would not touch the database at all, defeating the whole point.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// The price run (backlog 131) reads five news feeds; every step's budget fits in this (src/lib/dailyCheck.ts).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  /*
   * When CRON_SECRET is set the endpoint is closed to anyone without it. Vercel
   * Cron sends it automatically as a bearer token. It is optional so the route
   * still works before the secret is configured — the checks expose nothing
   * sensitive, only counts — but setting it stops a stranger from running the
   * job, and its write, at whatever rate they like.
   */
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!bearerMatches(req.headers.get("authorization"), secret)) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error(
        "health: SUPABASE_SERVICE_ROLE_KEY is not set, so the check cannot run. " +
          "It is required since run_system_check stopped being callable by anon.",
      );
      return NextResponse.json(
        { ok: false, error: "الفحص غير مُهيّأ على هذا النشر." },
        { status: 500 },
      );
    }

    /*
     * الخطوات بترتيبٍ ومهلة (البند ١٩٨ ج٨، src/lib/dailyCheck.ts): ما وُجد الفحص من أجله أوّلاً، وقراءة الأسعار من
     * المصادر الخارجيّة البطيئة آخراً بما بقي من الدقيقة. كلّ خطوةٍ تتعثّر أو تتجاوز مهلتها تُسجَّل ويمضي ما بعدها.
     *
     *  - الكنس (`prune_ephemeral_rows`): كان يجري في كلّ سؤالٍ للمساعد، ومكانه هنا. لا يعتمد عليه شيء.
     *  - فحص النظام (`run_system_check`): هو ما يُبقي القاعدة مستيقظة ويسجّل حالتها؛ فشله وحده يجعل الجواب 500.
     *  - الفاو (البند ١٩٧): تقارن ملفّات data/ بالقاعدة وتضع الفرق بانتظار المدير؛ طلبٌ صغير حين لا يتغيّر ملفّ.
     *  - مسك الدفاتر (١٨٧ و١٩١): ترحيل ما فات، والمطابقة، ومجاميع الشبكة.
     *  - الأسعار (١٣١) ثمّ تنبيهاتها (١٦٦): سجلّها في price_runs، و/admin/prices يقرؤه.
     */
    let check: { data: unknown; error: { message: string } | null } = { data: null, error: null };
    const results = await runSteps(
      dailySteps({
        prune: async () => {
          const { data, error } = await supabase.rpc("prune_ephemeral_rows");
          if (error) throw new Error(error.message);
          return data;
        },
        systemCheck: async () => {
          check = await supabase.rpc("run_system_check");
          if (check.error) throw new Error(check.error.message);
          return true;
        },
        faostat: () => syncFaostat(supabase, "cron"),
        bookkeeping: () => runBookkeeping(supabase),
        prices: () => refreshPrices(supabase, "cron"),
        priceAlerts: () => evaluatePriceAlerts(supabase),
      }),
      DAILY_DEADLINE_MS,
      DAILY_RESERVE_MS,
    );
    for (const r of results) {
      if (r.status === "ok") console.log(`health: ${r.name}`, r.ms, "ms");
      else console.error(`health: ${r.name} ${r.status}`, r.error ?? "", r.ms, "ms");
    }

    const checked = results.find((r) => r.name === "system_check");
    if (!checked || checked.status !== "ok") {
      const why = check.error?.message ?? (checked ? checked.status : "not run");
      console.error("health: check failed", why);
      // A 500 here means the check could not run, which is a genuine failure
      // worth alerting on.
      return NextResponse.json({ ok: false, error: why }, { status: 500 });
    }
    const data = check.data as Record<string, unknown> | null;

    /*
     * Always 200 when the check ran, even when it found problems.
     *
     * "No admin account exists" is a real finding, but it is a finding this
     * endpoint successfully produced — reporting it as an HTTP failure would
     * mark the scheduled job as broken and train whoever watches it to ignore
     * the alert. The problems travel in the body and surface in the admin panel.
     */
    /*
     * The counts travel back only to a caller that proved it is the scheduler.
     *
     * CRON_SECRET is optional so the job keeps working before it is configured
     * — but "optional secret" and "returns the admin counts" cannot both be
     * true, or closing the RPC would have moved the leak rather than fixed it.
     * Unauthenticated, the endpoint still runs the check and still keeps the
     * database awake; it just answers with whether it ran. The findings are in
     * `system_checks`, which the admin panel reads under its own policy.
     */
    if (!secret) {
      return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
    }

    return NextResponse.json({ checkedAt: new Date().toISOString(), ...data });
  } catch (err) {
    console.error("health: unhandled error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
