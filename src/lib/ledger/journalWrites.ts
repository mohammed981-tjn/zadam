/**
 * كتابة القيد اليدويّ ومراجعته وإقفال الفترة (البند ٢٠٥) — الدوالّ نفسها للموقع والتطبيق.
 *
 * The website's actions (src/app/books/{journal,review,close}/actions.ts) and the phone app's routes
 * (src/app/api/app/books/{journal,review,close}) call these with the caller's own client: the database checks the book is
 * his (or that he is its standing preparer, or an administrator where that is allowed) and every figure, through the
 * functions of supabase/migrations/20261106070000_ledger_manual_review.sql. No elevated key anywhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { explain } from "@/lib/supplyActions";
import { isDbOutage } from "@/lib/dbOutage";
import { formatMoney } from "./money";
import { entryErrorMessage, parseEntry, type ChartAccount, type EntryInput } from "./journal";

/** `outage`: the database was not reached (isDbOutage) — nothing was decided, and the same entry may be sent again. */
export type WriteResult = { ok: boolean; message: string; status?: "posted" | "pending"; id?: string; outage?: boolean };
export type Via = "web" | "app";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => uuid.test(s);
const fail = (locale: Locale, error: { code?: string; message?: string }): WriteResult => ({ ok: false, message: explain(locale, error) });

/** The chart the form needs: the owner's through the policy, a preparer's through ledger_preparer_chart. */
export async function bookChart(supabase: SupabaseClient, bookId: string): Promise<ChartAccount[]> {
  const { data, error } = await supabase.rpc("ledger_preparer_chart", { p_book: bookId });
  if (error) throw new Error(`ledger_preparer_chart: ${error.message}`);
  return (data ?? []) as ChartAccount[];
}

export interface SubmitInput extends EntryInput {
  book: string;
  /** The sender's own key for this entry (a retry with it writes nothing twice). */
  key: string;
  template?: string | null;
  kind?: "manual" | "adjusting";
  /** A file already in the sender's own `ledger` folder of the evidence bucket. */
  document?: string | null;
}

export async function submitJournalEntry(
  supabase: SupabaseClient,
  input: SubmitInput,
  via: Via,
  locale: Locale,
  chart?: ChartAccount[],
): Promise<WriteResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  if (!isUuid(input.book)) return { ok: false, message: t("اختر الدفتر.", "Choose the book.") };
  if (input.key.length < 8 || input.key.length > 120) return { ok: false, message: t("أعد تحميل الصفحة وأرسل القيد.", "Reload the page and send the entry again.") };
  let accounts = chart;
  if (!accounts) {
    try {
      accounts = await bookChart(supabase, input.book);
    } catch (e) {
      console.error("journal: chart failed", e);
      return { ok: false, message: t("ليس هذا دفترك، أو تعذّرت قراءة حساباته.", "This is not your book, or its accounts could not be read.") };
    }
  }
  const parsed = parseEntry(input, accounts);
  if (!parsed.ok) {
    const cur = input.currency.toUpperCase() === "SDG" ? "SDG" : "USD";
    return { ok: false, message: entryErrorMessage(parsed.error, t, (m) => formatMoney(m, cur)) };
  }
  const { data, error } = await supabase.rpc("ledger_entry_submit", {
    p_book: input.book,
    p_date: parsed.date,
    p_memo: parsed.memo,
    p_lines: parsed.lines,
    p_key: input.key,
    p_rate: parsed.rate,
    p_kind: input.kind ?? "manual",
    p_template: input.template || null,
    p_document: input.document || null,
    p_via: via,
  });
  if (error && isDbOutage(error)) {
    console.error("journal: the database was not reached", { error: error.message });
    return {
      ok: false,
      outage: true,
      message: t("تعذّر الوصول إلى الدفتر الآن. لم يُحفظ شيء — أرسل القيد نفسه بعد قليل.", "The book could not be reached just now. Nothing was saved — send the same entry again shortly."),
    };
  }
  if (error) {
    console.error("journal: submit refused", { error: error.message });
    return fail(locale, error);
  }
  const r = (data ?? {}) as { status?: string; entry_id?: string; draft_id?: string };
  if (r.status === "posted") {
    return { ok: true, status: "posted", id: r.entry_id, message: t("رُحِّل القيد في دفترك.", "The entry was posted in the book.") };
  }
  return {
    ok: true,
    status: "pending",
    id: r.draft_id,
    message: t(
      "حُفظ القيد وينتظر اعتماد صاحب الدفتر، ولا يُرحَّل قبل ذلك.",
      "The entry was saved and waits for the book owner's approval; it is not posted before then.",
    ),
  };
}

