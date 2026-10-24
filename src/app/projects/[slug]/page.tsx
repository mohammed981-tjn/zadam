import Link from "next/link";
import { loadLandOffers, loadProjectLands, type LandOffers } from "@/lib/landOffers";
import LandOfferCard from "@/components/invest/LandOfferCard";
import OpenToInvestorsForm from "@/components/invest/OpenToInvestorsForm";
import ActionNotice from "@/components/ActionNotice";
import { investorSignupTo } from "@/lib/authEntry";
import type { OpenLand } from "@/lib/investors";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cropVisual, formatUsd, riskLabel, statusLabel } from "@/lib/format";
import type { Project, ProjectUpdate } from "@/types/database";
import { investmentLive } from "@/lib/platformFlags";
import NotifyMeForm from "@/components/NotifyMeForm";
import { invest } from "./actions";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { error, ok } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select(VISITOR_COLUMNS.projects)
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const typedProject = project as unknown as Project;

  const [{ data: updates }, projectLands] = await Promise.all([
    supabase.from("project_updates").select("*").eq("project_id", typedProject.id).order("created_at", { ascending: false }),
    loadProjectLands(supabase),
  ]);
  // «على أرضٍ موثّقة» (backlog 130): the land's own documents, not the form's ticks.
  const verifiedLand = projectLands.get(typedProject.id);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // «اطلب الشراكة» على صفحة المشروع (البند ١٣٥، المالك 22 أكتوبر): المشروع القائم على
  // أرضٍ موثّقة يحمل طريق الشراكة نفسه الذي في «الفرص» — المال لا يمرّ بالمنصّة.
  // A visitor cannot read projects.land_id (backlog 132), so the land's own card
  // is found only for a member; a visitor is asked to sign in first.
  let landOffers: LandOffers | null = null;
  let landOffer: OpenLand | null = null;
  let landId: string | null = null;
  if (user && verifiedLand) {
    const [{ data: landRow }, offers] = await Promise.all([
      supabase.from("projects").select("land_id").eq("id", typedProject.id).maybeSingle(),
      loadLandOffers(supabase, true),
    ]);
    landId = (landRow as { land_id: string | null } | null)?.land_id ?? null;
    landOffers = offers;
    landOffer = landId ? (offers.lands.find((l) => l.land_id === landId) ?? null) : null;
  }
  const isSubmitter = Boolean(user) && user?.id === typedProject.submitted_by;
  // The owner opens the land to investors here, on the project built on it,
  // rather than being sent to «أراضيّ» for it (the owner, 24 October: «كيف
  // الشراكات حتتمّ؟»). Only a land that is their own.
  type OwnLand = { id: string; investor_models: string[] | null; investor_note: string | null };
  let ownLand: OwnLand | null = null;
  if (user && landId && !landOffer) {
    const { data } = await supabase
      .from("lands")
      .select("id, investor_models, investor_note")
      .eq("id", landId)
      .eq("owner_id", user.id)
      .maybeSingle();
    ownLand = data as OwnLand | null;
  }
  const here = `/projects/${typedProject.slug}`;

  const fundedPct = Math.min(
    100,
    Math.round((typedProject.shares_sold / typedProject.total_shares) * 100),
  );
  const remainingShares = typedProject.total_shares - typedProject.shares_sold;
  const { emoji, gradient } = cropVisual(typedProject.name);

  // Money only moves for a real, published project once the platform goes live.
  const investmentOpen =
    (await investmentLive(supabase)) && !typedProject.is_demo && typedProject.status === "open";

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

        {/* What the last form did: a request sent back here, the land opened. */}
        <ActionNotice ok={ok} error={investmentOpen ? undefined : error} />

        <p className="text-sm text-muted" {...arText}>{typedProject.location}</p>
        <h1 className="mt-1 text-3xl font-black" {...arText}>{typedProject.name}</h1>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            {statusLabel(typedProject.status, locale)}
          </span>
          <span className="rounded-full bg-border/60 px-3 py-1">
            {locale === "en"
              ? `${riskLabel(typedProject.risk_level, locale)} risk`
              : `خطر ${riskLabel(typedProject.risk_level)}`}
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

          <div className="flex h-fit flex-col gap-4">
          {verifiedLand && (
            <section aria-labelledby="partner" className="rounded-2xl border border-primary/30 bg-card p-5">
              <h2 id="partner" className="mb-1 text-lg font-bold">
                {t("الشراكة مع صاحب الأرض", "Partner with the landowner")}
              </h2>
              <p className="mb-3 text-sm text-muted">
                {t(
                  "تختار نوع الشراكة وتكتب لصاحب الأرض، فيصله إشعار. وحين يقبل يُكتب العقد ويوقّعه الطرفان على المنصّة، ثمّ يبدأ الموسم وتتابعه بالصور والمصروفات. المال بينكما مباشرةً، لا يمرّ بالمنصّة.",
                  "Choose a partnership model and write to the landowner, who is notified. Once they accept, the contract is written and both sign it on the platform; then the season starts and you follow it in photos and costs. The money passes between you directly, never through the platform.",
                )}
              </p>
              {landOffer && landOffers ? (
                <ul className="list-none">
                  <LandOfferCard
                    land={landOffer}
                    signedIn
                    fee={landOffers.fee}
                    inspection={landOffers.openInspection.get(landOffer.land_id)}
                    inspectionsOn={landOffers.inspectionsOn}
                    locale={locale}
                    returnTo={here}
                  />
                </ul>
              ) : !user ? (
                <>
                  <Link
                    href={investorSignupTo(here)}
                    className="inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
                  >
                    {t("سجّل كمستثمر لتطلب الشراكة", "Sign up as an investor to request a partnership")}
                  </Link>
                  <p className="mt-2 text-xs text-muted">
                    {t("لك حساب؟ ادخل من الشاشة نفسها، وتعود إلى هذه الصفحة.", "Have an account? Sign in on the same screen and you come back here.")}
                  </p>
                </>
              ) : ownLand ? (
                <div className="rounded-xl bg-background px-3 py-3 text-sm">
                  <p className="font-bold">
                    {t("أرضك لم تُعرض على المستثمرين بعد.", "Your land is not offered to investors yet.")}
                  </p>
                  <p className="mt-1 text-muted">
                    {t(
                      "اختر الشراكات التي تقبلها، فيظهر للمستثمرين هنا وفي «فرص الاستثمار» زرّ «اطلب الشراكة». لا يرون اسمك ولا موقع الأرض حتى تقبل طلباً.",
                      "Choose the partnerships you accept, and investors see «Request a partnership» here and on «Investment opportunities». They see neither your name nor the land's location until you accept a request.",
                    )}
                  </p>
                  <OpenToInvestorsForm
                    landId={ownLand.id}
                    models={ownLand.investor_models ?? []}
                    note={ownLand.investor_note}
                    locale={locale}
                    returnTo={here}
                  />
                </div>
              ) : isSubmitter ? (
                <p className="rounded-xl bg-background px-3 py-2 text-sm">
                  {t(
                    "ليظهر للمستثمرين زرّ «اطلب الشراكة» هنا، افتح أرض هذا المشروع لهم من «أراضيّ» واختر نوع الشراكة الذي تقبله.",
                    "For investors to see «Request a partnership» here, open this project's land to them from «My land» and choose the partnership models you accept.",
                  )}{" "}
                  <Link href="/lands" className="font-bold text-primary underline">
                    {t("أراضيّ", "My land")}
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {t(
                    "لم يفتح صاحب الأرض باب الشراكة بعد. اترك بياناتك أدناه وسنبلغك.",
                    "The landowner has not opened partnership yet. Leave your details below and we will tell you.",
                  )}
                </p>
              )}
            </section>
          )}
          <aside className="h-fit rounded-2xl border border-border bg-card p-5">
            {!investmentOpen ? (
              <>
                <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t("قريباً", "Coming soon")}
                </span>
                <h2 className="mb-2 text-lg font-bold">
                  {t("الدفع عبر المنصّة لم يُفتح بعد", "Paying through the platform is not open yet")}
                </h2>
                <p className="mb-4 text-sm text-muted">
                  {t(
                    "لا تستقبل المنصّة أموالاً حتى تكتمل الترتيبات القانونية وترتيبُ حفظ المال. اترك بياناتك وسنبلغك أوّل ما يُفتح.",
                    "The platform accepts no money until the legal arrangements and a way to hold the money are in place. Leave your details and we will tell you as soon as it opens.",
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
    </div>
  );
}
