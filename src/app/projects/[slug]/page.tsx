import Link from "next/link";
import { loadProjectLands } from "@/lib/landOffers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cropVisual, formatUsd, riskLabel, statusLabel } from "@/lib/format";
import type { Project, ProjectUpdate } from "@/types/database";
import { INVESTMENT_LIVE } from "@/lib/config";
import NotifyMeForm from "@/components/NotifyMeForm";
import { invest } from "./actions";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const typedProject = project as Project;

  const [{ data: updates }, projectLands] = await Promise.all([
    supabase.from("project_updates").select("*").eq("project_id", typedProject.id).order("created_at", { ascending: false }),
    loadProjectLands(supabase),
  ]);
  // «على أرضٍ موثّقة» (backlog 130): the land's own documents, not the form's ticks.
  const verifiedLand = projectLands.get(typedProject.id);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fundedPct = Math.min(
    100,
    Math.round((typedProject.shares_sold / typedProject.total_shares) * 100),
  );
  const remainingShares = typedProject.total_shares - typedProject.shares_sold;
  const { emoji, gradient } = cropVisual(typedProject.name);

  // Money only moves for a real, published project once the platform goes live.
  const investmentOpen =
    INVESTMENT_LIVE && !typedProject.is_demo && typedProject.status === "open";

  return (
    <div>
      <div
        className={`flex h-40 items-center justify-center bg-gradient-to-br ${gradient} text-7xl`}
        aria-hidden
      >
        {emoji}
      </div>
      <div className="mx-auto max-w-4xl px-4 py-10">
        {typedProject.is_demo && (
          <div className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            <strong className="font-bold">{t("نموذج توضيحي.", "Illustrative example.")}</strong>{" "}
            {t(
              "هذا المشروع مُدخل لعرض شكل المنصة فقط — لا يوجد على الأرض مشروع بهذا الاسم ولا أرض مخصصة له، ولا يمكن الاستثمار فيه. المشاريع الحقيقية ستُنشر بعد توثيقها قانونياً ومعاينتها ميدانياً.",
              "This project was entered only to show what the platform looks like — there is no project by this name on the ground and no land set aside for it, and it cannot be invested in. Real projects will be published after legal documentation and a field inspection.",
            )}
          </div>
        )}

        <p className="text-sm text-muted" {...arText}>{typedProject.location}</p>
        <h1 className="mt-1 text-3xl font-black" {...arText}>{typedProject.name}</h1>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            {statusLabel(typedProject.status, locale)}
          </span>
          <span className="rounded-full bg-border/60 px-3 py-1">
            {locale === "en"
              ? `${riskLabel(typedProject.risk_level, locale)} risk`
              : `مخاطرة ${riskLabel(typedProject.risk_level)}`}
          </span>
          <span className="rounded-full bg-border/60 px-3 py-1">
            {typedProject.total_feddans} {t("فدان", "feddans")}
          </span>
          {verifiedLand && (
            <span className="rounded-full bg-leaf/10 px-3 py-1 font-bold text-leaf">
              {t(
                `على أرضٍ موثّقة · ${verifiedLand.documents} من ${verifiedLand.required} مستندات في الملفّ`,
                `On verified land · ${verifiedLand.documents} of ${verifiedLand.required} documents on file`,
              )}
            </span>
          )}
          {typedProject.expected_annual_return && (
            <span className="rounded-full bg-border/60 px-3 py-1">
              {t("عائد سنوي متوقع", "Expected annual return")} {typedProject.expected_annual_return}%
            </span>
          )}
        </div>

        {typedProject.description && (
          <p className="mt-6 leading-relaxed text-foreground/90" {...arText}>
            {typedProject.description}
          </p>
        )}

        {typedProject.submitted_by && (
          <Link
            href={`/farmers/${typedProject.submitted_by}`}
            className="mt-4 inline-block text-sm text-primary underline"
          >
            {t("اطّلع على سجل المنفّذ ومؤشر ثقته", "See the operator's record and trust score")}
          </Link>
        )}

        <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_320px]">
          <section>
            <h2 className="mb-4 text-lg font-bold">{t("آخر التقارير الميدانية", "Latest field reports")}</h2>
            {!updates || updates.length === 0 ? (
              <p className="text-sm text-muted">
                {t("لا توجد تقارير منشورة بعد لهذا المشروع.", "No reports published for this project yet.")}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {(updates as ProjectUpdate[]).map((update) => (
                  <li
                    key={update.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold" {...arText}>{update.title}</h3>
                      <time className="text-xs text-muted">
                        {new Date(update.created_at).toLocaleDateString(
                          locale === "en" ? "en-GB" : "ar-EG",
                        )}
                      </time>
                    </div>
                    {update.body && (
                      <p className="mt-2 text-sm text-foreground/80" {...arText}>
                        {update.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-border bg-card p-5">
            {!investmentOpen ? (
              <>
                <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t("قريباً", "Coming soon")}
                </span>
                <h2 className="mb-2 text-lg font-bold">
                  {t("الاستثمار لم يُفتح بعد", "Investment is not open yet")}
                </h2>
                <p className="mb-4 text-sm text-muted">
                  {t(
                    "نحن نبني المنصة الآن ولا نستقبل أي أموال حتى تكتمل الترتيبات القانونية وتوثيق المشاريع. اترك بياناتك وسنبلغك أول ما يُفتح باب الاستثمار.",
                    "We are building the platform now and accept no money until the legal arrangements and project documentation are complete. Leave your details and we will tell you as soon as investment opens.",
                  )}
                </p>
                <p className="mb-4 text-sm">
                  {t("سعر الحصة الاسترشادي:", "Indicative share price:")}{" "}
                  <span className="font-bold">
                    {formatUsd(typedProject.price_per_share, locale)}
                  </span>
                </p>
                <NotifyMeForm interest={`مشروع: ${typedProject.name}`} />
              </>
            ) : (
              <>
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${fundedPct}%` }}
                  />
                </div>
                <p className="mb-4 text-sm text-muted">
                  {locale === "en"
                    ? `${fundedPct}% funded · ${remainingShares} of ${typedProject.total_shares} shares left`
                    : <>{fundedPct}% ممول · متبقي {remainingShares} حصة من أصل{" "}
                  {typedProject.total_shares}</>}
                </p>

                {error && (
                  <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                )}

                <form action={invest} className="flex flex-col gap-3">
                  <input
                    type="hidden"
                    name="project_id"
                    value={typedProject.id}
                  />
                  <input type="hidden" name="slug" value={typedProject.slug} />
                  {/*
                    No price field. invest() reads the price from the project
                    row and ignores anything sent here — the field that used to
                    sit in this spot is what made the forgery possible, and
                    leaving it behind only invites someone to wire it back up.
                  */}
                  <label className="flex flex-col gap-1 text-sm">
                    {t("عدد الحصص (سعر الحصة", "Number of shares (share price")}{" "}
                    {formatUsd(typedProject.price_per_share, locale)})
                    <input
                      type="number"
                      name="shares"
                      min={1}
                      max={remainingShares}
                      defaultValue={1}
                      required
                      className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
                  >
                    {t("استثمر الآن", "Invest now")}
                  </button>
                  {!user && (
                    <p className="text-xs text-muted">
                      {t("سيُطلب منك تسجيل الدخول أولاً.", "You will be asked to sign in first.")}
                    </p>
                  )}
                </form>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
