import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSoilAtPoint, type SoilEstimate } from "@/lib/soilPoint";

/**
 * Reads the soil at a land's own point and keeps it with its source and probability (backlog 180).
 *
 * The write is `land_set_soil_estimate`, which only the server may call (review 198: the owner could call it
 * with any class and have it labelled a satellite reading on a verified land). The server reads SoilGrids
 * itself here and passes who asked; the function checks that person owns the land or is an administrator.
 * It does not send a verified land back to review. A failed read changes nothing.
 */
export async function recordSoilEstimate(
  actorId: string,
  landId: string,
  longitude: number | null,
  latitude: number | null,
): Promise<SoilEstimate | null> {
  if (longitude === null || latitude === null || longitude === undefined || latitude === undefined) return null;
  const estimate = await fetchSoilAtPoint(Number(longitude), Number(latitude));
  if (!estimate) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { error } = await admin.rpc("land_set_soil_estimate", {
    p_land: landId,
    p_actor: actorId,
    p_class: estimate.wrb,
    p_pct: estimate.probability,
  });
  if (error) {
    console.error("land soil: could not store the estimate", error.message);
    return null;
  }
  return estimate;
}
