import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safePagePath } from "@/lib/feedback";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";

/**
 * Receiving a note or suggestion from anyone on the site.
 *
 * A route handler rather than a Server Action, for the reason documented at
 * length in api/leads/route.ts: an action is addressed by an id minted at build
 * time, and a page left open across a redeploy submits into nothing. A feedback
 * form is precisely the thing someone opens, thinks about, and submits ten
 * minutes later.
 */

export const dynamic = "force-dynamic";

const KINDS = ["suggestion", "problem", "question"];

type Body = {
  body?: unknown;
  kind?: unknown;
  display_name?: unknown;
  contact?: unknown;
  page_path?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "طلب غير مفهوم، أعد المحاولة." },
      { status: 400 },
    );
  }

  const body = text(payload.body);
  if (body.length < 3) {
    return NextResponse.json(
      { ok: false, message: "اكتب ملاحظتك أولاً." },
      { status: 400 },
    );
  }

  const kindRaw = text(payload.kind);
  const row = {
    body: body.slice(0, 2000),
    kind: KINDS.includes(kindRaw) ? kindRaw : "suggestion",
    display_name: text(payload.display_name).slice(0, 120) || null,
    contact: text(payload.contact).slice(0, 160) || null,
    page_path: safePagePath(text(payload.page_path)),
  };

  try {
    const supabase = await createClient();

    // Attributed when there is a session, anonymous otherwise. Setting it here
    // rather than trusting the payload is what makes the id mean anything —
    // and the INSERT policy independently refuses any author_id that is not the
    // caller's own, so a forged one fails at the database even if this changed.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    /*
     * Its own bucket, like the lead form. Someone who just asked the assistant
     * five questions is exactly the person most likely to then write a note.
     *
     * Routed through the service-role client: the limiter function takes the
     * address as an argument, so it is no longer callable with a visitor's
     * session. It still fails OPEN — a note the platform never receives is a
     * worse outcome than a duplicate one, and there is no paid API behind this.
     * Checking the tier keeps that a decision rather than an accident.
     */
    const verdict = await checkRateLimit("feedback", clientAddress(req.headers));

    if (!verdict.allowed && verdict.tier !== "unavailable") {
      return NextResponse.json(
        {
          ok: false,
          message: "أرسلت عدة ملاحظات خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.",
        },
        { status: 429 },
      );
    }

    /*
     * Do not chain .select() onto this insert.
     *
     * The same trap as the leads table, and this table walks into it harder.
     * `.select()` makes PostgREST add RETURNING, and RETURNING is filtered
     * through the SELECT policy — which here allows a row only when it is
     * published, or authored by the caller, or the caller is an admin. A fresh
     * row is unpublished by construction, so an anonymous visitor's insert
     * would be accepted and then refused on the way back out, rolling back the
     * whole statement and reporting it as an RLS violation on a write that had
     * in fact succeeded.
     */
    const { error } = await supabase
      .from("feedback")
      .insert({ ...row, author_id: user?.id ?? null });

    if (error) {
      console.error("feedback: insert failed", error);
      return NextResponse.json(
        { ok: false, message: "تعذّر حفظ ملاحظتك الآن، حاول مرة أخرى." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: user
        ? "وصلت ملاحظتك، شكراً. سترى ردّ الإدارة في صفحة الملاحظات وفي إشعاراتك."
        : "وصلت ملاحظتك، شكراً. إن تركت وسيلة تواصل فسنردّ عليها.",
    });
  } catch (err) {
    console.error("feedback: unexpected", err);
    return NextResponse.json(
      { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
