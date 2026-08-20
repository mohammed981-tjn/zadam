import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain, { EmptyState } from "@/components/Explain";
import OfferForm from "@/components/OfferForm";
import { setProviderPaused } from "../actions";
import {
  SERVICE_KIND_LABEL,
  SERVICE_BY_KEY,
  SERVICE_UNIT_LABEL,
  type ServiceKey,
} from "@/lib/services";
import type { ProviderService, ServiceProvider } from "@/types/database";

export const metadata = { title: "جهتي ومقدّم خدماتي | سودجري" };

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

  const { data: providerRows } = await supabase
    .from("service_providers")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at");

  const providers = (providerRows ?? []) as ServiceProvider[];

  if (providers.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-bold">جهتي</h1>
        <EmptyState
          title="لم تسجّل جهة بعد"
          action={
            <Link
              href="/services/register"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              سجّل جهتك
            </Link>
          }
        >
          إن كنت تقدّم خدمات زراعية — مسحاً بالدرون، تسوية، ري حديث، إرشاداً، أو
          خدمات بيطرية — سجّل جهتك لتصلك طلبات التعاقد بالمراحل.
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
      <h1 className="text-2xl font-bold">جهتي</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        أدرج خدماتك وأسعارها. كل خدمة تُسعَّر بوحدتها المعرّفة في الكتالوج.
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
                  <h2 className="font-bold">{provider.name}</h2>
                  <span
                    className={`text-sm ${
                      provider.verified_at ? "text-primary" : "text-accent"
                    }`}
                  >
                    {provider.verified_at ? "موثّقة" : "بانتظار التوثيق"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {SERVICE_KIND_LABEL[provider.kind]}
                  {provider.regions.length > 0 &&
                    ` — ${provider.regions.join("، ")}`}
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
                        ? "جهتك مخفيّة من الدليل الآن."
                        : provider.active
                          ? "جهتك ظاهرة في الدليل."
                          : "جهتك موقوفة إدارياً."}
                    </span>
                    {provider.active && (
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background"
                      >
                        {provider.paused_by_owner
                          ? "أعِدها إلى الدليل"
                          : "أخفِها مؤقتاً"}
                      </button>
                    )}
                  </form>
                )}
              </header>

              {!provider.verified_at && (
                <Explain>
                  يمكنك إدراج خدماتك الآن، لكنها لن تظهر للعملاء ولن يمكن
                  التعاقد معك قبل توثيق الجهة من الإدارة.
                </Explain>
              )}

              {mine.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {mine.map((offer) => {
                    const def = SERVICE_BY_KEY[offer.service_key];
                    return (
                      <li
                        key={offer.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-card p-4"
                      >
                        <span>
                          <span className="font-medium">
                            {def?.name ?? offer.title}
                          </span>
                          {offer.lead_time_days > 0 && (
                            <span className="mt-0.5 block text-xs text-muted">
                              مهلة البدء {offer.lead_time_days} يوم
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-medium">
                          {n0(Number(offer.price_per_unit))} /{" "}
                          {SERVICE_UNIT_LABEL[offer.unit]}
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
