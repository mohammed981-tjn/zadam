"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { createExportOffer, moveExportOffer, type OfferMove } from "@/lib/exportCorridors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * زرُّ «أرسل» — نصفُ المزارع من القرار.
 *
 * WHY THE FARMER PRESSES THIS AND NOT THE REVIEWER
 *
 * It is their goods, their consent and their figures. Nothing here publishes:
 * the offer stops at `submitted`, and the database — not this file — is what
 * keeps it there. The row-level policy caps what a farmer may set to
 * draft/submitted/withdrawn, so a direct POST to this endpoint with
 * `status=published` is refused by the boundary rather than by a check in
 * TypeScript that a PostgREST caller would never reach.
 *
 * The shape follows the Ethiopian commodity exchange, where a licensed grader
 * — not the seller — certifies the grade, and that certification is the whole
 * product. What it deliberately does not follow is that exchange's cost:
 * commingling into graded silos, which cost it traceability to the farmer and
 * with it the European market. Here the lot stays attached to one farmer's
 * season, which is the only thing Sudagri has that nobody else does.
 *
 * The checks and the writes are in `createExportOffer` (src/lib/exportCorridors.ts), which the phone app's export
 * route calls too (backlog 203), so an offer saved from either is held to the same sentences.
 */
export async function createOffer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const result = await createExportOffer(
    supabase,
    user.id,
    {
      commodityId: str(formData, "commodity_id"),
      destinationId: str(formData, "destination_id"),
      quantity: str(formData, "quantity"),
      unitPrice: str(formData, "unit_price"),
      plotRef: str(formData, "plot_ref"),
      areaHectares: str(formData, "area_hectares"),
      latitude: str(formData, "latitude"),
      longitude: str(formData, "longitude"),
      boundary: str(formData, "boundary"),
      uom: str(formData, "uom_code"),
      gradeId: str(formData, "grade_id"),
      seasonId: str(formData, "season_id"),
    },
    await getLocale(),
  );
  if (result.ok) revalidatePath("/export/offers");
  return { ok: result.ok, message: result.message };
}

/**
 * Moves an offer between the states a farmer is allowed to move it between.
 *
 * `next` is checked against a closed list (`moveExportOffer`), and again by the
 * state-machine trigger, and again by the row-level policy. That is not
 * redundancy for its own sake: the first produces the message, the trigger
 * keeps the transitions lawful for every caller including PostgREST, and the
 * policy is what actually stops a farmer publishing their own goods.
 */
export async function moveOffer(
  offerId: string,
  next: OfferMove,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const result = await moveExportOffer(supabase, user.id, offerId, next, await getLocale());
  if (result.ok) revalidatePath("/export/offers");
  return { ok: result.ok, message: result.message };
}
