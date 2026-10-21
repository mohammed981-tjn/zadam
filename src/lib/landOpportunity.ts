import type { SupabaseClient } from "@supabase/supabase-js";
import { LAND_DOCUMENT_KINDS } from "@/lib/landDocuments";
import type { WaterSource } from "@/lib/risk";

/**
 * A verified land, read as the start of an opportunity (backlog 123).
 *
 * Investors browse projects, not land, so a farmer whose land the
 * administration has verified reaches them by posting an opportunity. The form
 * used to ask again for everything the land already said — the place, the
 * area, the water — and took the four documents as ticked boxes even when the
 * same four files sat verified on the land. This reads the land once, for the
 * form to start from and for the action to check against.
 *
 * `docs` follows the opportunity form's four documents, which are the land's
 * four kinds in the same order: tenure, photo, permit, inspection.
 */
export interface OfferableLand {
  id: string;
  name: string;
  location: string;
  feddans: number;
  stationKey: string;
  waterSource: WaterSource;
  waterPerFeddan: number | null;
  kmToMarket: number | null;
  docs: boolean[];
}

/**
 * The caller's own verified land, or null. Someone else's land, or one still
 * under review, is null.
 *
 * The project does not keep a link to the land: that needs a `projects.land_id`
 * column, and the migration for it was declined on 21 October. So the land
 * fills the form and counts its documents, and the project stands on its own
 * as before.
 */
export async function readOfferableLand(
  supabase: SupabaseClient,
  userId: string,
  landId: string,
): Promise<OfferableLand | null> {
  if (!landId) return null;
  const { data: land } = await supabase
    .from("lands")
    .select("id, name, state, locality, village, feddans, station_key, water_source, water_per_feddan, km_to_market")
    .eq("id", landId)
    .eq("owner_id", userId)
    .eq("verification", "verified")
    .maybeSingle();
  if (!land) return null;

  const { data: docRows } = await supabase.from("land_documents").select("kind").eq("land_id", land.id);
  const kinds = new Set(((docRows ?? []) as { kind: string }[]).map((d) => d.kind));

  return {
    id: land.id,
    name: land.name,
    location: [land.state, land.locality, land.village].filter(Boolean).join(" · "),
    feddans: Number(land.feddans),
    stationKey: land.station_key,
    waterSource: land.water_source as WaterSource,
    waterPerFeddan: land.water_per_feddan === null ? null : Number(land.water_per_feddan),
    kmToMarket: land.km_to_market === null ? null : Number(land.km_to_market),
    docs: LAND_DOCUMENT_KINDS.map((k) => kinds.has(k.value)),
  };
}
