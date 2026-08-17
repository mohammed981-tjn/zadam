import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContractBuilder, {
  type BuilderOffer,
  type BuilderSeason,
} from "@/components/ContractBuilder";

export const metadata = { title: "عقد خدمات جديد | سودجري" };

export default async function NewContractPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS limits seasons to the caller's own, and services to those of verified
  // active providers, so neither query needs a filter for it.
  const { data: seasonRows } = await supabase
    .from("seasons")
    .select("id, name, crop_key, station_key, irrigation, feddans, budget_per_feddan, planting_date")
    .eq("status", "active")
    .order("planting_date", { ascending: false });

  const { data: offerRows } = await supabase
    .from("services")
    .select("provider_id, service_key, price_per_unit, service_providers(name)")
    .eq("active", true);

  const offers: BuilderOffer[] = (
    (offerRows ?? []) as unknown as {
      provider_id: string;
      service_key: BuilderOffer["service_key"];
      price_per_unit: number;
      service_providers: { name: string } | null;
    }[]
  ).map((o) => ({
    provider_id: o.provider_id,
    provider_name: o.service_providers?.name ?? "مزوّد",
    service_key: o.service_key,
    price_per_unit: Number(o.price_per_unit),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">عقد خدمات جديد</h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        اختر موسمك والخدمات التي تحتاجها، وسيولّد النظام مراحل العقد بتواريخها
        ومبالغها — محسوبة من موسمك لا مكتوبة يدوياً. كل مرحلة تُدفع بعد إثبات
        تنفيذها.
      </p>

      <ContractBuilder
        seasons={(seasonRows ?? []) as BuilderSeason[]}
        offers={offers}
      />
    </div>
  );
}
