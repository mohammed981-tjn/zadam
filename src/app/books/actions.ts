"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { linkProposalMessage, parseLinkProposal, safeReturnTo } from "@/lib/ledgerLinks";
import { answerLink, type LinkAnswer } from "@/lib/ledgerLinkWrites";

/**
 * القيود المتقابلة: اقتراح وتأكيد واعتراض وإلغاء (البند ١٨٨ ج). Each is a database function that
 * checks the caller is the right party of a signed agreement (supabase/migrations/20261024160000_
 * ledger_links.sql); these carry the form there and bring the result back to the page it came from.
 */

function done(fd: FormData, key: "ok" | "error", message: string): never {
  const to = safeReturnTo(str(fd, "return_to"));
  revalidatePath("/books");
  revalidatePath(to.split("?")[0]);
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${key}=${encodeURIComponent(message)}`);
}

export async function proposeLink(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();

  const parsed = parseLinkProposal({
    kind: str(fd, "kind"),
    amount: str(fd, "amount"),
    currency: str(fd, "currency"),
    date: str(fd, "date"),
    account: str(fd, "account"),
    principal: str(fd, "principal"),
    season: str(fd, "season"),
    rate: str(fd, "rate"),
    memo: str(fd, "memo"),
  });
  const agreement = str(fd, "agreement_id");
  if (!parsed.ok || !agreement) {
    done(fd, "error", parsed.ok ? t("العقد غير محدّد.", "The agreement is not set.") : linkProposalMessage(parsed.error, t));
  }
  const a = parsed.args;

  const { error } = await supabase.rpc("ledger_link_propose", {
    p_agreement: agreement,
    p_kind: a.kind,
    p_amount_minor: a.amountMinor,
    p_currency: a.currency,
    p_date: a.date,
    p_account: a.account,
    p_principal_minor: a.principalMinor,
    p_season: a.season,
    p_rate: a.rate,
    p_memo: a.memo,
    // One key per rendering of the form, so a second tap on the button is the same proposal.
    p_key: str(fd, "idem_key") || null,
  });
  if (error) {
    console.error("proposeLink failed", { agreement, kind: a.kind, error });
    done(fd, "error", explain(locale, error));
  }
  done(fd, "ok", t("أُرسل الاقتراح إلى شريكك؛ لا يُقيَّد في أيّ دفترٍ حتى يؤكّده.", "The proposal was sent to your partner; nothing is booked in any book until they confirm it."));
}

/**
 * The answers to a partner's entry, and to a request to cancel a confirmed one. Each is `answerLink`
 * (lib/ledgerLinkWrites), which the phone app's route calls too; these carry the form there and the result back.
 */
async function answer(fd: FormData, action: LinkAnswer) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const result = await answerLink(
    supabase,
    action,
    { linkId: str(fd, "link_id"), reversalId: str(fd, "reversal_id"), account: str(fd, "account"), reason: str(fd, "reason") },
    locale,
  );
  done(fd, result.ok ? "ok" : "error", result.message);
}

export async function confirmLink(fd: FormData) {
  await answer(fd, "confirm");
}

export async function rejectLink(fd: FormData) {
  await answer(fd, "reject");
}

export async function cancelLink(fd: FormData) {
  await answer(fd, "cancel");
}

// ── إلغاء قيدٍ مؤكَّد باتّفاق الطرفين (البند ١٩٢) ──────────────────────────────────────────────────────────

export async function requestReversal(fd: FormData) {
  await answer(fd, "request_reversal");
}

export async function acceptReversal(fd: FormData) {
  await answer(fd, "accept_reversal");
}

export async function rejectReversal(fd: FormData) {
  await answer(fd, "reject_reversal");
}

export async function withdrawReversal(fd: FormData) {
  await answer(fd, "withdraw_reversal");
}
