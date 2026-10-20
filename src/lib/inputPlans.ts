import { CROPS } from "@/lib/agronomy";
import { CROP_INPUTS } from "@/lib/cropInputs";

/**
 * «مشروعي» — the first stage of the farmer's wallet (backlog 103, 115).
 *
 * The owner decided on 20 October 2026: build the wallet, but only its first
 * stage (docs/studies/wallet-ar.md §٦): the platform never holds the money.
 * The study's input list becomes a plan; the farmer approves it, pays each
 * supplier directly from their own bank account or licensed wallet, and
 * records here what they paid and what arrived. The database is the boundary
 * (supabase/migrations/20261020130000_input_plans.sql); this file builds the
 * list and adds it up.
 */

export interface PlanItemDraft {
  name: string;
  note: string;
  quantity: number;
  unit: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const range = ([lo, hi]: [number, number]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/**
 * The input list the study already shows, for the area studied. Each quantity
 * is the source's lower figure per feddan times the feddans, and the note
 * carries the whole recommendation, so the farmer can raise it; nothing the
 * sources did not give is added (sprays have no published rate, so the farmer
 * adds them).
 */
export function itemsFromStudy(cropKey: string, feddans: number): PlanItemDraft[] {
  const inputs = CROP_INPUTS[cropKey];
  if (!inputs || !(feddans > 0)) return [];
  const crop = CROPS.find((c) => c.key === cropKey)?.name ?? cropKey;
  const out: PlanItemDraft[] = [];
  if (inputs.seedKg) {
    out.push({
      name: `تقاوي ${crop}`,
      note: `التوصية ${range(inputs.seedKg)} كجم للفدان`,
      quantity: round2(inputs.seedKg[0] * feddans),
      unit: "كجم",
    });
  }
  if (inputs.ureaKg) {
    out.push({
      name: "يوريا (٤٦٪ نيتروجين)",
      note: `التوصية ${range(inputs.ureaKg)} كجم للفدان`,
      quantity: round2(inputs.ureaKg[0] * feddans),
      unit: "كجم",
    });
  }
  if (inputs.phosphate) {
    out.push({
      name: `سماد فوسفاتي (${inputs.phosphate.kind})`,
      note: `التوصية ${range(inputs.phosphate.kg)} كجم للفدان`,
      quantity: round2(inputs.phosphate.kg[0] * feddans),
      unit: "كجم",
    });
  }
  return out.filter((i) => i.quantity > 0);
}

export interface PlanItem {
  id: string;
  name: string;
  note: string | null;
  quantity: number;
  unit: string;
  unit_price_usd: number | null;
  supplier_name: string | null;
  paid_sdg: number | null;
  paid_at: string | null;
  paid_ref: string | null;
  delivered_at: string | null;
  delivery_note: string | null;
  removed_at: string | null;
}

export interface Plan {
  id: string;
  title: string;
  crop_key: string;
  feddans: number;
  status: "draft" | "approved" | "closed";
  approved_at: string | null;
  closed_at: string | null;
  created_at: string;
  input_plan_items: PlanItem[];
}

export interface PlanTotals {
  /** Items still on the list. */
  items: number;
  /** Their cost where a price is written, in dollars. */
  costUsd: number;
  /** Items with no price yet — the cost above leaves them out, and says so. */
  unpriced: number;
  /** What the farmer recorded paying, in pounds. */
  paidSdg: number;
  paidItems: number;
  delivered: number;
  /** Priced items not yet paid, in dollars. */
  remainingUsd: number;
}

export function planTotals(items: PlanItem[]): PlanTotals {
  const live = items.filter((i) => !i.removed_at);
  const priced = live.filter((i) => i.unit_price_usd !== null);
  const cost = (i: PlanItem) => Number(i.quantity) * Number(i.unit_price_usd);
  return {
    items: live.length,
    costUsd: round2(priced.reduce((s, i) => s + cost(i), 0)),
    unpriced: live.length - priced.length,
    paidSdg: round2(live.reduce((s, i) => s + (i.paid_sdg === null ? 0 : Number(i.paid_sdg)), 0)),
    paidItems: live.filter((i) => i.paid_sdg !== null).length,
    delivered: live.filter((i) => i.delivered_at !== null).length,
    remainingUsd: round2(priced.filter((i) => i.paid_sdg === null).reduce((s, i) => s + cost(i), 0)),
  };
}
