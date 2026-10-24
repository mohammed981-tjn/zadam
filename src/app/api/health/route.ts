import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatches } from "@/lib/cronAuth";
import { refreshPrices } from "@/lib/priceRefresh";
import { evaluatePriceAlerts } from "@/lib/priceAlerts";
import { runBookkeeping } from "@/lib/bookkeeping";

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
// The price run (backlog 131) reads five news feeds, fifteen seconds each at most.
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
     * الكنسُ هنا لا في المسار الساخن.
     *
     * `check_assistant_rate_limit` used to delete a day of rows on every call —
     * once per question a visitor asked. This job already runs daily and
     * already holds the service-role key, so the sweep belongs here.
     *
     * It runs **before** the check and its failure is logged rather than
     * raised: keeping the database awake is this endpoint's first duty, and a
     * failed prune must not take that down. Nothing depends on the prune
     * having happened — the tables it trims are read by count and by date, not
     * by size.
     */
    const { data: pruned, error: pruneError } =
      await supabase.rpc("prune_ephemeral_rows");
    if (pruneError) {
      console.error("health: prune failed", pruneError);
    } else if (pruned) {
      console.log("health: pruned", pruned);
    }

    /*
     * الأسعار تتحدّث وحدها (البند ١٣١).
     *
     * The daily job the platform already has, rather than a third: the plan's
     * cron allowance is not ours to spend blindly, and this one already holds
     * the service-role client the run writes with. Like the prune, a failed
     * run is logged and never takes the health check down; its own record is
     * in price_runs, which /admin/prices reads.
     */
    try {
      const prices = await refreshPrices(supabase, "cron");
      console.log("health: prices", prices);
    } catch (e) {
      console.error("health: price run failed", e);
    }

    /*
     * تنبيهات الأسعار (البند ١٦٦): بعد أن تُنشر الأسعار الجديدة، يُطلَق ما تجاوزته الحدود.
     * An alert closes as it fires, so running this twice a day (or from /admin/prices) writes
     * nothing the second time. It never throws; a failure is logged and the check goes on.
     */
    const alerts = await evaluatePriceAlerts(supabase);
    if (alerts.checked > 0) console.log("health: price alerts", alerts);

    /*
     * مسكُ الدفاتر (البندان ١٨٧ و١٩١): ترحيلُ ما فات، ومطابقةُ الدفترين، وتسجيلُ مجاميع الشبكة في
     * دفتر المنصّة. لا يرمي أبداً، وكلُّ خطوةٍ فيه تُسجَّل علّتها وتمضي التي بعدها.
     */
    const books = await runBookkeeping(supabase);
    if (books.synced || books.mismatched || books.snapshot) console.log("health: books", books);

    const { data, error } = await supabase.rpc("run_system_check");

    if (error) {
      console.error("health: check failed", error);
      // A 500 here means the check could not run, which is a genuine failure
      // worth alerting on.
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

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
