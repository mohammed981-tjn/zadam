import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * «نزّل بياناتي» (البند ١٩٥): قبل أن يطلب صاحب الحساب إغلاقه، يأخذ ملفّاً بما هو له — ملفّه ودفاتره وقيودها وأراضيه
 * وعقوده وتوقيعاته واستثماراته. يُقرأ بجلسته هو، فما تمنعه سياسات الصفوف عنه لا يصل الملفّ.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "سجّل دخولك أولاً." }, { status: 401 });

  const { data: books } = await supabase.from("ledger_books").select("*").eq("owner_id", user.id);
  const bookIds = ((books ?? []) as { id: string }[]).map((b) => b.id);
  const inBooks = <T,>(table: string) =>
    bookIds.length ? supabase.from(table).select("*").in("book_id", bookIds) : Promise.resolve({ data: [] as T[] });

  const [profile, lands, entries, lines, accounts, links, agreements, signatures, investments] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, country, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("lands").select("*").eq("owner_id", user.id),
    inBooks("journal_entries"),
    inBooks("journal_lines"),
    inBooks("ledger_accounts"),
    supabase.from("ledger_links").select("*").or(`proposer_owner.eq.${user.id},counter_owner.eq.${user.id}`),
    supabase.from("partnership_agreements").select("*").or(`owner_id.eq.${user.id},investor_id.eq.${user.id}`),
    supabase.from("partnership_signatures").select("*").eq("signer_id", user.id),
    supabase.from("investments").select("*").eq("investor_id", user.id),
  ]);

  const file = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, phone: user.phone ?? null, ...(profile.data ?? {}) },
    lands: lands.data ?? [],
    ledger: { books: books ?? [], accounts: accounts.data ?? [], entries: entries.data ?? [], lines: lines.data ?? [], links: links.data ?? [] },
    partnership: { agreements: agreements.data ?? [], signatures: signatures.data ?? [] },
    investments: investments.data ?? [],
  };
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sudagri-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
