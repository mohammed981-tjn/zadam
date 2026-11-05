import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * مسكُ الدفاتر اليوميّ (البندان ١٨٧ و١٩١): ما تحتاجه الدفاتر كلَّ يومٍ ولا يطلبه مستخدم.
 *
 *   1. `farm_book_sync` — يرحّل إلى دفتر المزرعة أيَّ سطرٍ في دفتر الموسم البسيط بلا قيد. الزنادات تفعل ذلك
 *      عند الكتابة في المعاملة نفسها، فلا يجد هذا عادةً شيئاً؛ هو شبكةُ أمانٍ لا طريق.
 *   2. `farm_book_reconcile` — يطابق الدفترين؛ كلُّ صفٍّ فيه فرقٌ يُسجَّل في السجلّ (error) ليراه من يراقب.
 *   3. `oversight_snapshot` — يسجّل مجاميع الشبكة غير المحجوبة (الشهر الماضي والحاليّ) في الحسابات الإحصائيّة
 *      في دفتر المنصّة. لا يسجّل إلا الفرق عمّا سُجّل، فتكراره في اليوم بلا أثر.
 *   4. `agreement_memo_sync` — يقيّد في الحسابات النظاميّة للمنصّة (٩١١٠/٩١٢٠) كلَّ عقد شراكةٍ وُقِّع بمبلغٍ معلَن ولم
 *      يُقيَّد بعد (البند ١٨٩). عقدٌ بالجنيه بلا سعر صرفٍ منشور ليومه يبقى للغد.
 *   5. `ledger_depreciate_all` — يقيّد إهلاك كلّ أصلٍ ثابت لكلّ شهرٍ انتهى ولم يُقيَّد (البند ١٩٠). مفتاحُ كلّ شهرٍ يمنع
 *      تكراره، والشهر الواقع في فترةٍ أقفلها صاحبها لا يُقيَّد.
 *
 * Each step is its own try: one that fails is logged and the next still runs. Nothing here throws, and the
 * health check that calls it goes on whatever happens.
 */

export interface BookkeepingRun {
  /** Rows the simple book had without an entry in the farm book, now posted. */
  synced: number | null;
  /** Seasons where the two books still disagree after that. */
  mismatched: number | null;
  /** Entries posted into the platform's statistical accounts. */
  snapshot: number | null;
  /** Signed agreements posted into the memorandum accounts; left for another day (no rate); with no amount to post. */
  agreements: { posted: number; skipped: number; withoutAmount: number } | null;
  /** Months of fixed-asset depreciation booked. */
  depreciation: number | null;
}

const count = (data: unknown): number | null => (typeof data === "number" && Number.isFinite(data) ? data : null);

export async function runBookkeeping(admin: SupabaseClient): Promise<BookkeepingRun> {
  const run: BookkeepingRun = { synced: null, mismatched: null, snapshot: null, agreements: null, depreciation: null };

  try {
    const { data, error } = await admin.rpc("farm_book_sync");
    if (error) console.error("bookkeeping: sync", error);
    else run.synced = count(data);
  } catch (e) {
    console.error("bookkeeping: sync failed", e);
  }

  try {
    const { data, error } = await admin.rpc("farm_book_reconcile");
    if (error) console.error("bookkeeping: reconcile", error);
    else if (Array.isArray(data)) {
      run.mismatched = data.length;
      if (data.length > 0) console.error("bookkeeping: the farm book and the simple book disagree", data);
    }
  } catch (e) {
    console.error("bookkeeping: reconcile failed", e);
  }

  try {
    const { data, error } = await admin.rpc("oversight_snapshot");
    if (error) console.error("bookkeeping: snapshot", error);
    else run.snapshot = count(data);
  } catch (e) {
    console.error("bookkeeping: snapshot failed", e);
  }

  try {
    const { data, error } = await admin.rpc("agreement_memo_sync");
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    const posted = count(row?.posted);
    const skipped = count(row?.skipped);
    const withoutAmount = count(row?.without_amount);
    if (error) console.error("bookkeeping: agreements", error);
    else if (posted !== null && skipped !== null && withoutAmount !== null) run.agreements = { posted, skipped, withoutAmount };
  } catch (e) {
    console.error("bookkeeping: agreements failed", e);
  }

  try {
    const { data, error } = await admin.rpc("ledger_depreciate_all");
    if (error) console.error("bookkeeping: depreciation", error);
    else run.depreciation = count(data);
  } catch (e) {
    console.error("bookkeeping: depreciation failed", e);
  }

  return run;
}
