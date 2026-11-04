import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContractBuilder, {
  type BuilderHerd,
  type BuilderOffer,
  type BuilderSeason,
} from "@/components/ContractBuilder";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginHrefHere } from "@/lib/loginHere";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "عقد خدمات جديد | سوداقري", "New service contract | Sudagri") };
}

export default async function NewContractPage({
  searchParams,
}: {
  /*
   * `?herd=<id>` أو `?season=<id>` — يأتي من زرّ «اطلب خدمة» في صفحة القطيع
   * أو الموسم، فيفتح النموذجُ على الوحدة نفسها بدل أوّل ما في القائمة.
   * والمعرّفُ مجرّدُ تفضيل: إن لم يكن من وحدات المستدعي النشطة (وRLS لا
   * تُرجع غيرها) يُتجاهل ويبقى الاختيارُ الافتراضي.
   */
  searchParams: Promise<{ herd?: string; season?: string }>;
}) {
  const { herd: wantedHerd, season: wantedSeason } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // RLS limits services to those of verified active providers. Seasons are
  // filtered by owner here: an investor may now read the season of a signed
  // partnership (backlog 129), and a contract is the landowner's to write.
  const { data: seasonRows } = await supabase
    .from("seasons")
    .select("id, name, crop_key, station_key, irrigation, feddans, budget_per_feddan, planting_date")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("planting_date", { ascending: false });

  const { data: herdRows } = await supabase
    .from("herds")
    .select("id, name, head_count, start_date, end_date")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("start_date", { ascending: false });

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
    provider_name: o.service_providers?.name ?? t("مزوّد", "Provider"),
    service_key: o.service_key,
    price_per_unit: Number(o.price_per_unit),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("عقد خدمات جديد", "New service contract")}</h1>
      <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">
        {t(
          "اختر موسمك والخدمات التي تحتاجها، وسيولّد النظام مراحل العقد بتواريخها ومبالغها — محسوبة من موسمك لا مكتوبة يدوياً. كل مرحلة تُدفع بعد إثبات تنفيذها.",
          "Choose your season and the services you need, and the system will generate the contract's phases with their dates and amounts — computed from your season, not typed in by hand. Each phase is paid after proof that it was delivered.",
        )}
      </p>

      <ContractBuilder
        seasons={(seasonRows ?? []) as BuilderSeason[]}
        herds={(herdRows ?? []) as BuilderHerd[]}
        offers={offers}
        initialHerdId={wantedHerd}
        initialSeasonId={wantedSeason}
      />
    </div>
  );
}
