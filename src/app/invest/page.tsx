import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import InvestTabs from "@/components/invest/InvestTabs";
import ProjectCard from "@/components/ProjectCard";
import LandOfferCard from "@/components/invest/LandOfferCard";
import { lbl } from "@/lib/partners";
import { INVESTOR_MODEL_DETAIL, INVESTOR_MODEL_LABEL, INVESTOR_MODELS, RISK_NOTICE } from "@/lib/investors";
import { feeLine } from "@/lib/inspections";
import { loadLandOffers, loadProjectLands } from "@/lib/landOffers";
import { card } from "@/lib/ui";
import type { Project } from "@/types/database";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { investorSignupTo } from "@/lib/authEntry";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "فرص الاستثمار | سوداقري", "Investment opportunities | Sudagri"),
    description: tr(
      locale,
      "أراضٍ زراعيّة وثّقتها سوداقري يبحث أصحابها عن شريك، ومشاريع مطروحة — مشاركة بالمحصول أو إيجار أو تمويل مدخلات.",
      "Farmland Sudagri has verified whose owners are looking for a partner, and projects on offer — crop sharing, lease or input finance.",
    ),
  };
}

/**
 * فرصُ الاستثمار (البند ١٢٤).
 *
 * The owner, 21 October: «اجعل لها صفحة خاصّة بالفرص والعروض للمستثمرين،
 * وكيف يستفيد المستثمر من صاحب الأرض بواسطة سوداقري».
 *
 * Investors had only `/projects`, which is empty until a farmer writes a full
 * opportunity with shares and a price. Most farmers will not; what they have
 * is verified land and no money for the season. So the page leads with those
 * lands, each with the partnership models its owner accepts, and with what the
 * platform does between the two — which is everything except hold the money.
 */
