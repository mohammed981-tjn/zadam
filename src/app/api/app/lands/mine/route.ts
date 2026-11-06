import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort } from "@/lib/soilClasses";
import { VERIFICATION_AR, drawnBoundary } from "@/lib/appLandView";
import type { Land } from "@/types/database";

/**
 * «أراضيّ» in the app (backlog 203): the list the website's /lands shows, each land in a line.
 *
 * Read as the signed-in person, through row-level security, and filtered to the caller's own lands on purpose: the
 * policies also return a farmer's lands to the agent they authorised (backlog 169) and every land to the
 * administrator, and neither is «my land». The exact place is not sent here at all; the card has it, for its owner.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("lands")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "تعذّر تحميل أراضيك. أعد المحاولة." }, { status: 500 });
  const lands = (data ?? []) as Land[];

  return NextResponse.json(
    {
      lands: lands.map((l) => ({
        id: l.id,
        name: l.name,
        state: l.state,
        locality: l.locality,
        feddans: Number(l.feddans),
        station: stationName(l.station_key, "ar"),
        water_source: waterSourceLabel(l.water_source, "ar"),
        soil: l.soil_class ? wrbShort(l.soil_class) : null,
        verification: l.verification,
        verification_label: VERIFICATION_AR[l.verification] ?? l.verification,
        verification_note: l.verification_note,
        documents_on_file: l.documents_on_file,
        documents_required: l.documents_required,
        listed: l.listed,
        open_to_investors: l.open_to_investors ?? null,
        open_to_partners: l.open_to_partners ?? null,
        has_location: l.latitude !== null && l.longitude !== null,
        drawn: drawnBoundary(l) !== null,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
