/** وضع الوكيل (البند ١٦٩): ما يُطلب الإذن فيه، وحال الإذن، كما في `agent_mandates`. */
export const AGENT_SCOPES = ["lands", "seasons", "herds"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export type MandateStatus = "pending" | "active" | "declined" | "withdrawn" | "revoked";

export const AGENT_SCOPE_LABEL: Record<AgentScope, [string, string]> = {
  lands: ["الأراضي: يراها ويسجّل أرضاً ويعدّلها ويرفع مستنداتها", "Land: sees it, registers and edits a land, uploads its papers"],
  seasons: ["المواسم: يراها ويتابع مراحلها", "Seasons: sees them and follows their stages"],
  herds: ["القطيع: يراه ويتابع مراحله", "Herds: sees them and follows their stages"],
};

export const AGENT_SCOPE_SHORT: Record<AgentScope, [string, string]> = {
  lands: ["الأراضي", "land"],
  seasons: ["المواسم", "seasons"],
  herds: ["القطيع", "herds"],
};

export const MANDATE_STATUS_LABEL: Record<MandateStatus, [string, string]> = {
  pending: ["ينتظر جواب المزارع", "Awaiting the farmer's answer"],
  active: ["قائم", "Active"],
  declined: ["اعتذر المزارع", "Declined by the farmer"],
  withdrawn: ["سُحب قبل الجواب", "Withdrawn before an answer"],
  revoked: ["انتهى", "Ended"],
};

/** A row of `agent_my_farmers()`: the farmer's name and phone are null until they accept, and again once it ends. */
export interface AgentFarmerRow {
  id: string;
  farmer_id: string | null;
  full_name: string | null;
  phone: string | null;
  phone_tail: string;
  scopes: AgentScope[];
  status: MandateStatus;
  note: string;
  requested_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

/** A row of `agent_my_agents()`. */
export interface MyAgentRow {
  id: string;
  company_name: string;
  company_phone: string;
  scopes: AgentScope[];
  status: MandateStatus;
  note: string;
  requested_at: string;
  answered_at: string | null;
  ended_at: string | null;
}
