import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }
  }

  try {
    const supabase = await createClient();
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
    return NextResponse.json({ checkedAt: new Date().toISOString(), ...data });
  } catch (err) {
    console.error("health: unhandled error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
