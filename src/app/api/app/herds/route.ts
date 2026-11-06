import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { PURPOSE_LABEL, SPECIES, SPECIES_LABEL } from "@/lib/livestock";
import { countryName, diseaseName, fetchDiseaseEvents, groupEvents, sourceNote, watchPlaces, EMPRES_URL } from "@/lib/animalDisease";
import { locustDay } from "@/lib/locust";
import { createHerdWithPlan } from "@/lib/herdSteps";
import type { Herd } from "@/types/database";

const SESSION_OVER = { error: "انتهت جلستك. ادخل من جديد." };

/**
 * «القطعان» in the app (backlog 203): what the website's /herds shows — the person's production cycles, and the
 * livestock diseases FAO's EMPRES-i holds for Sudan and its neighbours, with their own states first — and the new
 * cycle form's choices.
 *
 * Read as the signed-in person, through row-level security, with no elevated key. The herds are filtered to the
 * caller's own: an agent the farmer authorised reads that farmer's herds too (backlog 169), and those are not «my
 * herds». The caller's lands are read only to say which state each is in and how far the nearest event is; their
 * place is not sent.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const { supabase, user } = auth;

  const [{ data: herdRows, error }, { data: landRows }, events] = await Promise.all([
    supabase.from("herds").select("*").eq("owner_id", user.id).order("start_date", { ascending: false }),
    supabase.from("lands").select("name, state, latitude, longitude").eq("owner_id", user.id),
    fetchDiseaseEvents(),
  ]);
  if (error) return NextResponse.json({ error: "تعذّر تحميل قطعانك. أعد المحاولة." }, { status: 500 });
  const herds = (herdRows ?? []) as Herd[];

  const ids = herds.map((h) => h.id);
  const { data: stageRows } = ids.length
    ? await supabase.from("herd_stages").select("herd_id, completed").in("herd_id", ids)
    : { data: [] };
  const stages = (stageRows ?? []) as { herd_id: string; completed: boolean }[];

  const lands = (landRows ?? []) as { name: string; state: string; latitude: number | null; longitude: number | null }[];
  const km = (v: number) => Math.round(v).toLocaleString("en-US");

  let diseases = null;
  if (events !== null) {
    const watch = watchPlaces(lands, events);
    diseases = {
      alerts: watch
        .filter((w) => w.inState.length > 0)
        .map((w) => ({
          land: w.land,
          state: w.state,
          diseases: w.inState.map((e) => `${diseaseName(e.disease, "ar")} (${locustDay(e.date, "ar")})`),
        })),
      nearest: watch
        .filter((w) => w.nearest)
        .map(
          (w) =>
            `«${w.land}»: أقرب حدثٍ مُبلَّغ عنه ${diseaseName(w.nearest!.disease, "ar")} على بعد ${km(w.nearest!.km)} كم، في ${countryName(w.nearest!.country, "ar")} (${locustDay(w.nearest!.date, "ar")}).`,
        ),
      groups: groupEvents(events).map((g) => ({
        country: countryName(g.country, "ar"),
        states: g.states,
        disease: diseaseName(g.disease, "ar"),
        count: g.count,
        latest: locustDay(g.lastDate, "ar"),
      })),
      sudan_events: events.some((e) => e.country === "Sudan"),
      has_lands: lands.length > 0,
      source: sourceNote("ar"),
      source_url: EMPRES_URL,
    };
  }

  return NextResponse.json(
    {
      herds: herds.map((h) => ({
        id: h.id,
        name: h.name,
        species: h.species,
        species_label: SPECIES_LABEL[h.species] ?? h.species,
        purpose_label: PURPOSE_LABEL[h.purpose] ?? h.purpose,
        breed: h.breed,
        head_count: h.head_count,
        start_date: h.start_date,
        end_date: h.end_date,
        status: h.status,
        stages_done: stages.filter((s) => s.herd_id === h.id && s.completed).length,
        stages_total: stages.filter((s) => s.herd_id === h.id).length,
      })),
      // Null when FAO could not be reached just now: the screen says so rather than «nothing reported».
      diseases,
      species: SPECIES.map((s) => ({
        key: s.key,
        label: SPECIES_LABEL[s.key],
        purposes: s.purposes.map((p) => ({ key: p, label: PURPOSE_LABEL[p] })),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * A new production cycle, with its stages, through the website's own `createHerd` step (src/lib/herdSteps.ts):
 * {name, species, purpose, head_count, start_date, budget_per_head?, breed?}.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const result = await createHerdWithPlan(
    supabase,
    user.id,
    {
      name: text("name").slice(0, 120),
      species: text("species"),
      purpose: text("purpose"),
      headCount: Number(body.head_count),
      startDate: text("start_date"),
      // Left blank on the website's form it reads as zero: the same here.
      budgetPerHead: body.budget_per_head === undefined || body.budget_per_head === null || body.budget_per_head === "" ? 0 : Number(body.budget_per_head),
      breed: text("breed").slice(0, 80),
      projectId: "",
    },
    "ar",
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ id: result.id, message: "أُنشئت الدورة ومراحلها." });
}