export default async function InvestPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [offers, { data: projectRows }, projectLands] = await Promise.all([
    loadLandOffers(supabase, Boolean(user)),
    supabase.from("projects").select(VISITOR_COLUMNS.projects).neq("status", "draft").order("created_at", { ascending: false }).limit(6),
    loadProjectLands(supabase),
  ]);
  const { lands, fee, stats } = offers;
  const landError = offers.failed;
  const projects = (projectRows ?? []) as unknown as Project[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader icon="chart" eyebrow={t("للمستثمرين", "For investors")} title={t("فرص الاستثمار", "Investment opportunities")}>
        {t(
          "أراضٍ وثّقت سوداقري مستنداتها يبحث أصحابها عن شريك، ومشاريع مطروحة. أنت تموّل، وصاحب الأرض يقدّم الأرض والماء والعمل، وسوداقري تتحقّق وتتابع. المال لا يمرّ بالمنصّة، ولا أحد يَعِدك بربح.",
          "Land whose documents Sudagri has verified, whose owners are looking for a partner, and projects on offer. You finance, the owner brings the land, the water and the work, and Sudagri verifies and follows up. The money does not pass through the platform, and no one promises you a profit.",
        )}
      </PageHeader>

      <InvestTabs active="/invest" locale={locale} />
      <ActionNotice ok={sp.ok} error={sp.error} />

      {/* ── كيف تبدأ ───────────────────────────────────────────────── */}
      {/* The owner, 24 October: «كيف حيسجّل المستثمر، وكيف الشراكات حتتمّ؟» —
          the whole way in four lines, before the models and the lands. */}
      <section aria-labelledby="start" className="mb-10">
        <h2 id="start" className="title-bar mb-4 text-lg font-black">
          {t("كيف تبدأ كمستثمر", "How to start as an investor")}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              t("أنشئ حسابك", "Create your account"),
              t("برقم جوالك أو بريدك، واختر «أستثمر». مجّاناً.", "With your mobile number or email; choose «I invest». Free."),
            ],
            [
              t("اختر أرضاً واطلب الشراكة", "Choose land, request a partnership"),
              t("من «أراضٍ تبحث عن شريك» أدناه: أرضٌ موثّقة، ونموذج شراكةٍ يقبله صاحبها، ورسالةٌ منك.", "From «Land looking for a partner» below: verified land, a model its owner accepts, and a message from you."),
            ],
            [
              t("يقبل صاحب الأرض", "The owner accepts"),
              t("يصله إشعار؛ وحين يقبل ترى اسمه وهاتفه وموقع الأرض.", "They are notified; once they accept you see their name, phone and the land's location."),
            ],
            [
              t("العقد ثمّ الموسم", "The agreement, then the season"),
              t("تكتبان العقد وتوقّعانه على المنصّة، وتتابع الموسم بالصور والمصروفات. المال بينكما مباشرةً.", "You write and sign the agreement on the platform, and follow the season in photos and costs. The money passes between you directly."),
            ],
          ].map(([title, body], i) => (
            <li key={title} className={`${card} flex gap-3`}>
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                {locale === "en" ? i + 1 : (i + 1).toLocaleString("ar-SA")}
              </span>
              <span>
                <strong className="block">{title}</strong>
                <span className="mt-1 block text-sm leading-6 text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        {!user && (
          <Link
            href={investorSignupTo("/invest")}
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground hover:opacity-90"
          >
            {t("سجّل كمستثمر", "Sign up as an investor")}
          </Link>
        )}
      </section>

      {/* ── طرق الشراكة ───────────────────────────────────────────── */}
      <section aria-labelledby="models" className="mb-10">
        <h2 id="models" className="title-bar mb-4 text-lg font-black">
          {t("كيف يستفيد المستثمر من صاحب الأرض", "How an investor and a landowner work together")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INVESTOR_MODELS.map((m) => (
            <article key={m} className={card}>
              <h3 className="font-black text-primary">{lbl(INVESTOR_MODEL_LABEL[m], locale)}</h3>
              <p className="mt-2 text-sm leading-6">
                <span className="font-bold">{t("المستثمر: ", "Investor: ")}</span>
                {lbl(INVESTOR_MODEL_DETAIL[m].investor, locale)}
              </p>
              <p className="mt-1 text-sm leading-6">
                <span className="font-bold">{t("صاحب الأرض: ", "Landowner: ")}</span>
                {lbl(INVESTOR_MODEL_DETAIL[m].owner, locale)}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">
          {t(
            "النسبة والأجرة والمدّة يتّفق عليها الطرفان كتابةً — سوداقري لا تحدّدها ولا تضمنها.",
            "The share, the rent and the term are agreed in writing between the two — Sudagri neither sets nor guarantees them.",
          )}
        </p>
        {/* البند ١٣٦: ما لم تقله المنصّات التي انهارت. */}
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-7">
          <span className="font-bold">{t("قبل أن تبدأ: ", "Before you start: ")}</span>
          {lbl(RISK_NOTICE, locale)}
        </p>
      </section>

      {/* ── أراضٍ تبحث عن شريك ─────────────────────────────────────────── */}
      <section aria-labelledby="lands" className="mb-10">
        <h2 id="lands" className="title-bar mb-4 text-lg font-black">
          {t("أراضٍ تبحث عن شريك", "Land looking for a partner")}{" "}
          {/* «(0)» reads as «٥» to an Arabic reader; the empty notice below says it instead. */}
          {lands.length > 0 && <span className="text-muted">({lands.length})</span>}
        </h2>

        {landError ? (
          <p className={`${card} text-sm text-muted`}>
            {t("تعذّرت قراءة الأراضي الآن — والخلل عندنا. أعد المحاولة بعد قليل.", "We couldn't load the land just now — the fault is ours. Try again shortly.")}
          </p>
        ) : lands.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm leading-7 text-muted">
            <p className="font-bold text-foreground">{t("لا أرض معروضة بعد.", "No land on offer yet.")}</p>
            <p>
              {t(
                "تظهر هنا الأرض بعد أن توثّقها الإدارة ويفتحها صاحبها للمستثمرين من صفحة «أراضيّ».",
                "Land appears here once the administrators have verified it and its owner opens it to investors from «My land».",
              )}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {lands.map((l) => (
              <LandOfferCard
                key={l.land_id}
                land={l}
                signedIn={Boolean(user)}
                fee={fee}
                inspection={offers.openInspection.get(l.land_id)}
                inspectionsOn={offers.inspectionsOn}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── مشاريع مطروحة ──────────────────────────────────────────────── */}
      <section aria-labelledby="projects" className="mb-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="projects" className="title-bar text-lg font-black">
            {t("مشاريع مطروحة", "Projects on offer")}{" "}
            {projects.length > 0 && <span className="text-muted">({projects.length})</span>}
          </h2>
          <Link href="/projects" className="text-sm font-bold text-primary underline">
            {t("كلّ المشاريع", "All projects")}
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
            {t(
              "لا مشروع مطروح بعد. المشروع فرصةٌ كتبها صاحبها بالمحصول والحصص، وراجعتها الإدارة قبل نشرها.",
              "No project on offer yet. A project is an opportunity its owner wrote out with a crop and shares, reviewed by the administrators before publication.",
            )}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} locale={locale} verifiedLand={projectLands.get(p.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── خطوات الشراكة، وما تقدّمه سوداقري ─────────────────────────── */}
      <section aria-labelledby="steps" className="mb-10 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 id="steps" className="title-bar mb-4 text-lg font-black">{t("خطوات الشراكة", "The steps")}</h2>
          <ol className="flex flex-col gap-3">
            {[
              t("تتصفّح الأراضي: الولاية والمساحة والتربة والماء، بلا اسمٍ ولا موقع.", "Browse the land: state, area, soil and water — no name, no location."),
              t("ترسل طلب شراكة بالنموذج الذي يقبله صاحب الأرض، فيصله إشعار.", "Send a request in a model the owner accepts; they are notified."),
              t("يقبل صاحب الأرض، فيرى كلٌّ منكما اسم الآخر وهاتفه، وترى موقع الأرض.", "The owner accepts; each of you sees the other's name and phone, and you see where the land is."),
              t(
                "تعاين الأرض بنفسك، أو تطلب تقرير معاينةٍ مستقلّاً من سوداقري، وتقرأ دراسة جدواها: الماء والتكلفة والمخاطر.",
                "Inspect the land yourself, or ask Sudagri for an independent inspection report, and read its feasibility study: water, cost and risk.",
              ),
              t("تتّفقان كتابةً على النسبة أو الأجرة والمدّة، ثمّ تدفع مباشرةً مرحلةً بمرحلة بعد دليلها.", "Agree the share or rent and the term in writing, then pay directly, stage by stage, after each stage's evidence."),
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                  {(i + 1).toLocaleString(locale === "en" ? "en-US" : "ar-EG")}
                </span>
                <span className="pt-0.5 text-sm leading-6">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="title-bar mb-4 text-lg font-black">{t("ما تقدّمه سوداقري بين الطرفين", "What Sudagri does between the two")}</h2>
          <ul className="flex flex-col gap-2 text-sm leading-6">
            {[
              [t("أرضٌ موثّقة", "Verified land"), t("راجعت الإدارة مستنداتها قبل أن تُعرض.", "The administrators checked its documents before it was shown."), "/how-we-work"],
              [t("خصوصيّةٌ حتى القبول", "Privacy until acceptance"), t("لا اسمَ ولا هاتفَ ولا موقعَ قبل موافقة صاحب الأرض.", "No name, phone or location before the owner agrees."), null],
              [t("دراسة جدوى للأرض", "A feasibility study"), t("الماء والتكلفة والمخاطر بالأرقام قبل أن تقرّر.", "Water, cost and risk in figures before you decide."), "/tools/feasibility"],
              [
                t("تقرير معاينةٍ مستقلّ", "An independent inspection"),
                `${t("مفتّشٌ ليس طرفاً يزور الأرض ويكتب تقريراً بصوره.", "An inspector who is party to nothing visits the land and writes a report with photos.")} ${feeLine(fee, locale)}${
                  stats && stats.reported > 0
                    ? t(
                        ` كُتب ${stats.reported} تقريراً: ${stats.clear} سليمة، و${stats.conditional} بشروط، و${stats.not_recommended} لا يُنصح بها.`,
                        ` ${stats.reported} written: ${stats.clear} sound, ${stats.conditional} with conditions, ${stats.not_recommended} not recommended.`,
                      )
                    : ""
                }`,
                null,
              ],
              [t("شركات للإشراف والعمل", "Companies for supervision and work"), t("حرثٌ وريّ وحصاد وإشراف من شركاتٍ موثّقة.", "Ploughing, irrigation, harvest and supervision from verified companies."), "/partners"],
              [t("السوق والصادر", "The market and export"), t("أسعار المحاصيل اليوم، وملفّ الصادر للمشترين.", "Today's crop prices, and the export file for buyers."), "/market"],
              [t("المال لا يمرّ بنا", "The money does not pass through us"), t("تدفع مباشرةً، مرحلةً بمرحلة، بعد دليل المرحلة.", "You pay directly, stage by stage, after each stage's evidence."), null],
            ].map(([h, d, href]) => (
              <li key={String(h)} className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                <span className="font-bold text-primary">{h}</span> — {d}{" "}
                {href && (
                  <Link href={String(href)} className="text-xs font-bold text-leaf underline">
                    {t("المزيد", "More")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── لصاحب الأرض ────────────────────────────────────────────────── */}
      <section className="hero-band rounded-3xl px-5 py-6 text-white">
        <h2 className="text-lg font-black">{t("عندك أرض وتبحث عن ممّول؟", "Have land and looking for finance?")}</h2>
        <p className="mt-1 text-sm leading-6 text-white/90">
          {t(
            "سجّلها مجّاناً وارفع مستنداتها. بعد أن توثّقها الإدارة، افتحها للمستثمرين من «أراضيّ» واختر نماذج الشراكة التي تقبلها.",
            "Register it for free and upload its documents. Once the administrators verify it, open it to investors from «My land» and choose the partnership models you accept.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={user ? "/lands" : "/signup?next=/lands"} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#ca2c72]">
            {user ? t("أراضيّ", "My land") : t("سجّل مجّاناً", "Sign up free")}
          </Link>
          <Link href="/lands/new" className="rounded-xl px-4 py-2 text-sm font-bold text-white ring-1 ring-white/60">
            {t("سجّل أرضاً", "Register land")}
          </Link>
        </div>
      </section>
    </div>
  );
}
