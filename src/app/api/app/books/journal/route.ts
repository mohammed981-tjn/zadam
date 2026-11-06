import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { discardAppPhoto, ownUploadPath, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { ledgerToday } from "@/lib/ledger/today";
import { postableAccounts, templatesFor, type LineInput } from "@/lib/ledger/journal";
import { bookLabel, loadChart, loadTemplates, writableBooks } from "@/lib/ledger/journalLoad";
import { submitJournalEntry } from "@/lib/ledger/journalWrites";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

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
  const locale = appLocale(req);
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
          label: bookLabel(b, locale),
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
    return NextResponse.json({ error: tr(locale, "تعذّر تحميل الدفتر الآن. أعد المحاولة بعد قليل.", "Could not load the book just now. Try again shortly.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
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

  // The receipt: the path the app stored it at before sending (a PDF it put in the bucket, or a photo stored by
  // ./photo), the same on every retry of the entry; or, from an app that does not do that yet, the photo itself,
  // stored here for this one attempt (backlog 209).
  let document: string | null = null;
  let storedHere: string | null = null;
  if (typeof body.storage_path === "string" && body.storage_path) {
    document = ownUploadPath(user.id, "ledger", body.storage_path);
    if (!document) return NextResponse.json({ error: tr(locale, "مسار المستند ليس في مجلّدك", "The document's path is not in your folder") }, { status: 400 });
  } else if (typeof body.photo === "string" && body.photo) {
    const photo = await uploadAppPhoto(supabase, user.id, "ledger", body.photo);
    if ("error" in photo) return NextResponse.json({ error: photoError(locale, photo.error) }, { status: 400 });
    document = storedHere = photo.path;
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
    locale,
  );
  if (!r.ok) {
    // A refused entry leaves no file behind (as the other routes' discardAppPhoto): the one stored for this attempt
    // always, the one the app kept only when the entry was refused — after an outage the app sends it again with the
    // same path. A file an entry or a draft already carries stays whatever happens (the bucket's keep policy).
    const discard = r.outage ? storedHere : document;
    if (discard) await discardAppPhoto(supabase, discard);
    return NextResponse.json({ error: r.message }, { status: r.outage ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, status: r.status, id: r.id, message: r.message });
}
