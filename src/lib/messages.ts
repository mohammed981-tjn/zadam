/**
 * صندوق الرسائل (البند ١٣٧): the shapes the database functions return
 * (supabase/migrations/20261023040000_messages.sql) and the words around them.
 */

export type ConversationRole = "investor" | "owner" | "manager" | "member" | "admin";
export type SenderRole = "investor" | "owner" | "manager" | "member" | "platform";

export interface ConversationRow {
  id: string;
  kind: "partnership" | "support";
  my_role: ConversationRole;
  title: string;
  last_message_at: string | null;
  last_body: string | null;
  unread: number;
  open: boolean;
  reported: boolean;
}

export interface ConversationMessage {
  id: string;
  role: SenderRole;
  mine: boolean;
  body: string;
  created_at: string;
}

export interface ConversationView {
  id: string;
  kind: "partnership" | "support";
  me: ConversationRole;
  title: string;
  status: "pending" | "accepted" | "declined" | "withdrawn" | null;
  request: { message: string; model: string; created_at: string } | null;
  agreement_id: string | null;
  open: boolean;
  reported: boolean;
  reports: { reason: string; created_at: string }[] | null;
  messages: ConversationMessage[];
}

/** Who wrote a message, by the part they play — never their name. */
export const SENDER_LABEL: Record<SenderRole, { ar: string; en: string }> = {
  investor: { ar: "المستثمر", en: "Investor" },
  owner: { ar: "صاحب الأرض", en: "Landowner" },
  manager: { ar: "الشركة المديرة", en: "Managing company" },
  member: { ar: "العضو", en: "Member" },
  platform: { ar: "سوداقري", en: "Sudagri" },
};

/** The owner's choice, 23 October: the administration reads every conversation. */
export const READ_NOTICE = {
  ar: "تقرأ إدارة سوداقري هذه المحادثة، ولا يُحذف منها شيء: هي سجلٌّ يُرجَع إليه عند الخلاف.",
  en: "Sudagri's administration reads this conversation, and nothing in it is deleted: it is a record to refer to in a dispute.",
};
