import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ما كتبه وكيلٌ على موسم المزارع (20261106050000): لكلّ مرحلةٍ اعتمدها وكيل ولكلّ دليلٍ رفعه، سطرُه في السجلّ (به
 * يعترض المزارع)، واسم الشركة، والاعتراض إن كان. يُقرأ بجلسة القارئ: السجلّ والاعتراضات لصاحب الموسم ووكيله والإدارة.
 */
export interface AgentMark {
  actionId: number | null;
  company: string | null;
  objection: { reason: string; reopened: boolean; at: string } | null;
}

type ActionRow = { id: number; mandate_id: string; subject: string; subject_id: string; at: string };
type ObjectionRow = { action_id: number; reason: string; reopened: boolean; at: string };

export async function loadAgentMarks(
  supabase: SupabaseClient,
  stages: { id: string; completed_by_mandate?: string | null }[],
  evidence: { id: string; by_mandate?: string | null }[],
): Promise<{ stage: (id: string) => AgentMark | null; evidence: (id: string) => AgentMark | null }> {
  const markedStages = stages.filter((s) => s.completed_by_mandate);
  const markedEvidence = evidence.filter((e) => e.by_mandate);
  const none = { stage: () => null, evidence: () => null };
  if (markedStages.length + markedEvidence.length === 0) return none;

  const ids = [...markedStages.map((s) => s.id), ...markedEvidence.map((e) => e.id)];
  const [{ data: actionRows }, { data: agents }] = await Promise.all([
    supabase
      .from("agent_actions")
      .select("id, mandate_id, subject, subject_id, at")
      .in("subject", ["season_stage", "stage_evidence"])
      .in("subject_id", ids)
      .order("at", { ascending: false }),
    supabase.rpc("agent_my_agents"),
  ]);
  const actions = (actionRows ?? []) as ActionRow[];
  const { data: objectionRows } = actions.length
    ? await supabase.from("agent_objections").select("action_id, reason, reopened, at").in("action_id", actions.map((a) => a.id))
    : { data: [] };
  const company = new Map(((agents ?? []) as { id: string; company_name: string }[]).map((m) => [m.id, m.company_name]));
  const objection = new Map(((objectionRows ?? []) as ObjectionRow[]).map((o) => [o.action_id, o]));

  // The newest line for a subject is the one that wrote what is there now (actions come newest first).
  const lineFor = (subject: string, id: string) => actions.find((a) => a.subject === subject && a.subject_id === id);
  const mark = (mandate: string, line: ActionRow | undefined): AgentMark => {
    const o = line ? objection.get(line.id) : undefined;
    return {
      actionId: line?.id ?? null,
      company: company.get(mandate) ?? null,
      objection: o ? { reason: o.reason, reopened: o.reopened, at: o.at } : null,
    };
  };
  const stageMarks = new Map(markedStages.map((s) => [s.id, mark(s.completed_by_mandate!, lineFor("season_stage", s.id))]));
  const evidenceMarks = new Map(markedEvidence.map((e) => [e.id, mark(e.by_mandate!, lineFor("stage_evidence", e.id))]));
  return { stage: (id) => stageMarks.get(id) ?? null, evidence: (id) => evidenceMarks.get(id) ?? null };
}
