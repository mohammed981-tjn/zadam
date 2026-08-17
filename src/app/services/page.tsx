import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  SERVICE_CATALOGUE,
  SERVICE_BY_KEY,
  SERVICE_KIND_LABEL,
  SERVICE_UNIT_LABEL,
  PRODUCTION_LABEL,
  type ProductionKind,
  type ServiceKey,
} from "@/lib/services";
import { ECONOMIC_FACTS } from "@/lib/economics";
import type { ProviderService, ServiceProvider } from "@/types/database";

export const metadata = { title: "الخدمات التعاقدية — سودجري" };

const BASIS_LABEL: Record<string, string> = {
  feddans: "يُحسب من مساحة الموسم",
  water_m3: "يُحسب من الاحتياج المائي (FAO-56)",
  head: "يُحسب من عدد الرؤوس",
  months: "يُحسب من طول الدورة",
  fixed: "مقطوعية للموسم",
};

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const filter = (
    ["plant", "livestock"].includes(params.kind ?? "") ? params.kind : "all"
  ) as ProductionKind | "all";

  const supabase = await createClient();

  // RLS returns only verified, active providers to the public, so no status
  // filter is needed here — an unverified office is simply absent.
  const { data: offerRows } = await supabase
    .from("services")
    .select("id, provider_id, service_key, title, unit, price_per_unit, production_kind, lead_time_days")
    .eq("active", true);

  const { data: providerRows } = await supabase
    .from("service_providers")
    .select("id, name, kind, regions");

  const offers = (offerRows ?? []) as ProviderService[];
  const providers = new Map(
    ((providerRows ?? []) as ServiceProvider[]).map((p) => [p.id, p]),
  );

  const definitions = SERVICE_CATALOGUE.filter(
    (d) => filter === "all" || d.production === filter || d.production === "both",
  );

  const offersFor = (key: ServiceKey) =>
    offers.filter((o) => o.service_key === key);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">الخدمات التعاقدية</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
        خدمات متكاملة يقدّمها مكاتب هندسة زراعية ومزوّدون موثّقون، تُتعاقد
        بالمراحل: لكل مرحلة جدول زمني وميزانية ودفعة لا تُفرَج إلا بإثبات تنفيذ.
        الكمية في كل بند <strong>تُشتق</strong> من موسمك أو قطيعك — لا تُكتب
        يدوياً — فيمكن لطرفَي العقد إعادة حسابها.
      </p>

      {/*
        Why the sector, before what the services are.

        Every figure names its publication and year. "الاستثمار الزراعي مهم" is
        a slogan; a sourced number is an argument, and the difference is whether
        a reader can go and check it.
      */}
      <section className="mb-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold">لماذا هذا القطاع</h2>
        <ul className="flex flex-col gap-3">
          {ECONOMIC_FACTS.map((f) => (
            <li key={f.key} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium">{f.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{f.detail}</p>
              <p className="mt-1 text-[11px] text-muted">
                المصدر: {f.source} — {f.year}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["all", "الكل"],
            ["plant", "الإنتاج النباتي"],
            ["livestock", "الإنتاج الحيواني"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={value === "all" ? "/services" : `/services?kind=${value}`}
            className={`rounded-full border px-4 py-1.5 ${
              filter === value
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted hover:border-primary/50"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2">
        {definitions.map((def) => {
          const listed = offersFor(def.key);

          return (
            <article
              key={def.key}
              className="flex flex-col rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold">{def.name}</h2>
                <span className="shrink-0 text-xs text-muted">
                  {PRODUCTION_LABEL[def.production]}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted">
                {SERVICE_KIND_LABEL[def.kind]}
              </p>

              <p className="mt-3 flex-1 text-sm leading-relaxed">{def.note}</p>

              <p className="mt-3 text-xs text-muted">
                الوحدة: {SERVICE_UNIT_LABEL[def.unit]} —{" "}
                {BASIS_LABEL[def.basis]}
              </p>

              {listed.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  {listed.map((offer) => (
                    <li key={offer.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {providers.get(offer.provider_id)?.name ?? "مزوّد"}
                      </span>
                      <span className="shrink-0 font-medium">
                        {n0(offer.price_per_unit)} /{" "}
                        {SERVICE_UNIT_LABEL[offer.unit]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                  لا يوجد مزوّد موثّق لهذه الخدمة بعد.
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/*
        The catalogue describes the work whether or not anyone has registered to
        do it yet, which is deliberate: a provider deciding whether to join can
        see exactly what the platform expects a service to be, in what unit, and
        how its quantity will be computed against a season.
      */}
      <p className="mt-8 text-xs text-muted">
        {SERVICE_CATALOGUE.length} خدمة معرّفة في الكتالوج،{" "}
        {Object.keys(SERVICE_BY_KEY).length === SERVICE_CATALOGUE.length
          ? "بلا تكرار"
          : "راجع التعريفات"}
        . مقدّمو الخدمة يُوثّقون من الإدارة قبل ظهورهم هنا.
      </p>
    </div>
  );
}
