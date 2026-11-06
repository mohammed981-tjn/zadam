import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { isNotDeployed, today, type GroupOrderSummary, type Supplier, type SupplierProduct } from "@/lib/supplyChain";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";
import { createGroupOrderStep, jsonFields } from "@/lib/supplyCore";
import { UUID, badRequest, noStore, readJson, stepJson } from "@/lib/appApi";
import { appLocale } from "@/lib/appLocale";

/**
 * الطلبات الجماعية في التطبيق (البند ٢٠٣), as /suppliers/orders: the current orders (group_order_directory), the
 * verified suppliers an order can be opened with, and — with ?supplier= — that supplier's offers still valid, to
 * start the order's lines from. POST opens the order through the same step as the website's form.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase } = auth;

  const { data, error } = await supabase.rpc("group_order_directory");
  if (isNotDeployed(error)) return NextResponse.json({ coming_soon: true, orders: [], suppliers: [] }, noStore);
  if (error) console.error("app group orders: directory failed", error.message);

  const { data: s } = await supabase
    .from("suppliers")
    .select(MEMBER_COLUMNS.suppliers)
    .not("verified_at", "is", null)
    .eq("active", true)
    .order("name")
    .limit(500);
  const suppliers = (s ?? []) as unknown as Supplier[];
  const wanted = new URL(req.url).searchParams.get("supplier") ?? "";
  const chosen = UUID.test(wanted) ? (suppliers.find((x) => x.id === wanted) ?? null) : null;
  let products: SupplierProduct[] = [];
  if (chosen) {
    const { data: p } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("supplier_id", chosen.id)
      .eq("active", true)
      .gte("valid_until", today())
      .order("name")
      .limit(8);
    products = (p ?? []) as SupplierProduct[];
  }
  return NextResponse.json(
    {
      orders: (data ?? []) as GroupOrderSummary[],
      suppliers: suppliers.map((x) => ({ id: x.id, name: x.name, state: x.state })),
      products,
    },
    noStore,
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const body = await readJson(req);
  if (!body) return badRequest(locale);
  return stepJson(await createGroupOrderStep(auth.supabase, jsonFields(body), locale));
}
