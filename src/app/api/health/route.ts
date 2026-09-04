import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatches } from "@/lib/cronAuth";

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
