import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isNotDeployed, type Supplier, type SupplierProduct } from "@/lib/supplyChain";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { UUID, dollarRate, noStore } from "@/lib/appApi";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * One supplier's page in the app (البند ٢٠٣), as /suppliers/[id] shows it to anyone: the supplier with the visitor's
 * columns and their listed products. Read with the public key; nothing here writes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = appLocale(req);
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: tr(locale, "لا مورد بهذا الرابط، أو لم يُوثَّق بعد.", "No supplier at this link, or not verified yet.") }, { status: 404 });
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("suppliers").select(VISITOR_COLUMNS.suppliers).eq("id", id).maybeSingle();
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true }, noStore);
  const supplier = data as unknown as Supplier | null;
  if (!supplier) return NextResponse.json({ error: tr(locale, "لا مورد بهذا الرابط، أو لم يُوثَّق بعد.", "No supplier at this link, or not verified yet.") }, { status: 404 });
  const { data: p } = await supabase
    .from("supplier_products")
    .select("*")
    .eq("supplier_id", supplier.id)
    .eq("active", true)
    .order("category")
    .order("name");
  return NextResponse.json({ supplier, products: (p ?? []) as SupplierProduct[], ...(await dollarRate(locale)) }, noStore);
}
