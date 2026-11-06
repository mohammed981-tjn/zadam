/**
 * الردّ على قيود الشريك: التأكيد والاعتراض والإلغاء، وطلبات إلغاء القيد المؤكَّد (البند ١٨٨ ج، ١٩٢، ٢٠٣).
 *
 * Each is a database function that checks the caller is the right party of a signed agreement
 * (supabase/migrations/20261024160000_ledger_links.sql and the reversal migration). The website's actions
 * (src/app/books/actions.ts) and the phone app's route (src/app/api/app/books/links) both call `answerLink`, with the
 * caller's own client, so the app sends the same arguments, gets the same refusals in the same words (`explain`), and
 * says the same thing when it worked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "./i18n";
import { parseReversalReason } from "./ledgerLinks";
import { explain } from "./supplyActions";

export const LINK_ANSWERS = [
  "confirm",
  "reject",
  "cancel",
  "request_reversal",
  "accept_reversal",
  "reject_reversal",
  "withdraw_reversal",
] as const;
export type LinkAnswer = (typeof LINK_ANSWERS)[number];
export const isLinkAnswer = (a: string): a is LinkAnswer => (LINK_ANSWERS as readonly string[]).includes(a);

export interface LinkAnswerArgs {
  linkId: string;
  reversalId: string;
  /** Where the money was received (cash, bank, wallet), for a payout or rent being confirmed. */
  account: string;
  reason: string;
}

export type LinkAnswerResult = { ok: boolean; message: string };

export async function answerLink(
  supabase: SupabaseClient,
  action: LinkAnswer,
  a: LinkAnswerArgs,
  locale: Locale,
): Promise<LinkAnswerResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const call = async (fn: string, args: Record<string, unknown>, label: string, ok: string): Promise<LinkAnswerResult> => {
    const { error } = await supabase.rpc(fn, args);
    if (error) {
      console.error(`${label} failed`, { error });
      return { ok: false, message: explain(locale, error) };
    }
    return { ok: true, message: ok };
  };

  switch (action) {
    case "confirm":
      return call(
        "ledger_link_confirm",
        { p_link: a.linkId, p_account: a.account || null },
        "confirmLink",
        t("أُكِّد القيد وسُجِّل في دفترك ودفتر شريكك.", "The entry was confirmed and booked in your book and your partner's."),
      );
    case "reject":
      return call(
        "ledger_link_reject",
        { p_link: a.linkId, p_reason: a.reason },
        "rejectLink",
        t("سُجّل اعتراضك وأُبلغ صاحب الاقتراح بسببه؛ ولم يُقيَّد شيء.", "Your objection was recorded and the proposer told why; nothing was booked."),
      );
    case "cancel":
      return call("ledger_link_cancel", { p_link: a.linkId }, "cancelLink", t("أُلغي اقتراحك.", "Your proposal was cancelled."));
    case "request_reversal": {
      const reason = parseReversalReason(a.reason);
      if (!reason) {
        return {
          ok: false,
          message: t("اكتب سبب الإلغاء (٣ أحرفٍ فأكثر): يراه شريكك.", "Write the reason for cancelling (3 characters or more): your partner sees it."),
        };
      }
      return call(
        "ledger_link_reversal_request",
        { p_link: a.linkId, p_reason: reason },
        "requestReversal",
        t(
          "أُرسل طلب الإلغاء إلى شريكك؛ لا يتغيّر شيء في أيّ دفتر حتى يوافق.",
          "The cancellation request was sent to your partner; nothing changes in any book until they agree.",
        ),
      );
    }
    case "accept_reversal":
      return call(
        "ledger_link_reversal_accept",
        { p_reversal: a.reversalId },
        "acceptReversal",
        t(
          "أُلغي القيد: عُكس في دفترك ودفتر شريكك، والقيدان الأصليّان باقيان في السجلّ.",
          "The entry was cancelled: reversed in your book and your partner's, and both original entries stay on record.",
        ),
      );
    case "reject_reversal": {
      const reason = parseReversalReason(a.reason);
      if (!reason) {
        return {
          ok: false,
          message: t("اكتب سبب الرفض (٣ أحرفٍ فأكثر): يراه صاحب الطلب.", "Write the reason for refusing (3 characters or more): the requester sees it."),
        };
      }
      return call(
        "ledger_link_reversal_reject",
        { p_reversal: a.reversalId, p_reason: reason },
        "rejectReversal",
        t("رُفض طلب الإلغاء وبقي القيدان كما هما.", "The cancellation request was refused and both entries stay as they are."),
      );
    }
    case "withdraw_reversal":
      return call("ledger_link_reversal_withdraw", { p_reversal: a.reversalId }, "withdrawReversal", t("سحبتَ طلب الإلغاء.", "You withdrew the cancellation request."));
  }
}
