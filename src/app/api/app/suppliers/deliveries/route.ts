import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { isNotDeployed, type Carrier, type Delivery } from "@/lib/supplyChain";
import {
  cancelDeliveryStep,
  confirmDeliveryStep,
  issueDeliveryCodeStep,
  jsonFields,
  markDeliveryPaidStep,
  saveCarrierStep,
} from "@/lib/supplyCore";
import { discardAppPhoto, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { badRequest, noStore, readJson, stepJson } from "@/lib/appApi";
import { appLocale } from "@/lib/appLocale";

/**
 * التوصيل إلى الأرض في التطبيق (البند ٢٠٣), as /suppliers/deliveries: the caller's carrier record, and the deliveries
 * row-level security lets them read, in the page's three lists — to them, assigned to them as carrier, and assigned
 * by them. POST is one of the page's forms: the recipient's code, the carrier's handover (photo, place and code:
 * delivery_confirm), the payment, the cancellation (delivery_cancel), and the carrier's own details.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const [{ data: c, error }, { data: d }] = await Promise.all([
    supabase.from("carriers").select("*").eq("owner_id", user.id).maybeSingle(),
    supabase.from("deliveries").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true }, noStore);
  const carrier = c as Carrier | null;
  const all = (d ?? []) as Delivery[];
  return NextResponse.json(
    {
      carrier,
      to_me: all.filter((x) => x.recipient_id === user.id && x.status !== "cancelled"),
      to_carry: carrier ? all.filter((x) => x.carrier_id === carrier.id && x.status !== "cancelled") : [],
      assigned: all.filter((x) => x.assigned_by === user.id),
    },
    noStore,
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const body = await readJson(req);
  if (!body) return badRequest(locale);
  const f = jsonFields(body);

  switch (f.str("action")) {
    case "issue_code":
      return stepJson(await issueDeliveryCodeStep(supabase, f.str("delivery_id"), locale));
    case "confirm": {
      // A missing place or a short code is refused before anything is stored: the step says which, in its own words,
      // and reaches the database only when both are there (so the stand-in path below never does).
      const code = f.str("code").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
      if (f.num("lat") === null || f.num("lng") === null || code.length !== 6) {
        return stepJson(await confirmDeliveryStep(supabase, jsonFields({ ...body, photo_path: "-" }), locale));
      }
      // The photo goes where the website's PhotoField puts it (<id>/deliveries/…), then the same step checks the rest.
      const photo = await uploadAppPhoto(supabase, user.id, "deliveries", body.photo);
      if ("error" in photo) return NextResponse.json({ error: photoError(locale, photo.error) }, { status: 400 });
      const r = await confirmDeliveryStep(supabase, jsonFields({ ...body, photo_path: photo.path }), locale);
      if (!r.ok) await discardAppPhoto(supabase, photo.path);
      return stepJson(r);
    }
    case "paid":
      return stepJson(await markDeliveryPaidStep(supabase, f, locale));
    case "cancel":
      return stepJson(await cancelDeliveryStep(supabase, f, locale));
    case "carrier":
      return stepJson(await saveCarrierStep(supabase, f, locale));
    default:
      return badRequest(locale);
  }
}