export async function approveDraft(supabase: SupabaseClient, draft: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(draft)) return { ok: false, message: tr(locale, "قيدٌ غير معروف.", "Unknown entry.") };
  const { error } = await supabase.rpc("ledger_draft_approve", { p_draft: draft, p_via: via });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "اعتُمد القيد ورُحِّل في دفترك.", "The entry was approved and posted in your book.") };
}

export async function rejectDraft(supabase: SupabaseClient, draft: string, note: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(draft)) return { ok: false, message: tr(locale, "قيدٌ غير معروف.", "Unknown entry.") };
  const { error } = await supabase.rpc("ledger_draft_reject", { p_draft: draft, p_note: note.trim().slice(0, 300), p_via: via });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "رُدّ القيد إلى مُعِدّه بسببه.", "The entry was turned back to its preparer with your reason.") };
}

export async function withdrawDraft(supabase: SupabaseClient, draft: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(draft)) return { ok: false, message: tr(locale, "قيدٌ غير معروف.", "Unknown entry.") };
  const { error } = await supabase.rpc("ledger_draft_withdraw", { p_draft: draft, p_via: via });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "سُحب القيد.", "The entry was withdrawn.") };
}

export async function setAlwaysReview(supabase: SupabaseClient, book: string, on: boolean, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book)) return { ok: false, message: tr(locale, "اختر الدفتر.", "Choose the book.") };
  const { error } = await supabase.rpc("ledger_review_set", { p_book: book, p_always: on, p_via: via });
  if (error) return fail(locale, error);
  return {
    ok: true,
    message: on
      ? tr(locale, "صار كلّ قيدٍ يُعرض عليك قبل ترحيله، قيودك أنت أيضاً.", "Every entry, yours too, is now shown to you before it is posted.")
      : tr(locale, "قيودك تُرحَّل في الحال، وقيود المُعِدّين تنتظر اعتمادك.", "Your entries post at once; preparers' entries wait for your approval."),
  };
}

export async function invitePreparer(supabase: SupabaseClient, book: string, contact: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book)) return { ok: false, message: tr(locale, "اختر الدفتر.", "Choose the book.") };
  const { error } = await supabase.rpc("ledger_preparer_invite", { p_book: book, p_contact: contact.trim().slice(0, 254), p_via: via });
  if (error) return fail(locale, error);
  // The same answer whether or not the number or address has an account (backlog 209): the invitation list says the same.
  return {
    ok: true,
    message: tr(
      locale,
      "إن كان للرقم أو البريد حسابٌ وصلته الدعوة، ويُعِدّ قيودك حين يقبلها من حسابه.",
      "If the number or e-mail has an account, the invitation reached it; they prepare your entries once they accept it from their account.",
    ),
  };
}

export async function addAgentPreparer(supabase: SupabaseClient, book: string, mandate: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book) || !isUuid(mandate)) return { ok: false, message: tr(locale, "اختر الوكيل.", "Choose the agent.") };
  const { error } = await supabase.rpc("ledger_preparer_add_agent", { p_book: book, p_mandate: mandate, p_via: via });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "صار وكيلك يُعِدّ قيود دفترك، ولا يُرحَّل شيءٌ حتى تعتمده.", "Your agent now prepares your book's entries; nothing posts until you approve it.") };
}

