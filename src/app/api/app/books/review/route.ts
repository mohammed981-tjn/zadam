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
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * المراجعة في التطبيق (البند ٢٠٥): /books/review on the website — what waits in the person's books with the approve and
 * turn-back answers, who prepares for them, the "review every entry" setting, the invitations to him, and what he
 * prepared for others. Every answer is a call of lib/ledger/journalWrites, as on the website, as the signed-in person.
 */

const status = (locale: Locale): Record<string, string> => ({
  pending: tr(locale, "ينتظر الاعتماد", "Awaiting approval"),
  posted: tr(locale, "اعتُمد ورُحِّل", "Approved and posted"),
  rejected: tr(locale, "رُدّ", "Turned back"),
  withdrawn: tr(locale, "سُحب", "Withdrawn"),
  invited: tr(locale, "مدعوّ", "Invited"),
  active: tr(locale, "يُعِدّ", "Preparing"),
  declined: tr(locale, "اعتذر", "Declined"),
  ended: tr(locale, "انتهى", "Ended"),
});

const money = (minor: number, currency: string) => formatMoney(BigInt(Math.round(Number(minor))), isCurrency(currency) ? currency : "USD");

function draftView(d: DraftRow, chart: ChartAccount[], by: string, locale: Locale) {
  const name = (code?: string) => {
    const a = chart.find((c) => c.code === code);
    return a ? `${a.code} — ${a.name_ar}` : (code ?? "");
  };
  return {
    id: d.id,
    date: d.entry_date,
    memo: d.memo,
    status: d.status,
    status_label: status(locale)[d.status] ?? d.status,
    note: d.decision_note,
    by,
    has_document: !!d.document_path,
    lines: d.lines.map((l) => ({ account: name(l.account), side: l.side, amount: money(l.minor, l.currency) })),
  };
}

const preparerName = (p: PreparerRow | undefined, locale: Locale) => {
  if (!p) return tr(locale, "أنت", "You");
  const who = p.full_name ?? (p.contact_tail ? `…${p.contact_tail}` : "");
  return p.role === "agent" ? tr(locale, `${p.company_name ?? "وكيلك"}${who ? ` (${who})` : ""}`, `${p.company_name ?? "Your agent"}${who ? ` (${who})` : ""}`) : who || tr(locale, "المحاسب", "The accountant");
};

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  try {
    const data = await loadReview(supabase, user.id);
    return NextResponse.json(
      {
        books: data.owned.map(({ book, pending, preparers, chart }) => {
          const byRef = new Map(preparers.map((p) => [p.id, p]));
          return {
            id: book.id,
            label: bookLabel(book, locale),
            kind: book.kind,
            always_review: book.always_review,
            pending: pending.map((d) => draftView(d, chart, preparerName(d.preparer_ref ? byRef.get(d.preparer_ref) : undefined, locale), locale)),
            preparers: preparers.map((p) => ({
              id: p.id,
              name: preparerName(p, locale),
              role: p.role,
              status: p.status,
              status_label: status(locale)[p.status] ?? p.status,
              open: p.status === "invited" || p.status === "active",
              standing: p.standing,
            })),
          };
        }),
        invitations: data.invitations.map((i) => ({ id: i.id, owner_name: i.owner_name || tr(locale, "صاحب دفتر", "A book owner"), book_kind: i.book_kind })),
        agents: data.agents.map((a) => ({ id: a.id, name: a.company_name })),
        preparing: data.preparing.map((b) => ({ id: b.id, label: bookLabel(b, locale) })),
        prepared: data.prepared.map((d) => draftView(d, [], tr(locale, "أنت", "You"), locale)),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app review: read failed", e);
    return NextResponse.json({ error: tr(locale, "تعذّر تحميل المراجعة الآن. أعد المحاولة بعد قليل.", "Could not load the review just now. Try again shortly.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const text = (k: string, max = 120) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const id = text("id", 40);
  const book = text("book", 40);
  let r: WriteResult;
  switch (text("action", 20)) {
    case "approve":
      r = await approveDraft(supabase, id, "app", locale);
      break;
    case "reject":
      r = await rejectDraft(supabase, id, text("note", 300), "app", locale);
      break;
    case "withdraw":
      r = await withdrawDraft(supabase, id, "app", locale);
      break;
    case "review":
      r = await setAlwaysReview(supabase, book, body.always === true, "app", locale);
      break;
    case "invite":
      r = await invitePreparer(supabase, book, text("contact", 254), "app", locale);
      break;
    case "add_agent":
      r = await addAgentPreparer(supabase, book, text("mandate", 40), "app", locale);
      break;
    case "answer":
      r = await answerInvitation(supabase, id, body.accept === true, "app", locale);
      break;
    case "end":
      r = await endPreparer(supabase, id, "app", locale);
      break;
    default:
      r = { ok: false, message: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") };
  }
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
