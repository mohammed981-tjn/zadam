import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import {
  AGENT_SCOPE_LABEL,
  AGENT_SCOPE_SHORT,
  MANDATE_STATUS_LABEL,
  agentActionLabel,
  type AgentActionSubject,
  type AgentActionVerb,
  type MyAgentRow,
} from "@/lib/agent";
import { answerMandateStep, endMandateStep, objectAgentWriteStep } from "@/lib/agentCore";
import { jsonFields } from "@/lib/supplyCore";
import { badRequest, noStore, readJson, stepJson } from "@/lib/appApi";

type ActionRow = { id: number; mandate_id: string; subject: AgentActionSubject; subject_id: string; action: AgentActionVerb; at: string };

/**
 * «وكلائي» في التطبيق (البند ٢٠٣), as /account/agents: who asks to act for the caller and why, who acts for them now,
 * what ended, and every line an agent wrote in their name — with the season it touched, and the objection if they
 * made one. POST accepts or declines a request, ends a permission, or objects to what an agent wrote on a season
 * (agent_write_object: recorded, the agent told, the stage reopened when that breaks no order) — the website's
 * season page offers that objection on each stage and piece of evidence an agent wrote; here it is on the line.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const [{ data: rows, error }, { data: actionRows }] = await Promise.all([
    supabase.rpc("agent_my_agents"),
    supabase
      .from("agent_actions")
      .select("id, mandate_id, subject, subject_id, action, at")
      .eq("farmer_id", user.id)
      .order("at", { ascending: false })
      .limit(50),
  ]);
  if (error) console.error("app agent/mine: failed", error.message);
  const agents = (rows ?? []) as MyAgentRow[];
  const actions = (actionRows ?? []) as ActionRow[];
  const company = new Map(agents.map((m) => [m.id, m.company_name]));

  const landIds = [...new Set(actions.filter((a) => a.subject === "land").map((a) => a.subject_id))];
  const evidenceIds = actions.filter((a) => a.subject === "stage_evidence").map((a) => a.subject_id);
  const [{ data: landRows }, { data: evidenceRows }, { data: objectionRows }] = await Promise.all([
    landIds.length ? supabase.from("lands").select("id, name").in("id", landIds) : Promise.resolve({ data: [] }),
    evidenceIds.length ? supabase.from("stage_evidence").select("id, stage_id, caption").in("id", evidenceIds) : Promise.resolve({ data: [] }),
    actions.length
      ? supabase.from("agent_objections").select("action_id, reason, reopened").in("action_id", actions.map((a) => a.id))
      : Promise.resolve({ data: [] }),
  ]);
  const landName = new Map(((landRows ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  const evidence = new Map(((evidenceRows ?? []) as { id: string; stage_id: string; caption: string | null }[]).map((e) => [e.id, e]));
  const stageIds = [
    ...new Set([...actions.filter((a) => a.subject === "season_stage").map((a) => a.subject_id), ...[...evidence.values()].map((e) => e.stage_id)]),
  ];
  const { data: stageRows } = stageIds.length
    ? await supabase.from("season_stages").select("id, season_id").in("id", stageIds)
    : { data: [] };
  const seasonOfStage = new Map(((stageRows ?? []) as { id: string; season_id: string }[]).map((g) => [g.id, g.season_id]));
  const objection = new Map(((objectionRows ?? []) as { action_id: number; reason: string; reopened: boolean }[]).map((o) => [o.action_id, o]));

  const shape = (m: MyAgentRow) => ({
    ...m,
    scopes_label: m.scopes.map((s) => AGENT_SCOPE_SHORT[s][0]).join(" و"),
    scopes_long: m.scopes.map((s) => AGENT_SCOPE_LABEL[s][0]),
    status_label: MANDATE_STATUS_LABEL[m.status][0],
  });

  return NextResponse.json(
    {
      agents: agents.map(shape),
      actions: actions.map((a) => {
        const season =
          a.subject === "season_stage"
            ? seasonOfStage.get(a.subject_id)
            : a.subject === "stage_evidence"
              ? seasonOfStage.get(evidence.get(a.subject_id)?.stage_id ?? "")
              : undefined;
        const o = objection.get(a.id);
        const caption = a.subject === "stage_evidence" ? evidence.get(a.subject_id)?.caption : null;
        return {
          id: a.id,
          at: a.at,
          subject: a.subject,
          company: company.get(a.mandate_id) ?? null,
          label:
            agentActionLabel(a.subject, a.action, "farmer")[0] +
            (a.subject === "land" && landName.get(a.subject_id) ? ` «${landName.get(a.subject_id)}»` : "") +
            (caption ? ` «${caption}»` : ""),
          season_id: season ?? null,
          objection: o ? { reason: o.reason, reopened: o.reopened } : null,
          // What the website lets the farmer object to: a stage or a piece of evidence an agent wrote on a season.
          can_object: !o && (a.subject === "season_stage" || a.subject === "stage_evidence"),
        };
      }),
    },
    noStore,
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const body = await readJson(req);
  if (!body) return badRequest();
  const f = jsonFields(body);
  switch (f.str("action")) {
    case "answer":
      return stepJson(await answerMandateStep(auth.supabase, f, "ar"));
    case "end":
      return stepJson(await endMandateStep(auth.supabase, f, "ar"));
    case "object":
      return stepJson(await objectAgentWriteStep(auth.supabase, f, "ar"));
    default:
      return badRequest();
  }
}
