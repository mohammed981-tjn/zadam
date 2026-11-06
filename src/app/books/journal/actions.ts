"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import {
  addAgentPreparer,
  answerInvitation,
  approveDraft,
  closeIncome,
  closeSeasonIncome,
  endPreparer,
  invitePreparer,
  lockPeriod,
  rejectDraft,
  reopenPeriod,
  setAlwaysReview,
  submitJournalEntry,
  withdrawDraft,
  type SubmitInput,
  type WriteResult,
} from "@/lib/ledger/journalWrites";

/**
 * القيد اليدويّ ومراجعته وإقفال الفترة (البند ٢٠٥) على الموقع. Every step is one call of lib/ledger/journalWrites, which
 * the phone app's routes call too; the database checks the book, the preparer's standing and every figure
 * (supabase/migrations/20261106070000_ledger_manual_review.sql).
 */

function refresh() {
  revalidatePath("/books");
  revalidatePath("/books/review");
  revalidatePath("/books/audit");
  revalidatePath("/books/exceptions");
  revalidatePath("/books/close");
}

function back(path: string, r: WriteResult): never {
  refresh();
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${r.ok ? "ok" : "error"}=${encodeURIComponent(r.message)}`);
}

/** The form's own call (it stays on the page and keeps what was typed when refused). */
export async function submitEntry(input: SubmitInput): Promise<WriteResult> {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  const r = await submitJournalEntry(supabase, input, "web", locale);
  if (r.ok) refresh();
  return r;
}

const bookPath = (base: string, fd: FormData) => {
  const b = str(fd, "book");
  return b ? `${base}?book=${encodeURIComponent(b)}` : base;
};

export async function approveAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await approveDraft(supabase, str(fd, "draft"), "web", locale));
}

export async function rejectAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await rejectDraft(supabase, str(fd, "draft"), str(fd, "note"), "web", locale));
}

export async function withdrawAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await withdrawDraft(supabase, str(fd, "draft"), "web", locale));
}

export async function reviewSettingAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await setAlwaysReview(supabase, str(fd, "book"), str(fd, "always") === "on", "web", locale));
}

export async function inviteAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await invitePreparer(supabase, str(fd, "book"), str(fd, "contact"), "web", locale));
}

export async function addAgentAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await addAgentPreparer(supabase, str(fd, "book"), str(fd, "mandate"), "web", locale));
}

export async function answerAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await answerInvitation(supabase, str(fd, "id"), str(fd, "accept") === "yes", "web", locale));
}

export async function endPreparerAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back("/books/review", await endPreparer(supabase, str(fd, "id"), "web", locale));
}

export async function lockAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back(bookPath("/books/close", fd), await lockPeriod(supabase, str(fd, "book"), str(fd, "through"), "web", locale));
}

export async function closeIncomeAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back(bookPath("/books/close", fd), await closeIncome(supabase, str(fd, "book"), str(fd, "through"), "web", locale));
}

export async function closeSeasonAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back(bookPath("/books/close", fd), await closeSeasonIncome(supabase, str(fd, "book"), str(fd, "season"), str(fd, "date"), "web", locale));
}

export async function reopenAction(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  back(bookPath("/books/close", fd), await reopenPeriod(supabase, str(fd, "book"), str(fd, "through"), str(fd, "reason"), locale));
}

/** Opens the member's farm book (with its chart), for a first entry written by hand. */
export async function openFarmBookAction() {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("ledger_open_book", { p_kind: "farm" });
  if (error) back("/books/journal/new", { ok: false, message: explain(locale, error) });
  refresh();
  redirect("/books/journal/new");
}
