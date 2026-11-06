import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { AGENT_SCOPE_SHORT, MANDATE_STATUS_LABEL, type AgentFarmerRow } from "@/lib/agent";
import { endMandateStep, requestMandateStep } from "@/lib/agentCore";
import { jsonFields } from "@/lib/supplyCore";
import { badRequest, noStore, readJson, stepJson } from "@/lib/appApi";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «مزارعيّ» في التطبيق (البند ٢٠٣), as /agent: the caller's organisation and whether it is verified and active, and —
 * once it is — the farmers who authorised it, the requests waiting, and what ended (agent_my_farmers: a farmer's name
 * and phone only while their permission stands). POST asks a farmer for permission, or ends one, through the same
 * steps as the website. Registering a farmer without a phone stays on the website: it opens an account with the
 * server's key (src/lib/supabase/admin.ts, caller 7), and the app's routes hold no such key.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;

  // Which company is this account's: the owner's id is not a column members read (backlog 181).
  const { data: own } = await supabase.rpc("partner_company_private");
  const mine = ((own ?? []) as { id: string; owner_id: string }[]).find((c) => c.owner_id === user.id);
  const { data: companyRow } = mine
    ? await supabase.from("partner_companies").select("id, name, verified_at, active").eq("id", mine.id).maybeSingle()
    : { data: null };
  const company = companyRow as { id: string; name: string; verified_at: string | null; active: boolean } | null;
  const ready = !!company?.verified_at && company.active;

  const { data: rows, error } = ready ? await supabase.rpc("agent_my_farmers") : { data: null, error: null };
  if (error) console.error("app agent: farmers failed", error.message);
  const farmers = ((rows ?? []) as AgentFarmerRow[]).map((m) => ({
    ...m,
    scopes_label: m.scopes.map((s) => AGENT_SCOPE_SHORT[s][0]).join(tr(locale, " و", ", ")),
    status_label: MANDATE_STATUS_LABEL[m.status][0],
    // A farmer without a phone, waiting for the administrators (their tail is the placeholder 0000).
    managed: m.phone_tail === "0000",
  }));
  return NextResponse.json({ company, ready, farmers }, noStore);
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const body = await readJson(req);
  if (!body) return badRequest(locale);
  const f = jsonFields(body);
  switch (f.str("action")) {
    case "request":
      return stepJson(await requestMandateStep(auth.supabase, f, locale));
    case "end":
      return stepJson(await endMandateStep(auth.supabase, f, locale));
    default:
      return badRequest(locale);
  }
}