export async function answerInvitation(supabase: SupabaseClient, id: string, accept: boolean, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, message: tr(locale, "دعوةٌ غير معروفة.", "Unknown invitation.") };
  const { error } = await supabase.rpc("ledger_preparer_answer", { p_id: id, p_accept: accept, p_via: via });
  if (error) return fail(locale, error);
  return {
    ok: true,
    message: accept
      ? tr(locale, "قبلت الدعوة: تُعِدّ قيود الدفتر، ويعتمدها صاحبه.", "You accepted: you prepare the book's entries and its owner approves them.")
      : tr(locale, "اعتذرت عن الدعوة.", "You declined the invitation."),
  };
}

export async function endPreparer(supabase: SupabaseClient, id: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, message: tr(locale, "إذنٌ غير معروف.", "Unknown permission.") };
  const { error } = await supabase.rpc("ledger_preparer_end", { p_id: id, p_via: via });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "انتهى الإذن.", "The permission has ended.") };
}

const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

export async function lockPeriod(supabase: SupabaseClient, book: string, through: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book) || !isoDate(through)) return { ok: false, message: tr(locale, "اختر اليوم الذي تُقفل حتّاه.", "Choose the day to close through.") };
  const { error } = await supabase.rpc("ledger_period_close", { p_book: book, p_date: through.trim(), p_via: via });
  if (error) return fail(locale, error);
  return {
    ok: true,
    message: tr(locale, `أُقفل الدفتر حتى ${through.trim()}: لا قيد بتاريخٍ فيها بعد اليوم.`, `The book is closed through ${through.trim()}: nothing can be dated in it from now on.`),
  };
}

export async function closeIncome(supabase: SupabaseClient, book: string, through: string, via: Via, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book) || !isoDate(through)) return { ok: false, message: tr(locale, "اختر آخر يومٍ في الفترة.", "Choose the period's last day.") };
  const { error } = await supabase.rpc("ledger_close_income", { p_book: book, p_to: through.trim(), p_via: via });
  if (error) return fail(locale, error);
  return {
    ok: true,
    message: tr(
      locale,
      `قُيِّد قيد الإقفال: إيرادات الفترة ومصروفاتها إلى الأرباح المحتجزة، وأُقفل الدفتر حتى ${through.trim()}.`,
      `The closing entry was posted: the period's income and expenses to retained earnings, and the book is closed through ${through.trim()}.`,
    ),
  };
}

export async function closeSeasonIncome(
  supabase: SupabaseClient,
  book: string,
  season: string,
  date: string,
  via: Via,
  locale: Locale,
): Promise<WriteResult> {
  if (!isUuid(book) || !isUuid(season)) return { ok: false, message: tr(locale, "اختر الموسم.", "Choose the season.") };
  const { error } = await supabase.rpc("ledger_close_season", {
    p_book: book,
    p_season: season,
    p_date: isoDate(date) ? date.trim() : null,
    p_via: via,
  });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "قُيِّد قيد إقفال الموسم في الأرباح المحتجزة.", "The season's closing entry was posted to retained earnings.") };
}

/** For the administrators only (the database checks it): reopen a closed period, with the reason written. */
export async function reopenPeriod(supabase: SupabaseClient, book: string, through: string, reason: string, locale: Locale): Promise<WriteResult> {
  if (!isUuid(book)) return { ok: false, message: tr(locale, "اختر الدفتر.", "Choose the book.") };
  const { error } = await supabase.rpc("ledger_period_reopen", {
    p_book: book,
    p_through: isoDate(through) ? through.trim() : null,
    p_reason: reason.trim().slice(0, 500),
  });
  if (error) return fail(locale, error);
  return { ok: true, message: tr(locale, "أُعيد فتح الفترة، وسُجّل السبب، وأُخبر صاحب الدفتر.", "The period was reopened, the reason recorded, and the book's owner told.") };
}
