import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { explain } from "@/lib/supplyActions";
import { RESEARCH_KIND_LABEL, type ResearchKind } from "@/lib/research";

/**
 * «ما أرسلتُه» في التطبيق (البند ٢٠٣) — /library/mine كما هي: ما أرسله صاحب الحساب إلى المكتبة وحاله، وسبب الردّ.
 *
 * As the signed-in person, through the database function the page calls (`research_mine`), which answers with that
 * person's own sendings only.
 */
type Mine = {
  id: string;
  kind: ResearchKind;
  title: string;
  status: "pending" | "published" | "rejected";
  review_note: string | null;
  created_at: string;
};

const STATE: Record<Mine["status"], string> = {
  pending: "ينتظر المراجعة",
  published: "منشور",
  rejected: "رُدّ",
};

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  const { data, error } = await auth.supabase.rpc("research_mine");
  if (error) return NextResponse.json({ error: explain("ar", error) }, { status: 400 });
  const mine = ((data ?? []) as Mine[]).map((m) => ({
    ...m,
    kindLabel: RESEARCH_KIND_LABEL[m.kind]?.[0] ?? m.kind,
    statusLabel: STATE[m.status] ?? m.status,
  }));
  return NextResponse.json({ items: mine }, { headers: { "cache-control": "no-store" } });
}
