import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isNotDeployed, type Supplier, type SupplierProduct } from "@/lib/supplyChain";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { dollarRate, noStore } from "@/lib/appApi";

/**
 * «الموردون الموثّقون» في التطبيق (البند ٢٠٣): what /suppliers shows anyone, signed in or not — the verified, active
 * suppliers with the visitor's columns, their listed products, and today's dollar rate. Read with the public key, as
 * a visitor reads the page: row-level security and the column grants decide, and nothing here writes.
 */
export async function GET() {
  const supabase = createPublicClient();
  const { data: rows, error } = await supabase
    .from("suppliers")
    .select(VISITOR_COLUMNS.suppliers)
    .not("verified_at", "is", null)
    .eq("active", true)
    .order("name")
    .limit(500);
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true, suppliers: [], products: [], rate: null }, noStore);
  if (error) {
    console.error("app suppliers: list failed", error.message);
    return NextResponse.json({ error: "تعذّر تحميل الموردين. أعد المحاولة." }, { status: 502 });
  }
  const suppliers = (rows ?? []) as unknown as Supplier[];
  let products: SupplierProduct[] = [];
  if (suppliers.length > 0) {
    const { data: p, error: pErr } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("active", true)
      .in(
        "supplier_id",
        suppliers.map((s) => s.id),
      )
      .order("price_usd");
    if (pErr) console.error("app suppliers: products failed", pErr.message);
    products = (p ?? []) as SupplierProduct[];
  }
  return NextResponse.json({ suppliers, products, ...(await dollarRate()) }, noStore);
}
