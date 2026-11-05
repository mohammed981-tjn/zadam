import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import Explain, { EmptyState } from "@/components/Explain";
import { serviceKindLabel, serviceUnitLabel, serviceName } from "@/lib/services";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import type { ProviderService, ServiceProvider } from "@/types/database";
import { verifyProvider, unverifyProvider, setProviderActive } from "./actions";

export const metadata = { title: "توثيق مقدّمي الخدمة | سوداقري" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const date = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  // Same gate as the other admin screens: checked here so the page never
  // renders for a non-admin, and enforced again by RLS and by the trigger on
  // every write, so a crafted request gets nowhere either.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data: providerRows } = await supabase
    .from("service_providers")
    .select("*")
    .order("verified_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  const providers = (providerRows ?? []) as ServiceProvider[];

  const { data: offerRows } = await supabase
    .from("services")
    .select("id, provider_id, service_key, unit, price_per_unit, active");

  const offers = (offerRows ?? []) as ProviderService[];

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const pending = providers.filter((p) => !p.verified_at);
  const verified = providers.filter((p) => p.verified_at);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("توثيق مقدّمي الخدمة", "Verifying service providers")}</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
        {pending.length === 0
          ? t("لا توجد جهات بانتظار التوثيق.", "No providers are waiting for verification.")
          : t(`${pending.length} جهة بانتظار قرارك.`, `${pending.length} provider(s) waiting for your decision.`)}
      </p>

      {message && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Explain tone="why">
        {/* Said once, at the top: this is the only act that opens the catalogue,
            and an admin who does not know that treats it as a formality. */}
        {locale === "en" ? (
          <>
            Verification is what puts a provider into the catalogue and lets it be contracted. An
            unverified provider can sign up and list its offers, but nobody sees it and no contract
            can be built with it — <strong>so no service reaches farmers before your decision here</strong>.
          </>
        ) : (
          <>
            التوثيق هو ما يُدخل الجهة إلى الكتالوج ويسمح بالتعاقد معها. الجهة غير
            الموثّقة تستطيع التسجيل وإدراج عروضها، ولا يراها أحد ولا يمكن بناء عقد
            معها — <strong>فلا خدمة تظهر للمزارعين قبل قرارك هنا</strong>.
          </>
        )}
      </Explain>

      {/* ── بانتظار التوثيق ─────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 text-lg font-bold">{t("بانتظار التوثيق", "Awaiting verification")}</h2>

      {pending.length === 0 ? (
        <EmptyState title={t("لا شيء ينتظر", "Nothing waiting")}>
          {t(
            "كل الجهات المسجّلة تمّت مراجعتها. الجهات الجديدة تظهر هنا فور تسجيلها.",
            "Every registered provider has been reviewed. New ones appear here as soon as they sign up.",
          )}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              offers={offers.filter((o) => o.provider_id === p.id)}
              locale={locale}
            />
          ))}
        </ul>
      )}

      {/* ── الموثّقة ─────────────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-10 text-lg font-bold">
        {t("الجهات الموثّقة", "Verified providers")} ({verified.length})
      </h2>

      {verified.length === 0 ? (
        <p className="text-sm text-muted">{t("لا توجد جهات موثّقة بعد.", "No verified providers yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {verified.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              offers={offers.filter((o) => o.provider_id === p.id)}
              locale={locale}
            />
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm">
        <Link href="/services" className="text-primary underline">
          {t("عرض الكتالوج كما يراه الزائر ←", "See the catalogue as a visitor sees it →")}
        </Link>
      </p>
    </div>
  );
}

function ProviderCard({
  provider,
  offers,
  locale,
}: {
  provider: ServiceProvider;
  offers: ProviderService[];
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const isVerified = Boolean(provider.verified_at);

  return (
    <li className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{provider.name}</h3>
        <span
          className={`text-sm ${
            !provider.active
              ? "text-danger"
              : isVerified
                ? "text-primary"
                : "text-accent"
          }`}
        >
          {!provider.active
            ? t("موقوفة", "Suspended")
            : isVerified
              ? `${t("موثّقة", "Verified")} — ${date(provider.verified_at!, locale)}`
              : t("بانتظار التوثيق", "Awaiting verification")}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted">
        {serviceKindLabel(provider.kind, locale)}
        {provider.regions.length > 0 && ` — ${provider.regions.join(locale === "en" ? ", " : "، ")}`}
        {provider.phone && ` — ${provider.phone}`}
      </p>

      {provider.bio && (
        <p className="mt-3 text-sm leading-relaxed">{provider.bio}</p>
      )}

      {/* The offers are shown because they are most of what there is to judge.
          A provider claiming to install irrigation networks and listing only a
          soil test is a different proposition from one listing neither. */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium">
          {t("العروض المدرجة", "Listed offers")} ({offers.length})
        </p>
        {offers.length === 0 ? (
          <p className="text-xs text-muted">
            {t(
              "لم تُدرج أي خدمة بعد. التوثيق ممكن الآن، ولن تظهر في الكتالوج حتى تضيف عرضاً واحداً على الأقل.",
              "No service listed yet. It can be verified now, but it will not appear in the catalogue until it adds at least one offer.",
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {offers.map((o) => {
              return (
                <li key={o.id} className="flex justify-between gap-2">
                  <span className={o.active ? "" : "text-muted line-through"}>
                    {serviceName(o.service_key, locale)}
                  </span>
                  <span className="shrink-0">
                    {n0(Number(o.price_per_unit))} /{" "}
                    {serviceUnitLabel(o.unit, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!isVerified ? (
          <form action={verifyProvider}>
            <input type="hidden" name="provider_id" value={provider.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("وثّق الجهة", "Verify provider")}
            </button>
          </form>
        ) : (
          <form action={unverifyProvider}>
            <input type="hidden" name="provider_id" value={provider.id} />
            <button
              type="submit"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted"
            >
              {t("اسحب التوثيق", "Withdraw verification")}
            </button>
          </form>
        )}

        <form action={setProviderActive}>
          <input type="hidden" name="provider_id" value={provider.id} />
          <input
            type="hidden"
            name="active"
            value={provider.active ? "false" : "true"}
          />
          <button
            type="submit"
            className={`rounded-lg border px-4 py-2 text-sm ${
              provider.active
                ? "border-danger/40 text-danger"
                : "border-primary text-primary"
            }`}
          >
            {provider.active ? t("أوقف مؤقتاً", "Suspend") : t("أعد التفعيل", "Reactivate")}
          </button>
        </form>
      </div>

      {isVerified && (
        <p className="mt-3 text-xs text-muted">
          {t(
            "سحب التوثيق يُخرجها من الكتالوج ولا يمسّ عقودها القائمة.",
            "Withdrawing verification takes it out of the catalogue and leaves its existing contracts untouched.",
          )}
        </p>
      )}
    </li>
  );
}
