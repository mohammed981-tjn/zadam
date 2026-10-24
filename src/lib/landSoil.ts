import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSoilAtPoint, type SoilEstimate } from "@/lib/soilPoint";

/**
 * Reads the soil at a land's own point and keeps it with its source and probability (backlog 180).
 *
 * The write is `land_set_soil_estimate`, which only the land's owner (or an administrator) may call
 * and which does not send a verified land back to review. A failed read changes nothing: the class
 * already stored stays, with whatever label it had.
 */
export async function recordSoilEstimate(
  supabase: SupabaseClient,
  landId: string,
  longitude: number | null,
  latitude: number | null,
): Promise<SoilEstimate | null> {
  if (longitude === null || latitude === null || longitude === undefined || latitude === undefined) return null;
  const estimate = await fetchSoilAtPoint(Number(longitude), Number(latitude));
  if (!estimate) return null;
  const { error } = await supabase.rpc("land_set_soil_estimate", {
    p_land: landId,
    p_class: estimate.wrb,
    p_pct: estimate.probability,
  });
  if (error) {
    console.error("land soil: could not store the estimate", error.message);
    return null;
  }
  return estimate;
}
