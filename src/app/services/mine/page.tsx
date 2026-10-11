import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain, { EmptyState } from "@/components/Explain";
import OfferForm from "@/components/OfferForm";
import { setProviderPaused } from "../actions";
import {
  serviceKindLabel,
  serviceName,
  serviceUnitLabel,
  type ServiceKey,
} from "@/lib/services";
import type { ProviderService, ServiceProvider } from "@/types/database";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "جهتي ومقدّم خدماتي | سوداقري", "My organisation and services | Sudagri"),
  };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function MyProviderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  // The pause action redirects back here with its outcome. Without reading it
  // the provider presses a button and nothing visibly happens — which is the
  // same failure as reporting success on a refusal, one step earlier.
  const { error: errorMessage, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data: providerRows } = await supabase
    .from("service_providers")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at");

  const providers = (providerRows ?? []) as ServiceProvider[];

  if (providers.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-bold">{t("جهتي", "My organisation")}</h1>
        <EmptyState
          title={t("لم تسجّل جهة بعد", "You have not registered an organisation yet")}
          action={
            <Link
              href="/services/register"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("سجّل جهتك", "Register your organisation")}
            </Link>
          }
        >
          {t(
            "إن كنت تقدّم خدمات زراعية — مسحاً بالدرون، تسوية، ري حديث، إرشاداً، أو خدمات بيطرية — سجّل جهتك لتصلك طلبات التعاقد بالمراحل.",
            "If you provide agricultural services — drone surveys, levelling, modern irrigation, extension or veterinary services — register your organisation to receive phased contract requests.",
          )}
        </EmptyState>
      </div>
    );
  }

  const { data: offerRows } = await supabase
    .from("services")
    .select("*")
    .in("provider_id", providers.map((p) => p.id));

  const offers = (offerRows ?? []) as ProviderService[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("جهتي", "My organisation")}</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "أدرج خدماتك وأسعارها. كل خدمة تُسعَّر بوحدتها المعرّفة في الكتالوج.",
          "List your services and their prices. Each service is priced in the unit defined for it in the catalogue.",
        )}
      </p>

      <div className="flex flex-col gap-8">
        {message && (
          <p className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {message}
          </p>
        )}
        {errorMessage && (
          <p className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {errorMessage}
          </p>
        )}

        {providers.map((provider) => {
          const mine = offers.filter((o) => o.provider_id === provider.id);

          return (
            <section key={provider.id} className="flex flex-col gap-4">
              <header className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-bold" dir="auto">{provider.name}</h2>
                  <span
                    className={`text-sm ${
                      provider.verified_at ? "text-primary" : "text-accent"
                    }`}
                  >
                    {provider.verified_at
                      ? t("موثّقة", "Verified")
                      : t("بانتظار التوثيق", "Awaiting verification")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {serviceKindLabel(provider.kind, locale)}
                  {provider.regions.length > 0 &&
                    ` — ${provider.regions.join(locale === "en" ? ", " : "، ")}`}
                </p>

                {/*
                  Availability, and only once the provider is verified —
                  offering to pause a listing that is not in the catalogue yet
                  would be offering to change nothing.

                  It is deliberately not the same control an administrator uses.
                  `active` is administrative standing and stays with them; this
                  is the provider saying it is closed for now, and the catalogue
                  hides the entry either way while the two reasons stay
                  distinguishable to everyone who has to act on them.
                */}
                {provider.verified_at && (
                  <form
                    action={setProviderPaused}
                    className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3"
                  >
                    <input
                      type="hidden"
                      name="provider_id"
                      value={provider.id}
                    />
                    <input
                      type="hidden"
                      name="paused"
                      value={provider.paused_by_owner ? "false" : "true"}
                    />
                    <span className="text-sm">
                      {provider.paused_by_owner
                        ? t("جهتك مخفيّة من الدليل الآن.", "Your organisation is hidden from the directory.")
                        : provider.active
                          ? t("جهتك ظاهرة في الدليل.", "Your organisation is listed in the directory.")
                          : t("جهتك موقوفة إدارياً.", "Your organisation has been suspended by the administrators.")}
                    </span>
                    {provider.active && (
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background"
                      >
                        {provider.paused_by_owner
                          ? t("أعِدها إلى الدليل", "Show it in the directory again")
                          : t("أخفِها مؤقتاً", "Hide it for now")}
                      </button>
                    )}
                  </form>
                )}
              </header>

              {!provider.verified_at && (
                <Explain>
                  {t(
                    "يمكنك إدراج خدماتك الآن، لكنها لن تظهر للعملاء ولن يمكن التعاقد معك قبل توثيق الجهة من الإدارة.",
                    "You can list your services now, but customers will not see them and you cannot be contracted until the administrators verify your organisation.",
                  )}
                </Explain>
              )}

              {mine.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {mine.map((offer) => {
                    return (
                      <li
                        key={offer.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-card p-4"
                      >
                        <span>
                          <span className="font-medium">
                            {serviceName(offer.service_key, locale, offer.title)}
                          </span>
                          {offer.lead_time_days > 0 && (
                            <span className="mt-0.5 block text-xs text-muted">
                              {t("مهلة البدء", "Lead time:")} {offer.lead_time_days} {t("يوم", "days")}
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-medium">
                          {n0(Number(offer.price_per_unit))} /{" "}
                          {serviceUnitLabel(offer.unit, locale)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <OfferForm
                providerId={provider.id}
                existing={mine.map((o) => o.service_key as ServiceKey)}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
