import Link from "next/link";
import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/Explain";
import {
  SPECIES_LABEL,
  SPECIES_LABEL_EN,
  PURPOSE_LABEL,
  PURPOSE_LABEL_EN,
} from "@/lib/livestock";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import type { Herd } from "@/types/database";
import FilmPlayer from "@/components/FilmPlayer";
import AnimalDiseaseWatch from "@/components/AnimalDiseaseWatch";
import { fetchDiseaseEvents } from "@/lib/animalDisease";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "دورات الإنتاج الحيواني | سوداقري",
      "Livestock production cycles | Sudagri",
    ),
  };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function HerdsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/herds"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const { data: rows } = await supabase
    .from("herds")
    .select("*")
    .order("start_date", { ascending: false });

  const herds = (rows ?? []) as Herd[];
  const [{ data: landRows }, diseaseEvents] = await Promise.all([
    supabase.from("lands").select("name, state, latitude, longitude").eq("owner_id", user.id),
    fetchDiseaseEvents(),
  ]);
  const myLands = (landRows ?? []) as { name: string; state: string; latitude: number | null; longitude: number | null }[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t("دورات الإنتاج الحيواني", "Livestock production cycles")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              "كل دورة مقسّمة إلى مراحل بتواريخها وتقدير علفها، ويمكن التعاقد على خدماتها البيطرية والتغذوية بالمراحل.",
              "Each cycle is divided into stages with their dates and feed estimates, and its veterinary and feeding services can be contracted stage by stage.",
            )}
          </p>
        </div>
        <Link
          href="/herds/new"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("دورة جديدة", "New cycle")}
        </Link>
      </div>

      <figure className="my-6">
        <FilmPlayer base="/video/herds-wide" poster="/video/herds-wide.jpg" label={t(
            "فيلم سوداقري: ثروةٌ تمشي على الأرض",
            "A Sudagri film: wealth that walks the land",
          )} />
      </figure>

      <AnimalDiseaseWatch events={diseaseEvents} lands={myLands} locale={locale} />

      {herds.length === 0 ? (
        <EmptyState
          title={t("لا توجد دورات بعد", "No cycles yet")}
          action={
            <Link
              href="/herds/new"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("أنشئ أول دورة", "Create your first cycle")}
            </Link>
          }
        >
          {t(
            "الدورة هي ما يقابل الموسم في الجانب الحيواني: قطيع له بداية ونهاية، ومراحل من الاقتناء والحجر الصحي حتى التسويق، لكل مرحلة تاريخ وميزانية.",
            "A cycle is the livestock counterpart of a season: a herd with a start and an end, and stages from acquisition and quarantine through to marketing, each with its own date and budget.",
          )}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {herds.map((h) => (
            <li key={h.id}>
              <Link
                href={`/herds/${h.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50"
              >
                <span>
                  <span className="font-medium" {...arText}>
                    {h.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {(en ? SPECIES_LABEL_EN : SPECIES_LABEL)[h.species]} —{" "}
                    {(en ? PURPOSE_LABEL_EN : PURPOSE_LABEL)[h.purpose]}
                    {h.breed && (
                      <>
                        {" — "}
                        <span {...arText}>{h.breed}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="text-sm font-bold">
                  {n0(h.head_count)} {t("رأس", "head")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
