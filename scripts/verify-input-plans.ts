/**
 * «مشروعي»: القائمة من مصادر دراسة الجدوى وحدها، والمجموع لا يحسب ما لا سعر له.
 *
 * itemsFromStudy turns the crop's sourced inputs into a list for the area
 * studied: the lower figure per feddan times the feddans, the whole range in
 * the note, and nothing the sources did not give. planTotals adds up what is
 * priced, paid and delivered, and leaves removed items out without losing them.
 */
import { CROP_INPUTS } from "../src/lib/cropInputs";
import { itemsFromStudy, planTotals, type PlanItem } from "../src/lib/inputPlans";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const wheat = CROP_INPUTS.wheat;
const list = itemsFromStudy("wheat", 10);
ok(list.length === 3, "wheat on 10 feddans: seed, urea and phosphate");
ok(list[0].quantity === wheat.seedKg![0] * 10 && list[0].note.includes(`${wheat.seedKg![0]}–${wheat.seedKg![1]}`), "seed: the lower figure × feddans, and the whole range in the note");
ok(list[1].quantity === wheat.ureaKg![0] * 10, "urea: the lower figure × feddans");
ok(list[2].name.includes(wheat.phosphate!.kind) && list[2].quantity === wheat.phosphate!.kg[0] * 10, "phosphate: its kind in the name");
ok(!list.some((i) => /رشّ|مبيد/.test(i.name)), "no spray: no published rate, so the farmer adds it");
ok(itemsFromStudy("nonesuch", 10).length === 0 && itemsFromStudy("wheat", 0).length === 0, "an unknown crop or no area is an empty list");
ok(
  Object.keys(CROP_INPUTS).every((k) => itemsFromStudy(k, 1).every((i) => i.quantity > 0 && i.name.length >= 2 && i.unit.length >= 1)),
  "every crop's list fits the table's checks",
);

const base: Omit<PlanItem, "id" | "name"> = {
  note: null, quantity: 100, unit: "كجم", unit_price_usd: null, supplier_name: null,
  paid_sdg: null, paid_at: null, paid_ref: null, delivered_at: null, delivery_note: null, removed_at: null,
};
const totals = planTotals([
  { ...base, id: "1", name: "أ", unit_price_usd: 2, paid_sdg: 840000, paid_at: "2026-10-20", delivered_at: "2026-10-20" },
  { ...base, id: "2", name: "ب", unit_price_usd: 1 },
  { ...base, id: "3", name: "ج" },
  { ...base, id: "4", name: "د", unit_price_usd: 50, removed_at: "2026-10-20T00:00:00Z" },
]);
ok(totals.items === 3, "a removed item is left out of the count");
ok(totals.costUsd === 300 && totals.unpriced === 1, "the cost counts priced items only, and says how many have no price");
ok(totals.paidSdg === 840000 && totals.paidItems === 1 && totals.delivered === 1, "paid and delivered as the farmer recorded them");
ok(totals.remainingUsd === 100, "left to pay: priced items not yet paid");

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
