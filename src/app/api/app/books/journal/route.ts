import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { ownPdfPath, uploadAppPhoto } from "@/lib/appPhoto";
import { ledgerToday } from "@/lib/ledger/today";
import { postableAccounts, templatesFor, type LineInput } from "@/lib/ledger/journal";
import { bookLabel, loadChart, loadTemplates, writableBooks } from "@/lib/ledger/journalLoad";
import { submitJournalEntry } from "@/lib/ledger/journalWrites";

/**
 * قيدٌ جديد في التطبيق (البند ٢٠٥): /books/journal/new on the website.
 *
 * GET gives the books the person writes in (his own, and those he prepares for), the chosen book's accounts that take
 * entries, and its ready entries. POST sends an entry through the same lib/ledger/journalWrites the website's form
 * calls, as the signed-in person; a photo of the receipt is stored first in his own `ledger` folder
 * (src/lib/appPhoto.ts), a PDF arrives as the path the app uploaded it to. No elevated key.
 */

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const want = new URL(req.url).searchParams.get("book");
  try {
    const books = (await writableBooks(supabase, user.id)).filter((b) => b.kind !== "platform");
    const book = books.find((b) => b.id === want) ?? books.find((b) => b.role === "owner" && b.kind === "farm") ?? books[0] ?? null;
    const [chart, templates] = book ? await Promise.all([loadChart(supabase, book.id), loadTemplates(supabase)]) : [[], []];
    return NextResponse.json(
      {
        today: ledgerToday(),
        books: books.map((b) => ({
          id: b.id,
          kind: b.kind,
          role: b.role,
          label: bookLabel(b, "ar"),
          closed_through: b.closed_through,
          always_review: b.always_review,
        })),
        book_id: book?.id ?? null,
        accounts: postableAccounts(chart).map((a) => ({
          code: a.code,
          name: a.name_ar,
          type: a.type,
          system_key: a.system_key,
          currency: a.currency,
          provider: a.provider,
        })),
        templates: book
          ? templatesFor(templates, book.kind).map((t) => ({ key: t.key, group: t.grp, name: t.name_ar, hint: t.hint_ar, lines: t.lines }))
          : [],
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("app journal: read failed", e);
    return NextResponse.json({ error: "تعذّر تحميل الدفتر الآن. أعد المحاولة بعد قليل." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string, max = 120) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const rawLines = Array.isArray(body.lines) ? (body.lines as unknown[]).slice(0, 200) : [];
  const lines: LineInput[] = rawLines.map((l) => {
    const o = (l ?? {}) as Record<string, unknown>;
    return {
      account: typeof o.account === "string" ? o.account.slice(0, 8) : "",
      side: o.side === "C" ? "C" : "D",
      amount: typeof o.amount === "string" ? o.amount.slice(0, 40) : "",
    };
  });

  let document: string | null = null;
  if (typeof body.photo === "string" && body.photo) {
    const photo = await uploadAppPhoto(supabase, user.id, "ledger", body.photo);
    if ("error" in photo) return NextResponse.json({ error: photo.error }, { status: 400 });
    document = photo.path;
  } else if (typeof body.storage_path === "string" && body.storage_path) {
    document = ownPdfPath(user.id, "ledger", body.storage_path);
    if (!document) return NextResponse.json({ error: "مسار المستند ليس في مجلّدك" }, { status: 400 });
  }

  const r = await submitJournalEntry(
    supabase,
    {
      book: text("book", 40),
      key: text("key", 120),
      date: text("date", 10),
      memo: text("memo", 500),
      currency: text("currency", 3) || "USD",
      rate: text("rate", 30),
      lines,
      template: text("template", 40) || null,
      kind: text("kind", 12) === "adjusting" ? "adjusting" : "manual",
      document,
    },
    "app",
    "ar",
  );
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, status: r.status, id: r.id, message: r.message });
}
