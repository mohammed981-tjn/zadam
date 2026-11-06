/**
 * القراءات خلف «الرئيسيّة بحسب الدور» (البند ٢٠٦).
 *
 * Every read is made as the signed-in person, with the client the caller passes — the website's session client on
 * `/`, the app's bearer client on `GET /api/app/home` — so row-level security decides what comes back, exactly as it
 * does on the pages each card links to. The queries are those pages' own (named beside each), narrowed to what a
 * card needs: counts with `head: true` where a number is all that is shown, a few columns elsewhere. Nothing here
 * writes, and nothing holds the server's key.
 *
 * Two rounds, each in parallel: what the person holds (profile, lands, seasons, agreements, shop, company, …), then
 * what can only be asked once that is known (the stages' spending and evidence, the requests on verified land, the
 * signatures, the shop's orders, the company's farmers). A read that fails — a table a migration has not reached, a
 * function not yet deployed — reads as nothing, as on those pages, and the other cards still show.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminPendingTotal } from "./adminQueue";
import { ledgerToday } from "./ledger/today";
import { loadLinks } from "./ledgerLinksLoad";
import {
  FIRED_ALERT_DAYS,
  MAX_SEASON_CARDS,
  RECENT_DAYS,
  emptyRaw,
  nextOpenStage,
  roleHome,
  type HomeRaw,
  type HomeView,
  type RawAgreement,
  type RawSeason,
  type RawStage,
} from "./roleHome";

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const rows = <T>(r: { data: unknown }): T[] => (Array.isArray(r.data) ? (r.data as T[]) : []);

export async function loadRoleHome(supabase: SupabaseClient, userId: string): Promise<HomeView> {
  const raw = await loadRoleHomeRaw(supabase, userId);
  return roleHome(raw);
}

/**
 * Open credit rows by running season: farm_open_credit_by_season (20261106100000), farm_credit_status's own rule over
 * all of them. On a database the migration has not reached yet, the old way, season by season, for those listed.
 */
async function openCredit(supabase: SupabaseClient, seasons: RawSeason[]): Promise<(readonly [string, number])[]> {
  const { data, error } = await supabase.rpc("farm_open_credit_by_season");
  if (!error) return rows<{ season_id: string; open_rows: number }>({ data }).map((r) => [r.season_id, Number(r.open_rows)] as const);
  if (error.code !== "PGRST202" && error.code !== "42883") return [];
  return Promise.all(
    seasons.slice(0, MAX_SEASON_CARDS + 2).map(async (s) => {
      const r = await supabase.rpc("farm_credit_status", { p_season: s.id });
      return [s.id, rows<{ settled_on: string | null }>(r).filter((c) => !c.settled_on).length] as const;
    }),
  );
}

