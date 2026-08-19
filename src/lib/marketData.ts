import { createClient } from "@/lib/supabase/server";
import {
  FAOSTAT_ITEM,
  type CropMarket,
  type PriceBasis,
} from "@/lib/cropBenchmark";

/**
 * Loads the market picture for every crop the calculator offers.
 *
 * The aggregation lives in the crop_market view, so this function does one
 * thing the database cannot: choose which price to believe, and say so. The
 * ladder is Sudan's own export unit value first, a regional producer price
 * second, and nothing third — never a silent substitution, because a study
 * resting on Egypt's farm gate and a study resting on Sudan's own receipts are
 * not equally strong and the reader has to be able to tell which one they are
 * looking at.
 */

interface CropMarketRow {
  item: string;
  year: number | null;
  sudan_kg_ha: number | null;
  egypt_kg_ha: number | null;
  peer_median_kg_ha: number | null;
  sudan_export_usd_per_tonne: number | null;
  regional_producer_usd_per_tonne: number | null;
}

function resolvePrice(row: CropMarketRow): {
  usdPerTonne: number | null;
  priceBasis: PriceBasis;
} {
  const sudan = row.sudan_export_usd_per_tonne;
  if (sudan !== null && sudan > 0) {
    return { usdPerTonne: sudan, priceBasis: "sudan_export" };
  }
  const regional = row.regional_producer_usd_per_tonne;
  if (regional !== null && regional > 0) {
    return { usdPerTonne: regional, priceBasis: "regional_producer" };
  }
  return { usdPerTonne: null, priceBasis: "none" };
}

export async function loadCropMarkets(): Promise<Record<string, CropMarket>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crop_market")
    .select(
      "item, year, sudan_kg_ha, egypt_kg_ha, peer_median_kg_ha, sudan_export_usd_per_tonne, regional_producer_usd_per_tonne",
    );

  const byItem = new Map<string, CropMarketRow>();
  for (const row of (data ?? []) as CropMarketRow[]) byItem.set(row.item, row);

  const markets: Record<string, CropMarket> = {};

  // Driven by the mapping, not by what came back: a crop whose item is missing
  // from the view still gets an entry, with nulls and a "none" basis, so the
  // screen can say the reference is absent instead of omitting the crop and
  // leaving the reader to wonder where it went.
  for (const [cropKey, item] of Object.entries(FAOSTAT_ITEM)) {
    const row = byItem.get(item);
    if (!row) {
      markets[cropKey] = {
        cropKey,
        faostatItem: item,
        sudanKgPerHa: null,
        nearestPeerKgPerHa: null,
        peerMedianKgPerHa: null,
        usdPerTonne: null,
        priceBasis: "none",
        year: null,
      };
      continue;
    }
    const { usdPerTonne, priceBasis } = resolvePrice(row);
    markets[cropKey] = {
      cropKey,
      faostatItem: item,
      sudanKgPerHa: row.sudan_kg_ha,
      nearestPeerKgPerHa: row.egypt_kg_ha,
      peerMedianKgPerHa: row.peer_median_kg_ha,
      usdPerTonne,
      priceBasis,
      year: row.year,
    };
  }

  return markets;
}
