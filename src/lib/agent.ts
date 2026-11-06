/** وضع الوكيل (البند ١٦٩): ما يُطلب الإذن فيه، وحال الإذن، كما في `agent_mandates`. */
export const AGENT_SCOPES = ["lands", "seasons", "herds"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export type MandateStatus = "pending" | "active" | "declined" | "withdrawn" | "revoked";

export const AGENT_SCOPE_LABEL: Record<AgentScope, [string, string]> = {
  lands: ["الأراضي: يراها ويسجّل أرضاً ويعدّلها ويرفع مستنداتها", "Land: sees it, registers and edits a land, uploads its papers"],
  seasons: [
    "المواسم: يراها ويعتمد مراحلها ويرفع أدلّتها، معلَّمةً باسمه، وتعترض على ما كتبه",
    "Seasons: sees them, signs off their stages and uploads their evidence, marked as theirs, and you can object to what they wrote",
  ],
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

/** A line of `agent_actions`: what an agent wrote in a farmer's name. */
export type AgentActionSubject = "land" | "land_document" | "season_stage" | "stage_evidence";
export type AgentActionVerb = "insert" | "update" | "complete";

/**
 * What the line says, as [ar, en]: to the farmer the agent is «it» (registered a land), to the agent it is «you»
 * (you registered a land).
 */
export function agentActionLabel(subject: AgentActionSubject, action: AgentActionVerb, reader: "farmer" | "agent"): [string, string] {
  const you = reader === "agent";
  switch (subject) {
    case "land":
      return action === "insert"
        ? [you ? "سجّلت أرضاً" : "سجّل أرضاً", you ? "Registered a land" : "registered a land"]
        : [you ? "عدّلت أرضاً" : "عدّل أرضاً", you ? "Edited a land" : "edited a land"];
    case "land_document":
      return [you ? "رفعت مستنداً لأرض" : "رفع مستنداً لأرض", you ? "Uploaded a land document" : "uploaded a land document"];
    case "season_stage":
      return [you ? "اعتمدت مرحلةً من موسم" : "اعتمد مرحلةً من موسم", you ? "Signed off a season stage" : "signed off a season stage"];
    case "stage_evidence":
      return [you ? "رفعت دليلاً على مرحلة" : "رفع دليلاً على مرحلة", you ? "Uploaded evidence for a stage" : "uploaded evidence for a stage"];
  }
}

/** A row of `agent_farmer_stages(season)`: a stage of a farmer's season, as the agent sees it. */
export interface AgentStageRow {
  id: string;
  stage_key: string;
  stage_order: number;
  planned_start: string;
  planned_end: string;
  completed: boolean;
  completed_at: string | null;
  by_agent: boolean;
  evidence_count: number;
  /** The farmer objected to an agent's sign-off of this stage: only the farmer signs it off now. */
  objected: boolean;
}
