"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { evidenceFileExists } from "@/lib/evidenceFile";

/*
 * صندوق الرسائل (البندان ١٣٧ و١٤٤). Every step is a database function that checks
 * the caller's place in the conversation (supabase/migrations/
 * 20261023040000_messages.sql); these only carry the form there and back.
 */

function backTo(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/messages", "layout");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/**
 * From a partnership request (on /lands or «طلباتي») or from its agreement:
 * open the request's one conversation, creating it the first time.
 */
export async function openPartnershipConversation(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const from = str(fd, "from") || "/messages";

  let interest = str(fd, "interest_id");
  const agreement = str(fd, "agreement_id");
  if (!interest && agreement) {
    // The parties read their agreement row (partnership_agreements_parties).
    const { data } = await supabase.from("partnership_agreements").select("interest_id").eq("id", agreement).maybeSingle();
    interest = (data as { interest_id?: string } | null)?.interest_id ?? "";
  }

  const { data, error } = await supabase.rpc("conversation_for_interest", { p_interest: interest });
  if (error || !data) backTo(from, "error", explain(locale, error));
  redirect(`/messages/${data}`);
}

/**
 * «راسل صاحب العرض» on the market board: the asker's one conversation with
 * whoever posted the offer (البند ١٤٤ — «المصدّرون يراسلون المزارع»).
 */
export async function openMarketConversation(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const { data, error } = await supabase.rpc("conversation_for_market", { p_offer: str(fd, "offer_id") });
  if (error || !data) backTo("/market/offers", "error", explain(locale, error));
  redirect(`/messages/${data}`);
}

/** «راسل سوداقري»: the member's one conversation with the administration. */
export async function openSupportConversation() {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const { data, error } = await supabase.rpc("conversation_for_support");
  if (error || !data) backTo("/messages", "error", explain(locale, error));
  redirect(`/messages/${data}`);
}

export async function sendMessage(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const id = str(fd, "conversation_id");
  const { error } = await supabase.rpc("conversation_send", { p_conv: id, p_body: String(fd.get("body") ?? "") });
  if (error) backTo(`/messages/${id}`, "error", explain(locale, error));
  revalidatePath(`/messages/${id}`);
  redirect(`/messages/${id}#end`);
}

export async function reportConversation(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "conversation_id");
  const { error } = await supabase.rpc("conversation_report", { p_conv: id, p_reason: str(fd, "reason") });
  if (error) backTo(`/messages/${id}`, "error", explain(locale, error));
  backTo(
    `/messages/${id}`,
    "ok",
    t("وصل بلاغك إلى الإدارة، وستراجع المحادثة.", "Your report has reached the administration, which will review the conversation."),
  );
}

/**
 * A photo or a document, once the upload widget has put it in the sender's own
 * folder (evidence bucket, <user id>/messages/). The file must be there, and
 * the database checks again that the path is the sender's.
 */
export async function attachToConversation(args: {
  conversationId: string;
  storagePath: string;
  caption: string;
  kind: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { supabase, user } = await signedIn();
  const { locale, t } = await translator();
  if (!args.storagePath.startsWith(`${user.id}/messages/`)) {
    return { ok: false, message: t("الملفّ في غير مكانه. ارفعه من جديد.", "The file is in the wrong place. Upload it again.") };
  }
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return { ok: false, message: t("لم نجد الملفّ المرفوع. ارفعه من جديد.", "We could not find the uploaded file. Upload it again.") };
  }
  // A file kept on the phone with no network is sent again if the reply to its first send was lost (backlog 185):
  // a message already in the thread with this file is that send, not a second one.
  const { data: thread } = await supabase.rpc("conversation_view", { p_conv: args.conversationId });
  const sent = (thread as { messages?: { attachment_path?: string | null }[] } | null)?.messages ?? [];
  if (sent.some((m) => m.attachment_path === args.storagePath)) return { ok: true };
  const { error } = await supabase.rpc("conversation_send", {
    p_conv: args.conversationId,
    p_body: args.caption ?? "",
    p_attachment_path: args.storagePath,
    p_attachment_kind: args.kind === "photo" ? "photo" : "document",
  });
  if (error) return { ok: false, message: explain(locale, error) };
  revalidatePath(`/messages/${args.conversationId}`);
  return { ok: true };
}

/** The administration has looked at a reported thread: it leaves the review list. */
export async function resolveReport(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "conversation_id");
  const { error } = await supabase.rpc("conversation_resolve_report", { p_conv: id });
  if (error) backTo(`/messages/${id}`, "error", explain(locale, error));
  backTo(`/messages/${id}`, "ok", t("أُغلق البلاغ، وأُبلغ صاحبه بأنّ الإدارة راجعته.", "The report is closed, and its author told it was reviewed."));
}
