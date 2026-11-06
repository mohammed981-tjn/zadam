import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { formatMoney, isCurrency } from "@/lib/ledger/money";
import { bookLabel, loadReview, type DraftRow, type PreparerRow } from "@/lib/ledger/journalLoad";
import type { ChartAccount } from "@/lib/ledger/journal";
import {
  addAgentPreparer,
  answerInvitation,
  approveDraft,
  endPreparer,
  invitePreparer,
  rejectDraft,
  setAlwaysReview,
  withdrawDraft,
  type WriteResult,
} from "@/lib/ledger/journalWrites";

/**
 * المراجعة في التطبيق (البند ٢٠٥): /books/review on the website — what waits in the person's books with the approve and
 * turn-back answers, who prepares for them, the "review every entry" setting, the invitations to him, and what he
 * prepared for others. Every answer is a call of lib/ledger/journalWrites, as on the website, as the signed-in person.
 */

const STATUS: Record<string, string> = {
  pending: "ينتظر الاعتماد",
  posted: "اعتُمد ورُحِّل",
  rejected: "رُدّ",
  withdrawn: "سُحب",
  invited: "مدعوّ",
  active: "يُعِدّ",
  declined: "اعتذر",
  ended: "انتهى",
};

const money = (minor: number, currency: string) => formatMoney(BigInt(Math.round(Number(minor))), isCurrency(currency) ? currency : "USD");

function draftView(d: DraftRow, chart: ChartAccount[], by: string) {
  const name = (code?: string) => {
    const a = chart.find((c) => c.code === code);
    return a ? `${a.code} — ${a.name_ar}` : (code ?? "");
  };
  return {
    id: d.id,
    date: d.entry_date,
    memo: d.memo,
    status: d.status,
    status_label: STATUS[d.status] ?? d.status,
    note: d.decision_note,
    by,
    has_document: !!d.document_path,
    lines: d.lines.map((l) => ({ account: name(l.account), side: l.side, amount: money(l.minor, l.currency) })),
  };
}

const preparerName = (p: PreparerRow | undefined) => {
  if (!p) return "أنت";
  const who = p.full_name ?? (p.contact_tail ? `…${p.contact_tail}` : "");
  return p.role === "agent" ? `${p.company_name ?? "وكيلك"}${who ? ` (${who})` : ""}` : who || "المحاسب";
};

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  try {
    const data = await loadReview(supabase, user.id);
    return NextResponse.json(
      {
        books: data.owned.map(({ book, pending, preparers, chart }) => {
          const byRef = new Map(preparers.map((p) => [p.id, p]));
          return {
            id: book.id,
            label: bookLabel(book, "ar"),
            kind: book.kind,
            always_review: book.always_review,
            pending: pending.map((d) => draftView(d, chart, preparerName(d.preparer_ref ? byRef.get(d.preparer_ref) : undefined))),
            preparers: preparers.map((p) => ({
              id: p.id,
              name: preparerName(p),
              role: p.role,
              status: p.status,
              status_label: STATUS[p.status] ?? p.status,
              open: p.status === "invited" || p.status === "active",
              standing: p.standing,
            })),
          };
        }),
        invitations: data.invitations.map((i) => ({ id: i.id, owner_name: i.owner_name || "صاحب دفتر", book_kind: i.book_kind })),
        agents: data.agents.map((a) => ({ id: a.id, name: a.company_name })),
        preparing: data.preparing.map((b) => ({ id: b.id, label: bookLabel(b, "ar") })),
        prepared: data.prepared.map((d) => draftView(d, [], "أنت")),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app review: read failed", e);
    return NextResponse.json({ error: "تعذّر تحميل المراجعة الآن. أعد المحاولة بعد قليل." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string, max = 120) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const id = text("id", 40);
  const book = text("book", 40);
  let r: WriteResult;
  switch (text("action", 20)) {
    case "approve":
      r = await approveDraft(supabase, id, "app", "ar");
      break;
    case "reject":
      r = await rejectDraft(supabase, id, text("note", 300), "app", "ar");
      break;
    case "withdraw":
      r = await withdrawDraft(supabase, id, "app", "ar");
      break;
    case "review":
      r = await setAlwaysReview(supabase, book, body.always === true, "app", "ar");
      break;
    case "invite":
      r = await invitePreparer(supabase, book, text("contact", 254), "app", "ar");
      break;
    case "add_agent":
      r = await addAgentPreparer(supabase, book, text("mandate", 40), "app", "ar");
      break;
    case "answer":
      r = await answerInvitation(supabase, id, body.accept === true, "app", "ar");
      break;
    case "end":
      r = await endPreparer(supabase, id, "app", "ar");
      break;
    default:
      r = { ok: false, message: "خطوةٌ غير معروفة." };
  }
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
