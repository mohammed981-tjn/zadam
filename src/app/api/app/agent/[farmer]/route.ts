import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { cropName, stageName } from "@/lib/farmLabelsEn";
import {
  AGENT_SCOPE_SHORT,
  agentActionLabel,
  type AgentActionSubject,
  type AgentActionVerb,
  type AgentFarmerRow,
  type AgentStageRow,
} from "@/lib/agent";
import { agentAddEvidenceStep, agentCompleteStageStep } from "@/lib/agentCore";
import { discardAppPhoto, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { jsonFields } from "@/lib/supplyCore";
import { UUID, badRequest, noStore, readJson, stepJson } from "@/lib/appApi";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

type SeasonRow = {
  id: string;
  name: string;
  crop_key: string;
  feddans: number;
  planting_date: string;
  status: string;
  stages_done: number;
  stages_total: number;
};
type HerdRow = { id: string; name: string; head_count: number; start_date: string; status: string; stages_done: number; stages_total: number };
type ActionRow = { id: number; subject: AgentActionSubject; subject_id: string; action: AgentActionVerb; at: string };

const verification = (locale: Locale): Record<string, string> => ({
  unverified: tr(locale, "لم تُرفع أوراقها", "Papers not uploaded"),
  submitted: tr(locale, "تنتظر المراجعة", "Awaiting review"),
  verified: tr(locale, "موثّقة", "Verified"),
  rejected: tr(locale, "رُدّت", "Returned"),
});

/**
 * A farmer the caller acts for, in the app (البند ٢٠٣), as /agent/[farmer]: only with a standing permission
 * (agent_my_farmers), and only what it covers — their land, their seasons with the stages of the active ones
 * (agent_farmer_stages), their herds — and what the caller wrote in their name. The database returns nothing without
 * the permission either. POST signs off a stage (agent_stage_complete) or records a photo as a stage's evidence
 * (agent_stage_evidence_add), each marked as the agent's, through the same steps as the website.
 */
export async function GET(req: Request, { params }: { params: Promise<{ farmer: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { farmer } = await params;
  if (!UUID.test(farmer)) return NextResponse.json({ error: tr(locale, "لا إذن قائماً لك عن هذا المزارع.", "You hold no standing permission for this farmer.") }, { status: 404 });

  const { data: rows } = await supabase.rpc("agent_my_farmers");
  const m = ((rows ?? []) as AgentFarmerRow[]).find((r) => r.status === "active" && r.farmer_id === farmer);
  if (!m) return NextResponse.json({ error: tr(locale, "لا إذن قائماً لك عن هذا المزارع.", "You hold no standing permission for this farmer.") }, { status: 404 });
  const can = (s: AgentFarmerRow["scopes"][number]) => m.scopes.includes(s);

  const [{ data: landRows }, { data: seasonRows }, { data: herdRows }, { data: actionRows }] = await Promise.all([
    can("lands")
      ? supabase.from("lands").select("id, name, state, locality, feddans, verification").eq("owner_id", farmer).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    can("seasons") ? supabase.rpc("agent_farmer_seasons", { p_farmer: farmer }) : Promise.resolve({ data: null }),
    can("herds") ? supabase.rpc("agent_farmer_herds", { p_farmer: farmer }) : Promise.resolve({ data: null }),
    supabase
      .from("agent_actions")
      .select("id, subject, subject_id, action, at")
      .eq("farmer_id", farmer)
      .eq("agent_id", user.id)
      .order("at", { ascending: false })
      .limit(30),
  ]);
  const lands = (landRows ?? []) as { id: string; name: string; state: string; locality: string | null; feddans: number; verification: string }[];
  const seasons = (seasonRows ?? []) as SeasonRow[];
  // مراحل المواسم الجارية وحدها: ما أُقفل لا يُكتب فيه.
  const stageLists = await Promise.all(
    seasons
      .filter((s) => s.status === "active")
      .map(async (s) => {
        const { data } = await supabase.rpc("agent_farmer_stages", { p_season: s.id });
        return [s.id, (data ?? []) as AgentStageRow[]] as const;
      }),
  );
  const stagesOf = new Map(stageLists);
  const landName = new Map(lands.map((l) => [l.id, l.name]));

  return NextResponse.json(
    {
      farmer: { id: farmer, full_name: m.full_name, phone: m.phone, scopes: m.scopes, scopes_label: m.scopes.map((s) => AGENT_SCOPE_SHORT[s][0]).join(tr(locale, " و", ", ")) },
      lands: lands.map((l) => ({ ...l, verification_label: verification(locale)[l.verification] ?? l.verification })),
      seasons: seasons.map((s) => ({
        ...s,
        crop_name: cropName(s.crop_key, locale),
        stages: (stagesOf.get(s.id) ?? []).map((g, i, all) => ({
          ...g,
          name: stageName(g.stage_key, locale),
          // A stage is signed off after every one before it, as the database requires.
          next: !g.completed && all.slice(0, i).every((p) => p.completed),
        })),
      })),
      herds: (herdRows ?? []) as HerdRow[],
      actions: ((actionRows ?? []) as ActionRow[]).map((a) => ({
        ...a,
        label: agentActionLabel(a.subject, a.action, "agent")[0] + (a.subject === "land" && landName.get(a.subject_id) ? ` «${landName.get(a.subject_id)}»` : ""),
      })),
    },
    noStore,
  );
}

const KINDS = ["photo", "invoice", "inspection"];

export async function POST(req: Request, { params }: { params: Promise<{ farmer: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { farmer } = await params;
  const body = await readJson(req);
  if (!body || !UUID.test(farmer)) return badRequest(locale);
  const f = jsonFields(body);
  const stageId = f.str("stage_id");
  if (!UUID.test(stageId)) return badRequest(locale);

  switch (f.str("action")) {
    case "complete":
      return stepJson(await agentCompleteStageStep(supabase, stageId, locale));
    case "evidence": {
      const kind = f.str("kind");
      if (!KINDS.includes(kind)) return NextResponse.json({ error: tr(locale, "نوع دليلٍ غير معروف.", "Unknown evidence type.") }, { status: 400 });
      // To the agent's own folder, as the website's upload (<id>/stages/…); the time and place it carried become
      // columns, and the file is stored without them.
      const photo = await uploadAppPhoto(supabase, user.id, "stages", body.photo);
      if ("error" in photo) return NextResponse.json({ error: photoError(locale, photo.error) }, { status: 400 });
      const r = await agentAddEvidenceStep(
        supabase,
        user.id,
        { stageId, kind, storagePath: photo.path, caption: f.str("caption").slice(0, 300), metadata: photo.metadata },
        locale,
      );
      if (!r.ok) await discardAppPhoto(supabase, photo.path);
      return stepJson(r);
    }
    default:
      return badRequest(locale);
  }
}
