import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { ledgerToday } from "@/lib/ledger/today";
import { loadClose, readableBook } from "@/lib/ledger/journalLoad";
import { closeIncome, closeSeasonIncome, lockPeriod, type WriteResult } from "@/lib/ledger/journalWrites";

/**
 * إقفال الفترة في التطبيق (البند ٢٠٥): /books/close on the website, for the book's owner. GET says how far the book is
 * closed, what was closed into retained earnings, and his finished seasons; POST does what the page's three forms do —
 * `lock`, `close_income`, `close_season` — through lib/ledger/journalWrites, as the signed-in person. Reopening stays the
 * administrators' (on the website).
 */

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  try {
    const { book, own } = await readableBook(supabase, user.id, new URL(req.url).searchParams.get("book"));
    const data = book && book.owner_id === user.id ? await loadClose(supabase, book.id, user.id) : null;
    const last = data?.closings.find((c) => c.scope === "period");
    return NextResponse.json(
      {
        today: ledgerToday(),
        books: own.map((b) => ({ id: b.id, kind: b.kind })),
        book_id: book?.id ?? null,
        owned: !!book && book.owner_id === user.id,
        closed_through: book?.closed_through ?? null,
        income_closed_through: last?.period_to ?? null,
        seasons: (data?.seasons ?? []).map((s) => ({ id: s.id, name: s.name, closed: s.closed })),
        history: [
          ...(data?.closings ?? []).map((c) =>
            c.scope === "period" ? `دخل الفترة ${c.period_from ?? "من أوّلها"} – ${c.period_to}` : `دخل موسم، في ${c.period_to}`,
          ),
          ...(data?.reopens ?? []).map((r) => `أعادت الإدارة الفتح من ${r.was_through} إلى ${r.now_through ?? "غير مقفل"}: ${r.reason}`),
        ],
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app close: read failed", e);
    return NextResponse.json({ error: "تعذّر تحميل الدفتر الآن. أعد المحاولة بعد قليل." }, { status: 500 });
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
  const text = (k: string, max = 40) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const book = text("book");
  let r: WriteResult;
  switch (text("action", 20)) {
    case "lock":
      r = await lockPeriod(supabase, book, text("through", 10), "app", "ar");
      break;
    case "close_income":
      r = await closeIncome(supabase, book, text("through", 10), "app", "ar");
      break;
    case "close_season":
      r = await closeSeasonIncome(supabase, book, text("season"), text("date", 10), "app", "ar");
      break;
    default:
      r = { ok: false, message: "خطوةٌ غير معروفة." };
  }
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
