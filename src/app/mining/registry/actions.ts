"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  assessProvenance,
  type CustodyEvent,
  type CustodyRole,
  type ExtractionMethod,
  type SiteFacts,
} from "@/lib/provenance";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));
const bool = (fd: FormData, k: string) => fd.get(k) === "on";
const optNum = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

export interface RegistryResult {
  ok: boolean;
  message: string;
}

const METHODS: ExtractionMethod[] = [
  "gravity",
  "borax",
  "mercury",
  "cyanide",
  "unknown",
];
const ROLES: CustodyRole[] = [
  "miner",
  "processor",
  "transporter",
  "aggregator",
  "assayer",
  "store",
];

/**
 * Recomputes and stores a lot's provenance figures.
 *
 * Always run server-side after any change to the chain. The database refuses a
 * score written by the holder, so this is the only path by which one is set.
 */
async function rescore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotId: string,
) {
  const { data: lot } = await supabase
    .from("gold_lots")
    .select("*, mine_sites(*)")
    .eq("id", lotId)
    .single();

  if (!lot) return;

  const row = lot as {
    method: ExtractionMethod;
    mine_sites: {
      licensed: boolean;
      latitude: number | null;
      longitude: number | null;
      armed_presence: boolean;
      child_labour: boolean;
      site_visited: boolean;
    } | null;
  };

  const site = row.mine_sites;
  const facts: SiteFacts = {
    licensed: site?.licensed ?? false,
    hasCoordinates: site?.latitude != null && site?.longitude != null,
    armedPresence: site?.armed_presence ?? false,
    childLabour: site?.child_labour ?? false,
    siteVisited: site?.site_visited ?? false,
  };

  const { data: eventRows } = await supabase
    .from("custody_events")
    .select("*")
    .eq("lot_id", lotId)
    .order("sequence");

  const events = (eventRows ?? []) as {
    id: string;
    sequence: number;
    from_party: string;
    to_party: string;
    role: CustodyRole;
    occurred_at: string;
    weight_grams: number;
    fineness: number;
  }[];

  const { data: evidenceRows } = await supabase
    .from("custody_evidence")
    .select("event_id")
    .in("event_id", events.length ? events.map((e) => e.id) : ["0"]);

  const evidence = (evidenceRows ?? []) as { event_id: string }[];

  const custody: CustodyEvent[] = events.map((e) => ({
    sequence: e.sequence,
    fromParty: e.from_party,
    toParty: e.to_party,
    role: e.role,
    occurredAt: e.occurred_at,
    weightGrams: Number(e.weight_grams),
    fineness: Number(e.fineness),
    evidenceCount: evidence.filter((v) => v.event_id === e.id).length,
  }));

  const result = assessProvenance(facts, row.method, custody);

  await supabase
    .from("gold_lots")
    .update({
      provenance_score: result.score,
      chain_intact: result.chainIntact,
    })
    .eq("id", lotId);
}

export async function registerSite(
  _prev: RegistryResult | null,
  formData: FormData,
): Promise<RegistryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  const state = str(formData, "state");
  if (!name || !state) {
    return { ok: false, message: "اسم الموقع والولاية مطلوبان." };
  }

  const { error } = await supabase.from("mine_sites").insert({
    owner_id: user.id,
    name,
    state,
    locality: str(formData, "locality") || null,
    latitude: optNum(formData, "latitude"),
    longitude: optNum(formData, "longitude"),
    licence_number: str(formData, "licence_number") || null,
    licensed: bool(formData, "licensed"),
    armed_presence: bool(formData, "armed_presence"),
    child_labour: bool(formData, "child_labour"),
    site_visited: bool(formData, "site_visited"),
  });

  if (error) {
    return { ok: false, message: `تعذّر تسجيل الموقع: ${error.message}` };
  }

  revalidatePath("/mining/registry");
  return { ok: true, message: "سُجّل الموقع. يمكنك الآن تسجيل شحنة منه." };
}

export async function registerLot(
  _prev: RegistryResult | null,
  formData: FormData,
): Promise<RegistryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reference = str(formData, "reference");
  const siteId = str(formData, "site_id");
  const method = str(formData, "method") as ExtractionMethod;
  const weight = num(formData, "initial_weight_grams");
  const fineness = num(formData, "initial_fineness");

  if (!reference) return { ok: false, message: "رقم الشحنة مطلوب." };
  if (!siteId) return { ok: false, message: "اختر موقع الاستخراج." };
  if (!METHODS.includes(method)) {
    return { ok: false, message: "طريقة استخلاص غير معروفة." };
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    return { ok: false, message: "أدخل وزناً صحيحاً بالجرام." };
  }
  if (!Number.isFinite(fineness) || fineness <= 0 || fineness > 1) {
    return { ok: false, message: "العيار يُدخل كنسبة بين 0 و1 — مثال 0.85." };
  }

  const { data, error } = await supabase
    .from("gold_lots")
    .insert({
      owner_id: user.id,
      site_id: siteId,
      reference,
      extracted_on: str(formData, "extracted_on"),
      method,
      initial_weight_grams: weight,
      initial_fineness: fineness,
      note: str(formData, "note") || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: `تعذّر تسجيل الشحنة: ${error?.message}` };
  }

  await rescore(supabase, (data as { id: string }).id);
  revalidatePath("/mining/registry");
  return {
    ok: true,
    message: "سُجّلت الشحنة. أضف حلقات الحيازة لتكتمل سلسلتها.",
  };
}

/** Appends a custody hop. Existing hops are immutable by database trigger. */
export async function addCustodyEvent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const lotId = str(formData, "lot_id");
  const role = str(formData, "role") as CustodyRole;
  const weight = num(formData, "weight_grams");
  const fineness = num(formData, "fineness");

  if (!lotId || !ROLES.includes(role)) return;
  if (!Number.isFinite(weight) || weight <= 0) return;
  if (!Number.isFinite(fineness) || fineness <= 0 || fineness > 1) return;

  const { data: last } = await supabase
    .from("custody_events")
    .select("sequence")
    .eq("lot_id", lotId)
    .order("sequence", { ascending: false })
    .limit(1);

  const nextSequence =
    ((last as { sequence: number }[] | null)?.[0]?.sequence ?? 0) + 1;

  const { error } = await supabase.from("custody_events").insert({
    lot_id: lotId,
    sequence: nextSequence,
    from_party: str(formData, "from_party"),
    to_party: str(formData, "to_party"),
    role,
    occurred_at: str(formData, "occurred_at"),
    weight_grams: weight,
    fineness,
    location: str(formData, "location") || null,
  });

  if (error) {
    redirect(
      `/mining/registry/${lotId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  await rescore(supabase, lotId);
  revalidatePath(`/mining/registry/${lotId}`);
}

export async function addCustodyEvidence(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = str(formData, "event_id");
  const lotId = str(formData, "lot_id");
  const kind = str(formData, "kind");
  const caption = str(formData, "caption");

  if (!eventId || !caption) return;
  if (!["photo", "assay", "receipt", "permit", "inspection"].includes(kind)) {
    return;
  }

  await supabase.from("custody_evidence").insert({
    event_id: eventId,
    kind,
    caption,
    url: str(formData, "url") || null,
    created_by: user.id,
  });

  if (lotId) {
    await rescore(supabase, lotId);
    revalidatePath(`/mining/registry/${lotId}`);
  }
}
