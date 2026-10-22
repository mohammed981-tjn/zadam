import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpenLand } from "@/lib/investors";
import type { InspectionRow, InspectionStats } from "@/lib/inspections";

/**
 * Everything a page needs to show the verified land offered to investors
 * (backlogs 124, 128, 129): the offers, the inspection fee and the public count
 * of reports, and the caller's own open inspection on each land.
 *
 * One loader for `/invest` and `/projects`, because the investor meets the same
 * land on both and the two must never disagree about it.
 */
export interface LandOffers {
  lands: OpenLand[];
  failed: boolean;
  fee: number | null;
  /** False on a database the inspection migration has not reached. */
  inspectionsOn: boolean;
  stats: InspectionStats | null;
  openInspection: Map<string, InspectionRow>;
}

export async function loadLandOffers(supabase: SupabaseClient, signedIn: boolean): Promise<LandOffers> {
  const [{ data: landRows, error }, { data: statRows }, { data: feeRow }, { data: mine }] = await Promise.all([
    supabase.rpc("investor_open_lands"),
    supabase.rpc("land_inspection_stats"),
    supabase.from("platform_fees").select("amount_sdg").eq("key", "land_inspection").maybeSingle(),
    signedIn ? supabase.rpc("land_inspection_list") : Promise.resolve({ data: null }),
  ]);
  if (error) console.error("land offers: read failed", error);
  return {
    lands: (landRows ?? []) as OpenLand[],
    failed: Boolean(error),
    fee: (feeRow as { amount_sdg: number | null } | null)?.amount_sdg ?? null,
    inspectionsOn: statRows !== null,
    stats: ((statRows ?? []) as InspectionStats[])[0] ?? null,
    openInspection: new Map(
      ((mine ?? []) as InspectionRow[])
        .filter((i) => i.role === "investor" && ["requested", "accepted", "assigned", "reported"].includes(i.status))
        .map((i) => [i.land_id, i]),
    ),
  };
}

/** For a project card: the published projects that stand on a verified land, with that land's documents. */
export async function loadProjectLands(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("public_project_lands");
  return new Map(
    ((data ?? []) as { project_id: string; documents_on_file: number; documents_required: number }[]).map((r) => [
      r.project_id,
      { documents: r.documents_on_file, required: r.documents_required },
    ]),
  );
}
