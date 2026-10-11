import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { cropName } from "@/lib/farmLabelsEn";
import PublishRecordToggle from "@/components/PublishRecordToggle";
import type { Season } from "@/types/database";
import FilmPlayer from "@/components/FilmPlayer";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مواسمي | سوداقري", "My seasons | Sudagri") };
}

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const { data } = await supabase
    .from("seasons")
    .select("*")
    .order("planting_date", { ascending: false });

  const seasons = (data ?? []) as Season[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("مواسمي", "My seasons")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              "كل موسم يُسجَّل هنا يبني سجلك كمنفّذ — وهو ما يقرأه محرّك التقييم.",
              "Every season recorded here builds your track record as an operator — and that is what the scoring engine reads.",
            )}
          </p>
        </div>
        <Link
          href="/seasons/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("موسم جديد", "New season")}
        </Link>
      </div>

      <figure className="my-6">
        <FilmPlayer base="/video/harvest-wide" poster="/video/harvest-wide.jpg" label={t(
            "فيلم سوداقري: من الحصاد إلى تقاوي العام القادم",
            "A Sudagri film: from harvest to next year's seed",
          )} />
      </figure>

      {errorMessage && (
        <p className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      )}

      {/* Placed above the list on purpose: the choice is made while looking at
          exactly what it would publish. */}
      <PublishRecordToggle seasonCount={seasons.length} locale={locale} />

      {seasons.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
          {t(
            "لم تسجّل موسماً بعد. ابدأ بموسم واحد — حتى لو كان قد بدأ فعلاً — وسجّل مراحله ومصروفاته لتعرف ربح الفدان الحقيقي في نهايته.",
            "You have not recorded a season yet. Start with one — even if it has already begun — and record its stages and spending so that at the end you know the real profit per feddan.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {seasons.map((s) => {
            const crop = cropName(s.crop_key, locale);
            return (
              <li key={s.id}>
                <Link
                  href={`/seasons/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
                >
                  <div>
                    <h2 className="font-bold" {...arText}>
                      {s.name}
                    </h2>
                    <p className="text-sm text-muted">
                      {crop} · {s.feddans} {t("فدان", "feddans")}
                      {s.location && (
                        <>
                          {" · "}
                          <span {...arText}>{s.location}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <p className="text-muted">{s.planting_date}</p>
                    <span
                      className={`text-xs font-medium ${
                        s.status === "completed"
                          ? "text-primary"
                          : "text-accent"
                      }`}
                    >
                      {s.status === "completed"
                        ? t("مكتمل", "Completed")
                        : s.status === "abandoned"
                          ? t("متوقف", "Stopped")
                          : t("جارٍ", "In progress")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
