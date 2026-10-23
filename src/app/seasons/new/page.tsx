import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import SeasonForm, { type SeasonFromAgreement, type SeasonLandOption } from "@/components/SeasonForm";
import type { AgreementView } from "@/lib/agreements";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "موسم جديد | سوداقري", "New season | Sudagri") };
}

export default async function NewSeasonPage({
  searchParams,
}: {
  /** `?land=` from a land card, `?agreement=` from a signed agreement (backlog 129). */
  searchParams: Promise<{ land?: string; agreement?: string }>;
}) {
  const { land: wantedLand, agreement: agreementId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/seasons/new"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // Projects the season can be attached to: the caller's own. RLS returns every
  // published project, and attaching a season to someone else's would show this
  // field's progress on their offer — seasons_links_guard refuses it.
  const [{ data: projectRows }, { data: landRows }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("submitted_by", user.id).order("name"),
    supabase.from("lands").select("id, name, state, locality, station_key, feddans").eq("owner_id", user.id).order("created_at"),
  ]);
  const lands: SeasonLandOption[] = (
    (landRows ?? []) as { id: string; name: string; state: string | null; locality: string | null; station_key: string; feddans: number }[]
  ).map((l) => ({
    id: l.id,
    name: l.name,
    location: [l.state, l.locality].filter(Boolean).join(" · "),
    stationKey: l.station_key,
    feddans: Number(l.feddans),
  }));

  // A signed agreement fills the season: its crop and season for the name, its
  // area, its land. Only its landowner starts it.
  let agreement: SeasonFromAgreement | undefined;
  if (agreementId) {
    const { data } = await supabase.rpc("partnership_agreement_view", { p_agreement: agreementId });
    const a = data as AgreementView | null;
    const { data: row } = await supabase.from("partnership_agreements").select("land_id").eq("id", agreementId).maybeSingle();
    if (a && a.me === "owner" && a.status === "signed" && row) {
      agreement = {
        id: agreementId,
        landId: (row as { land_id: string }).land_id,
        name: [a.terms.crop, a.terms.season].filter(Boolean).join(" — "),
        feddans: Number(a.terms.feddans ?? 0) || 1,
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("موسم زراعي جديد", "New growing season")}
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "أدخل محصولك ومنطقتك وتاريخ زراعتك، وسيولّد النظام خطة المراحل بتواريخها واحتياج كل مرحلة من الماء وحصتها من الميزانية — محسوبة لا مكتوبة.",
          "Enter your crop, your zone and your planting date, and the system will generate the stage plan with its dates, each stage's water need and its share of the budget — calculated, not typed in.",
        )}
      </p>
      <SeasonForm
        today={new Date().toISOString().slice(0, 10)}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
        lands={lands}
        landId={wantedLand}
        agreement={agreement}
      />
    </div>
  );
}
