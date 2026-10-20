import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDiseaseEvents } from "@/lib/animalDisease";
import { fetchLocustSightings } from "@/lib/locust";
import { diseaseAlerts, locustAlerts, type AlertLand } from "@/lib/fieldAlerts";

// Temporary dry run of the field-alert read path: counts only, writes nothing. Removed before merge.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ admin: false });
  const { data, error } = await supabase.from("lands").select("id, owner_id, name, state, latitude, longitude").not("owner_id", "is", null);
  if (error) return NextResponse.json({ landsError: error.message });
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const lands: AlertLand[] = (data ?? []).map((r) => ({ id: r.id, ownerId: r.owner_id, name: r.name, state: r.state, latitude: num(r.latitude), longitude: num(r.longitude) }));
  const t0 = Date.now();
  const [s, e] = await Promise.all([fetchLocustSightings(true), fetchDiseaseEvents(true)]);
  const sent = await supabase.from("field_alerts_sent").select("alert_key", { count: "exact", head: true });
  const today = new Date().toISOString().slice(0, 10);
  const la = s ? locustAlerts(lands, s, new Set()) : null;
  const da = e ? diseaseAlerts(lands, e, new Set(), today) : null;
  return NextResponse.json({
    ms: Date.now() - t0,
    lands: lands.length,
    located: lands.filter((l) => l.latitude !== null).length,
    states: [...new Set(lands.map((l) => l.state))],
    sightings: s?.length ?? null,
    events: e?.length ?? null,
    sudanEventStates: e ? [...new Set(e.filter((x) => x.country === "Sudan").map((x) => x.state))] : null,
    sentReadable: !sent.error,
    due: { locust: la?.map((a) => a.keys.length) ?? null, disease: da?.map((a) => a.keys.length) ?? null },
  });
}
