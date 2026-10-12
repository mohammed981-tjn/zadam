import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { NEW_CROP_INFO } from "@/lib/newCrops";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "محاصيل جديدة تستحق التجربة في السودان | سوداقري", "New crops worth trying in Sudan | Sudagri"),
    description: tr(
      locale,
      "فول الصويا والعنب والزيتون والكينوا والقوار والكانولا: ما الدليل على زراعتها في السودان، وما يُحذر منه، ودراسة جدوى لكلّ منها.",
      "Soybean, grapes, olive, quinoa, guar and canola: the evidence they grow in Sudan, what to watch for, and a feasibility study for each.",
    ),
  };
}

export default async function NewCropsPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("محاصيل جديدة تستحق التجربة", "New crops worth trying")}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        {t(
          "محاصيل لا يزرعها السودان تقليدياً، ولها دليل منشور على أنّها تنجح هنا أو في مناخ قريب. لكلّ واحد ما وجدناه من تجارب، وما يُحذر منه، وزرّ يفتح دراسة الجدوى عليه مباشرة.",
          "Crops Sudan does not traditionally grow, with published evidence that they succeed here or in a similar climate. Each has the trials we found, what to watch for, and a button that opens the feasibility study on it.",
        )}
      </p>

      <div className="flex flex-col gap-4">
        {NEW_CROP_INFO.map((c) => (
          <article key={c.key} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">{en ? c.en : c.ar}</h2>
            <p className="mt-2 text-sm leading-relaxed">{en ? c.evidence.en : c.evidence.ar}</p>
            {c.caution && (
              <p className="mt-2 rounded-lg bg-danger/5 px-3 py-2 text-sm leading-relaxed text-danger">
                {en ? c.caution.en : c.caution.ar}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              {c.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="underline" lang="en" dir="ltr">
                  {s.label}
                </a>
              ))}
            </div>
            <div className="mt-4">
              {c.inStudy ? (
                <Link
                  href={`/tools/feasibility?crop=${c.key}`}
                  className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  {t("جرّبه في دراسة الجدوى", "Try it in the feasibility study")}
                </Link>
              ) : (
                <span className="text-xs text-muted">
                  {t("ماؤه لا يُحسب بعد — لا أطوار نموّ منشورة له", "Its water is not costed yet — no published growth stages")}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8">
        <ShareWhatsApp
          text={t("محاصيل جديدة تستحق التجربة في السودان — سوداقري", "New crops worth trying in Sudan — Sudagri")}
          path="/tools/new-crops"
          locale={locale}
        />
      </div>
    </div>
  );
}
