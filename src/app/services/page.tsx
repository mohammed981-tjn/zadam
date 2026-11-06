import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  SERVICE_CATALOGUE,
  SERVICE_BY_KEY,
  serviceKindLabel,
  serviceUnitLabel,
  productionLabel,
  serviceNote,
  type ProductionKind,
  type ServiceKey,
} from "@/lib/services";
import { ECONOMIC_FACTS } from "@/lib/economics";
import type { ProviderService, ServiceProvider } from "@/types/database";
import FilmPlayer from "@/components/FilmPlayer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { AVAILABILITY_LABEL, availabilityState, confirmedLabel } from "@/lib/machinery";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الخدمات التعاقدية — سوداقري", "Contracted services — Sudagri"),
  };
}

const BASIS_LABEL: Record<string, string> = {
  feddans: "يُحسب من مساحة الموسم",
  water_m3: "يُحسب من الاحتياج المائي (FAO-56)",
  head: "يُحسب من عدد الرؤوس",
  months: "يُحسب من طول الدورة",
  fixed: "مقطوعية للموسم",
};

const BASIS_LABEL_EN: Record<string, string> = {
  feddans: "computed from the season's area",
  water_m3: "computed from the water requirement (FAO-56)",
  head: "computed from the number of head",
  months: "computed from the length of the cycle",
  fixed: "lump sum for the season",
};

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
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
    .select("id, name, kind, regions, available, availability_confirmed_at");

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
    <div className="mx-auto max-w-5xl px-4 py-10 lg:max-w-6xl xl:max-w-7xl">
      <h1 className="text-2xl font-bold">{t("الخدمات التعاقدية", "Contracted services")}</h1>
      {locale === "en" ? (
        <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
          Complete services from agricultural engineering offices and verified
          providers, contracted in phases: each phase has a schedule, a budget
          and a payment released only on proof of delivery. The quantity on
          every line is <strong>derived</strong> from your season or herd — not
          typed in by hand — so both parties to the contract can recompute it.
        </p>
      ) : (
        <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
          خدمات متكاملة يقدّمها مكاتب هندسة زراعية ومزوّدون موثّقون، تُتعاقد
          بالمراحل: لكل مرحلة جدول زمني وميزانية ودفعة لا تُفرَج إلا بإثبات تنفيذ.
          الكمية في كل بند <strong>تُشتق</strong> من موسمك أو قطيعك — لا تُكتب
          يدوياً — فيمكن لطرفَي العقد إعادة حسابها.
        </p>
      )}

      <figure className="my-6">
        <FilmPlayer base="/video/services-wide" poster="/video/services-wide.jpg" label={t("فيلم سوداقري: خدمةٌ تصل إلى الحقل", "Sudagri film: a service that reaches the field")} />
      </figure>

      {/*
        Why the sector, before what the services are.

        Every figure names its publication and year. "الاستثمار الزراعي مهم" is
        a slogan; a sourced number is an argument, and the difference is whether
        a reader can go and check it.
      */}
      <section className="mb-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold">{t("لماذا هذا القطاع", "Why this sector")}</h2>
        <ul className="flex flex-col gap-3">
          {ECONOMIC_FACTS.map((f) => (
            <li key={f.key} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium">{locale === "en" ? f.headlineEn : f.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{locale === "en" ? f.detailEn : f.detail}</p>
              <p className="mt-1 text-[11px] text-muted">
                {t("المصدر:", "Source:")} {f.source} — {f.year}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/services/machinery"
        className="mb-6 block rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm hover:border-primary"
      >
        <span className="font-bold text-primary">{t("احجز جرّاراً مع جيرانك ←", "Book a tractor with your neighbours →")}</span>
        <span className="mt-1 block text-muted">
          {t(
            "الجرّار يأتي حين تجتمع أرضٌ تكفيه في محليّتك: احجز معاً على مقدّم ميكنةٍ أكّد توفّره، ولكلٍّ عقده باسمه.",
            "The tractor comes when enough land gathers in your locality: book together on a provider who confirmed being available, each with a contract in their own name.",
          )}
        </span>
      </Link>

      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["all", t("الكل", "All")],
            ["plant", t("الإنتاج النباتي", "Crop production")],
            ["livestock", t("الإنتاج الحيواني", "Livestock production")],
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {definitions.map((def) => {
          const listed = offersFor(def.key);

          return (
            <article
              key={def.key}
              className="flex flex-col rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold">{locale === "en" ? def.nameEn : def.name}</h2>
                <span className="shrink-0 text-xs text-muted">
                  {productionLabel(def.production, locale)}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted">
                {serviceKindLabel(def.kind, locale)}
              </p>

              <p className="mt-3 flex-1 text-sm leading-relaxed">{serviceNote(def, locale)}</p>

              <p className="mt-3 text-xs text-muted">
                {t("الوحدة:", "Unit:")} {serviceUnitLabel(def.unit, locale)} —{" "}
                {locale === "en" ? BASIS_LABEL_EN[def.basis] : BASIS_LABEL[def.basis]}
              </p>

              {listed.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  {listed.map((offer) => {
                    const provider = providers.get(offer.provider_id);
                    // Mechanisation says when it last confirmed being available; a confirmation weeks old is no promise.
                    const state = provider?.kind === "mechanization"
                      ? availabilityState(provider.available, provider.availability_confirmed_at)
                      : null;
                    return (
                    <li key={offer.id} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate" lang="ar" dir="auto">
                          {provider?.name ?? t("مزوّد", "Provider")}
                        </span>
                        {state && (
                          <span className={`block text-xs ${state === "fresh" ? "text-primary" : "text-muted"}`}>
                            {provider?.availability_confirmed_at
                              ? t(
                                  `آخر تأكيدٍ للتوفّر: ${confirmedLabel(provider.availability_confirmed_at, locale)}`,
                                  `Last confirmed available: ${confirmedLabel(provider.availability_confirmed_at, locale)}`,
                                )
                              : t("لم يؤكّد توفّره بعد", "Has not confirmed availability yet")}
                            {state !== "fresh" && ` — ${t(AVAILABILITY_LABEL[state].ar, AVAILABILITY_LABEL[state].en)}`}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium">
                        {n0(offer.price_per_unit)} /{" "}
                        {serviceUnitLabel(offer.unit, locale)}
                      </span>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                  {t("لا يوجد مزوّد موثّق لهذه الخدمة بعد.", "No verified provider for this service yet.")}
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
        {SERVICE_CATALOGUE.length} {t("خدمة معرّفة في الكتالوج،", "services defined in the catalogue,")}{" "}
        {Object.keys(SERVICE_BY_KEY).length === SERVICE_CATALOGUE.length
          ? t("بلا تكرار", "no duplicates")
          : t("راجع التعريفات", "check the definitions")}
        {t(". مقدّمو الخدمة يُوثّقون من الإدارة قبل ظهورهم هنا.", ". Providers are verified by the administrators before they appear here.")}
      </p>
    </div>
  );
}