export async function loadRoleHomeRaw(supabase: SupabaseClient, userId: string): Promise<HomeRaw> {
  const [
    profile,
    lands,
    seasons,
    interests,
    inspections,
    agreements,
    companyPriv,
    supplierPriv,
    carrier,
    deliveries,
    fired,
    fieldNotes,
    myAgents,
    links,
    investments,
    openLands,
    seasonCount,
  ] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
    // /lands: the caller's own only (an agent or an administrator reads others' too).
    supabase.from("lands").select("id, name, verification").eq("owner_id", userId).order("created_at", { ascending: false }),
    // /seasons: own and running, with the stages, as the daily stage reminders read them.
    supabase
      .from("seasons")
      .select("id, name, crop_key, season_stages(id, stage_key, stage_order, planned_start, budget, completed)")
      .eq("owner_id", userId)
      .eq("status", "active")
      .order("planting_date", { ascending: false })
      .limit(MAX_SEASON_CARDS + 7),
    // /invest/mine
    supabase.rpc("investor_my_interests"),
    // /invest/mine and /lands: the inspections the caller is a party to, with their role in each.
    supabase.rpc("land_inspection_list"),
    // «عقودي» in the app (/api/app/contracts): the agreements the caller is a party to.
    supabase
      .from("partnership_agreements")
      .select("id, model, status, version, owner_id, investor_id, manager_company_id")
      .order("updated_at", { ascending: false })
      .limit(100),
    // /agent and /partners/mine: which company is this account's (members do not read owner_id, backlog 181).
    supabase.rpc("partner_company_private"),
    // /suppliers/mine
    supabase.rpc("supplier_private"),
    // /suppliers/deliveries
    supabase.from("carriers").select("id, name, verified_at").eq("owner_id", userId).maybeSingle(),
    supabase.from("deliveries").select("id, recipient_id, carrier_id, status").eq("status", "assigned").limit(200),
    // /market/alerts: the caller's alerts that fired lately (the policy keeps each person's own).
    supabase
      .from("price_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "fired")
      .gte("settled_at", since(FIRED_ALERT_DAYS)),
    // /notifications: what the daily field-alerts job wrote and the person has not read.
    supabase
      .from("notifications")
      .select("title, link", { count: "exact" })
      .in("kind", ["locust_near", "animal_disease"])
      .is("read_at", null)
      .gte("created_at", since(RECENT_DAYS))
      .order("created_at", { ascending: false })
      .limit(3),
    // «وكلائي» (/account/agents)
    supabase.rpc("agent_my_agents"),
    // /books: the entries proposed across the two books, with their cancellation requests.
    loadLinks(supabase),
    // /dashboard
    supabase.from("investments").select("status, amount, shares, project_id").eq("investor_id", userId),
    // /invest: the offered land, each with whether it is the caller's own and the caller's request on it.
    supabase.rpc("investor_open_lands"),
    // /seasons: how many are running, counted — the list above stops at a few (backlog 209).
    supabase.from("seasons").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("status", "active"),
  ]);

  const me = profile.data as { role?: string; full_name?: string | null } | null;
  const raw = emptyRaw(userId, me?.role ?? null, ledgerToday());
  raw.name = me?.full_name ?? "";

  raw.lands = rows<HomeRaw["lands"][number]>(lands);
  raw.seasons = rows<{ id: string; name: string; crop_key: string; season_stages: RawStage[] | null }>(seasons).map(
    (s): RawSeason => ({ id: s.id, name: s.name, crop_key: s.crop_key, stages: s.season_stages ?? [] }),
  );
  raw.seasonCount = seasonCount.error ? null : (seasonCount.count ?? null);
  raw.interests = rows<HomeRaw["interests"][number]>(interests);
  raw.inspections = rows<HomeRaw["inspections"][number]>(inspections);
  raw.agreements = rows<RawAgreement>(agreements);
  raw.links = links;
  raw.investments = rows<HomeRaw["investments"][number]>(investments);
  raw.openLands = rows<{ mine: boolean; interest_status: string | null; models: string[] | null; state: string }>(openLands).map(
    (o) => ({ mine: Boolean(o.mine), interest_status: o.interest_status, models: o.models ?? [], state: o.state }),
  );
  raw.firedAlerts = fired.error ? 0 : (fired.count ?? 0);
  raw.fieldAlerts = rows<{ title: string; link: string | null }>(fieldNotes);
  raw.fieldAlertCount = fieldNotes.error ? 0 : (fieldNotes.count ?? raw.fieldAlerts.length);
  raw.agentRequests = rows<{ status: string }>(myAgents).filter((m) => m.status === "pending").length;

  const company = rows<{ id: string; owner_id: string }>(companyPriv).find((c) => c.owner_id === userId) ?? null;
  raw.companyIds = rows<{ id: string; owner_id: string }>(companyPriv)
    .filter((c) => c.owner_id === userId)
    .map((c) => c.id);
  const supplier = rows<{ id: string; owner_id: string }>(supplierPriv).find((s) => s.owner_id === userId) ?? null;
  const carrierRow = carrier.data as { id: string; name: string; verified_at: string | null } | null;
  raw.carrier = carrierRow ? { id: carrierRow.id, name: carrierRow.name, verified: Boolean(carrierRow.verified_at) } : null;
  const assigned = rows<{ recipient_id: string; carrier_id: string; status: string }>(deliveries);
  raw.deliveriesToMe = assigned.filter((d) => d.recipient_id === userId).length;
  raw.carrierDeliveries = carrierRow ? assigned.filter((d) => d.carrier_id === carrierRow.id).length : 0;

  // ── The second round ──
  const next = raw.seasons.map((s) => nextOpenStage(s.stages)).filter((s): s is RawStage => s !== null);
  const nextIds = next.map((s) => s.id);
  const landIds = raw.lands.map((l) => l.id);
  const verified = raw.lands.some((l) => l.verification === "verified");
  const drafts = raw.agreements.filter((a) => a.status === "draft").map((a) => a.id);
  const role = raw.role;
  const none = Promise.resolve({ data: null, error: null, count: null });

  const [spent, evidence, credit, landRequests, companyRequests, signatures, supplierRow, orders, companyRow, farmers, objections, admin] =
    await Promise.all([
      // The page of the season: what was spent on each stage (revenue is not spending).
      nextIds.length
        ? supabase.from("ledger_entries").select("stage_id, amount").in("stage_id", nextIds).neq("category", "revenue")
        : none,
      nextIds.length ? supabase.from("stage_evidence").select("stage_id").in("stage_id", nextIds) : none,
      // The page of the season: rows kept on credit and not yet settled — in every running season, counted by the
      // database in one read (backlog 209; it was the first five seasons only).
      openCredit(supabase, raw.seasons),
      // /lands asks for the investors' requests only once a land is verified.
      verified ? supabase.rpc("land_investor_requests") : none,
      landIds.length
        ? supabase.from("partner_interests").select("id", { count: "exact", head: true }).eq("status", "pending").in("land_id", landIds)
        : none,
      drafts.length
        ? supabase.from("partnership_signatures").select("agreement_id, version, role").in("agreement_id", drafts)
        : none,
      supplier ? supabase.from("suppliers").select("id, name, verified_at").eq("id", supplier.id).maybeSingle() : none,
      // /suppliers/orders
      supplier ? supabase.rpc("group_order_directory") : none,
      company ? supabase.from("partner_companies").select("id, name, verified_at, active").eq("id", company.id).maybeSingle() : none,
      company ? supabase.rpc("agent_my_farmers") : none,
      company
        ? supabase
            .from("agent_objections")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", userId)
            .gte("at", since(RECENT_DAYS))
        : none,
      role === "admin" ? adminState(supabase) : Promise.resolve(null),
    ]);

  for (const r of rows<{ stage_id: string; amount: number | string }>(spent)) {
    raw.spentByStage[r.stage_id] = (raw.spentByStage[r.stage_id] ?? 0) + Number(r.amount);
  }
  for (const r of rows<{ stage_id: string }>(evidence)) {
    raw.evidenceByStage[r.stage_id] = (raw.evidenceByStage[r.stage_id] ?? 0) + 1;
  }
  raw.openCreditBySeason = Object.fromEntries(credit);
  raw.landRequests = rows<{ status: string }>(landRequests).filter((r) => r.status === "pending").length;
  raw.companyRequests = companyRequests.error ? 0 : (companyRequests.count ?? 0);
  raw.signatures = rows<HomeRaw["signatures"][number]>(signatures);

  const s = supplierRow.data as { id: string; name: string; verified_at: string | null } | null;
  raw.supplier = s ? { id: s.id, name: s.name, verified: Boolean(s.verified_at) } : null;
  raw.supplierOrders = s
    ? rows<{ id: string; supplier_id: string; status: string }>(orders)
        .filter((o) => o.supplier_id === s.id)
        .map((o) => ({ id: o.id, status: o.status }))
    : [];

  const c = companyRow.data as { id: string; name: string; verified_at: string | null; active: boolean } | null;
  raw.company = c ? { id: c.id, name: c.name, ready: Boolean(c.verified_at) && c.active } : null;
  // /agent asks for its farmers only once the company may act; before that the function refuses.
  raw.agentFarmers = raw.company?.ready ? rows<{ status: string }>(farmers) : [];
  raw.agentObjections = objections.error ? 0 : (objections.count ?? 0);
  raw.admin = admin;
  return raw;
}

/**
 * As «حسابي» in the app reads it (/api/app/me): with the administrators' second factor applied (20261026040000) the
 * database counts an administrator as one only in a session that passed it, so the list would read back empty and
 * say nothing waits. Then the card says where to go instead. The count is /admin/inbox's (lib/adminQueue).
 */
async function adminState(supabase: SupabaseClient): Promise<HomeRaw["admin"]> {
  const { data, error } = await supabase.rpc("is_admin");
  if (!error && data === false) return { total: null, secondFactor: true };
  return { total: await adminPendingTotal(supabase), secondFactor: false };
}
