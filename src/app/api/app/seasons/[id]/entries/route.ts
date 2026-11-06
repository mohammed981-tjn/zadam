import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { recordLedgerEntry } from "@/lib/seasonWrites";

/**
 * قيد مصروفٍ أو إيرادٍ من التطبيق (البند ٢٠٣): the website's «أضف قيداً» on /seasons/[id].
 *
 * The same `recordLedgerEntry` the website's action calls, with the app's session: the same reading of the figures
 * and the day, the same refusal of a stage from another season, the same insert through row-level security, and the
 * ledger's own refusals in the same words. An entry the phone kept with no network arrives here later with the day
 * it was written (`entry_date`), which is accepted on the same terms as the website's outbox, and with the key it was
 * given when typed (`client_key`): sent again after an answer that never reached the phone, it is not saved twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string, max = 200) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");

  const result = await recordLedgerEntry(
    supabase,
    user.id,
    {
      season_id: id,
      category: text("category", 20),
      amount: text("amount", 40),
      currency: text("currency", 5),
      paid_from: text("paid_from", 10),
      fx_rate: text("fx_rate", 40),
      description: text("description", 500),
      entry_date: text("entry_date", 10),
      stage_id: text("stage_id", 40),
      client_key: text("client_key", 40),
    },
    "ar",
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  // A resend of an entry already saved (its key is in the book) is the same success: the phone stops sending it.
  return NextResponse.json({ ok: true, already: result.already === true, message: "سُجّل القيد في دفتر الموسم." });
}
