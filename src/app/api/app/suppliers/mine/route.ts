import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { isNotDeployed, type Supplier, type SupplierProduct } from "@/lib/supplyChain";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";
import {
  jsonFields,
  removeProductStep,
  saveProductStep,
  saveSupplierStep,
  setSupplierActiveStep,
  setSupplierDocumentStep,
} from "@/lib/supplyCore";
import { discardAppPhoto, uploadAppPhoto } from "@/lib/appPhoto";
import { badRequest, dollarRate, noStore, readJson, stepJson } from "@/lib/appApi";

/**
 * «صفحتي كمورد» في التطبيق (البند ٢٠٣), as /suppliers/mine: the caller's own supplier record (its private columns from
 * supplier_private(), the administrator's note from review_notes()), and all their products. POST is one of the page's
 * forms: the details, the document photo, a product, stopping a product, pausing the listing.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  type Priv = { id: string; owner_id: string; licence_doc_path: string | null; verified_by: string | null };
  const { data: privRows, error } = await supabase.rpc("supplier_private");
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true }, noStore);
  const own = ((privRows ?? []) as Priv[]).find((r) => r.owner_id === user.id) ?? null;
  let supplier: Supplier | null = null;
  let products: SupplierProduct[] = [];
  if (own) {
    const { data } = await supabase.from("suppliers").select(MEMBER_COLUMNS.suppliers).eq("id", own.id).maybeSingle();
    supplier = data ? ({ ...(data as unknown as Supplier), ...own } as Supplier) : null;
  }
  if (supplier) {
    const { data: noteRows } = await supabase.rpc("review_notes", { p_kind: "supplier" });
    const note = ((noteRows ?? []) as { id: string; review_note: string }[]).find((r) => r.id === supplier!.id);
    supplier = { ...supplier, review_note: note?.review_note ?? null };
    const { data: p } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("supplier_id", supplier.id)
      .order("active", { ascending: false })
      .order("name");
    products = (p ?? []) as SupplierProduct[];
  }
  // The document's path is not the app's to show; whether there is one is.
  const shown = supplier ? { ...supplier, licence_doc_path: undefined, has_document: !!supplier.licence_doc_path, verified_by: undefined } : null;
  return NextResponse.json({ supplier: shown, products, ...(await dollarRate()) }, noStore);
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;
  const body = await readJson(req);
  if (!body) return badRequest();
  const f = jsonFields(body);

  switch (f.str("action")) {
    case "save":
      return stepJson(await saveSupplierStep(supabase, f, "ar"));
    case "document": {
      // Where the website's PhotoField puts it (<id>/suppliers/…); supplier_set_document checks the first segment too.
      const photo = await uploadAppPhoto(supabase, user.id, "suppliers", body.photo);
      if ("error" in photo) return NextResponse.json({ error: photo.error }, { status: 400 });
      const r = await setSupplierDocumentStep(supabase, jsonFields({ doc_path: photo.path }), "ar");
      if (!r.ok) await discardAppPhoto(supabase, photo.path);
      return stepJson(r);
    }
    case "active":
      return stepJson(await setSupplierActiveStep(supabase, f, "ar"));
    case "product":
      return stepJson(await saveProductStep(supabase, f, "ar"));
    case "remove_product":
      return stepJson(await removeProductStep(supabase, f, "ar"));
    default:
      return badRequest();
  }
}
