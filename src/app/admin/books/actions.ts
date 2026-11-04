"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str } from "@/lib/supplyActions";
import { ledgerToday } from "@/lib/ledger/today";
import { feeFormMessage, parseFeeForm } from "@/lib/ledger/platformBook";

/**
 * دفتر المنصّة للإدارة (البند ١٨٩): اقتراح رسمٍ قُبض خارج المنصّة، وإلغاؤه قبل البتّ، وفتح فحصٍ على دفترٍ معطوب.
 * Each is a database function that checks the caller is an administrator; these carry the form there.
 */

function done(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/books");
  redirect(`/admin/books?${key}=${encodeURIComponent(message)}`);
}

export async function proposeFee(fd: FormData) {
  const { supabase } = await signedIn();
  const parsed = parseFeeForm(
    {
      payer: str(fd, "payer"),
      payerKind: str(fd, "payer_kind"),
      kind: str(fd, "kind"),
      amount: str(fd, "amount"),
      currency: str(fd, "currency"),
      date: str(fd, "date"),
      rate: str(fd, "rate"),
      memo: str(fd, "memo"),
    },
    ledgerToday(),
  );
  if (!parsed.ok) done("error", feeFormMessage(parsed.error));
  const a = parsed.args;
  const { error } = await supabase.rpc("ledger_fee_propose", {
    p_payer: a.payer,
    p_payer_kind: a.payerKind,
    p_kind: a.kind,
    p_amount_minor: a.amountMinor,
    p_currency: a.currency,
    p_date: a.date,
    p_rate: a.rate,
    p_memo: a.memo,
    // One key per rendering of the form, so a second tap on the button is the same fee.
    p_key: str(fd, "idem_key") || null,
  });
  if (error) {
    console.error("proposeFee failed", { error });
    done("error", explain("ar", error));
  }
  done("ok", "سُجّل الرسم وأُخطر الدافع. لا يُقيَّد في أيّ دفترٍ حتى يؤكّده.");
}

export async function cancelFee(fd: FormData) {
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("ledger_fee_cancel", { p_fee: str(fd, "fee_id") });
  if (error) done("error", explain("ar", error));
  done("ok", "أُلغي الرسم، ولم يُقيَّد منه شيء.");
}

export async function inspectBook(fd: FormData) {
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("ledger_inspect_open", { p_book: str(fd, "book_id"), p_reason: str(fd, "reason"), p_hours: null });
  if (error) done("error", explain("ar", error));
  done("ok", "فُتح الفحص وأُخطر صاحب الدفتر. اقرأه من «دفتر الحسابات» بالرابط في قائمة الفحوص.");
}
