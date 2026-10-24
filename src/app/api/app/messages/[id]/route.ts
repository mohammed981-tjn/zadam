import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { explain } from "@/lib/supplyActions";
import type { ConversationView } from "@/lib/messages";

/**
 * One conversation in the app (backlog 144): as /messages/[id] on the website —
 * the view, marked read on opening, with ten-minute links to the files in it —
 * and sending a message. The database checks the caller's place in the thread.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { id } = await params;

  const { data, error } = await auth.supabase.rpc("conversation_view", { p_conv: id });
  if (error || !data) return NextResponse.json({ error: explain("ar", error) }, { status: 404 });
  const view = data as ConversationView;
  await auth.supabase.rpc("conversation_mark_read", { p_conv: id });

  const paths = view.messages.map((m) => m.attachment_path).filter((p): p is string => !!p);
  const files: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: urls } = await auth.supabase.storage.from("evidence").createSignedUrls(paths, 600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) files[u.path] = u.signedUrl;
  }
  return NextResponse.json({ ...view, files }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });
  }
  const { error } = await auth.supabase.rpc("conversation_send", {
    p_conv: id,
    p_body: String(body.body ?? ""),
  });
  if (error) return NextResponse.json({ error: explain("ar", error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
