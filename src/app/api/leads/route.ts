import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Receiving a visitor's contact details.
 *
 * This used to be a Server Action, and the leads table had never received a
 * single row. A Server Action is addressed by an id minted at build time: when
 * the deployment changes, every id from the previous build stops existing. The
 * assistant widget is the one component that sits open across that boundary —
 * someone reads the site, asks a couple of questions, the site redeploys, and
 * the moment they finally submit their phone number the request has nowhere to
 * land. To them the panel simply dies.
 *
 * A route handler has no such lifetime. `POST /api/leads` means the same thing
 * on every build, so a page loaded an hour ago still reaches it. That is the
 * whole reason this file exists rather than an action.
 */

export const dynamic = "force-dynamic";

type Body = {
  full_name?: unknown;
  contact?: unknown;
  role?: unknown;
  interest?: unknown;
};

const ROLES = ["investor", "farmer", "other"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "طلب غير مفهوم، أعد المحاولة." },
      { status: 400 },
    );
  }

  const fullName = text(body.full_name);
  const contact = text(body.contact);
  const role = text(body.role);
  const interest = text(body.interest);

  if (!fullName || !contact) {
    return NextResponse.json(
      { ok: false, message: "الاسم ووسيلة التواصل مطلوبان." },
      { status: 400 },
    );
  }

  // Long enough for any real name or address, short enough that the field is
  // not a place to paste a payload into. Truncating beats rejecting: someone
  // who wrote a paragraph in "اهتمامك" should still have their number reach us.
  const capped = {
    full_name: fullName.slice(0, 120),
    contact: contact.slice(0, 160),
    role: ROLES.includes(role) ? role : "other",
    interest: interest ? interest.slice(0, 500) : null,
  };

  try {
    const supabase = await createClient();

    // The leftmost x-forwarded-for entry is client-supplied and spoofable; the
    // last entry is the one Vercel's edge appends for the real connecting IP.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip =
      req.headers.get("x-real-ip") ??
      forwardedFor?.split(",").pop()?.trim() ??
      "unknown";

    /*
     * The same limiter as the assistant, deliberately in its own bucket.
     *
     * The budget is five requests a minute per key. Sharing one bucket would
     * mean a visitor who just asked five questions — which is precisely the
     * visitor the form is shown to — gets turned away when they finally hand
     * over their phone number. Prefixing the key keeps the spam protection and
     * removes that trap.
     */
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "check_assistant_rate_limit",
      { p_ip: `lead:${ip}` },
    );

    if (rateLimitError) {
      // A limiter that cannot be consulted must not block a lead. Log and pass.
      console.error("leads: rate limit check failed", rateLimitError);
    } else if (allowed === false) {
      return NextResponse.json(
        { ok: false, message: "أرسلت الطلب عدة مرات. انتظر دقيقة ثم أعد المحاولة." },
        { status: 429 },
      );
    }

    const { error } = await supabase.from("leads").insert(capped);

    if (error) {
      // The visitor gets a plain sentence; the cause goes to the logs, because
      // "تعذّر الإرسال" with nothing behind it is how this stayed invisible.
      console.error("leads: insert failed", error);
      return NextResponse.json(
        { ok: false, message: "تعذّر حفظ بياناتك الآن، حاول مرة أخرى." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "تم استلام بياناتك، سيتواصل معك فريق سودجري قريباً.",
    });
  } catch (err) {
    console.error("leads: unhandled error", err);
    return NextResponse.json(
      { ok: false, message: "تعذّر حفظ بياناتك الآن، حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
