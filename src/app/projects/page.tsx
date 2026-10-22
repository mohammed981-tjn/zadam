import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/types/database";
import FilmPlayer from "@/components/FilmPlayer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import InvestTabs from "@/components/invest/InvestTabs";
import LandOfferCard from "@/components/invest/LandOfferCard";
import { loadLandOffers, loadProjectLands } from "@/lib/landOffers";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "المشاريع المطروحة · سوداقري", "Projects on offer · Sudagri"),
    description: tr(
      locale,
      "أراضٍ زراعيّة موثّقة يبحث أصحابها عن شريك، ومشاريع مطروحة للاستثمار في السودان — وتراجعها الإدارة قبل نشرها.",
      "Verified farmland whose owners are looking for a partner, and projects on offer for investment in Sudan — reviewed by the administrators before publication.",
    ),
  };
}

/**
 * فهرسُ المشاريع — والمسارُ الوحيد إلى جواز المزرعة.
 *
 * WHY ITS ABSENCE MATTERED MORE THAN IT LOOKS
 *
 * `src/app/projects/` held only `[slug]`, so `/projects` was a 404. That alone
 * is a broken route. The larger cost is what it cut off: `/farmers/[id]` — the
 * farm passport — is linked from exactly one place in the entire application,
 * the project detail page. With no index, a visitor could reach a project only
 * by being handed its slug, and could reach a passport only through that.
 *
 * So the trust layer this platform spent a phase building had no navigable path
 * to it at all. Building the index restores the chain: fهرس → مشروع → جواز.
 *
 * وحالةُ اليوم تُقال كما هي
 *
 * Every project in the database is `draft`, so this page is honestly empty
 * right now — and it says so in the words the home page uses, because a visitor
 * who reads «لا توجد مشاريع» in two different phrasings on two pages learns
 * only that the site is inconsistent.
 */
export default async function ProjectsPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The investor browses projects, not land (the owner, 22 October, backlog
  // 129) — so the verified land offered to investors is here too, on the same
  // card as on «فرص الاستثمار», and each project says whether a verified land
  // stands under it.
  const [offers, projectLands] = await Promise.all([loadLandOffers(supabase, Boolean(user)), loadProjectLands(supabase)]);

  const { data, error } = await supabase
    .from("projects")
    .select(VISITOR_COLUMNS.projects)
    // نفسُ مِصفاة الصفحة الأولى: المسوّدةُ ليست عرضاً، وعرضُها هنا وحدها كان
    // سيجعل الفهرسَ يناقض الصفحةَ التي يُكمّلها.
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("projects: read failed", error);
  }

  const projects = (data ?? []) as unknown as Project[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <InvestTabs active="/projects" locale={locale} />
      <h1 className="text-2xl font-bold sm:text-3xl">{t("المشاريع المطروحة", "Projects on offer")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        {t(
          "طريقان إلى الاستثمار: أرضٌ موثّقة يبحث صاحبها عن شريك — مشاركةً بالمحصول أو إيجاراً أو تمويلاً — بلا اسمه ولا موقعها حتى يقبل؛ أو مشروعٌ كتبه صاحبه بالمحصول والحصص وراجعته الإدارة. والمشروع القائم على أرضٍ وثّقتها الإدارة يحمل شارة «على أرضٍ موثّقة». وما تشهد به المنصّة هو",
          "Two ways to invest: verified land whose owner is looking for a partner — crop sharing, lease or finance — without their name or its location until they accept; or a project its owner wrote out with a crop and shares, reviewed by the administrators. A project standing on land the administrators verified carries the «On verified land» badge. What the platform vouches for is",
        )}{" "}
        <strong>{t("أنّ ما يقوله العرض مسنودٌ بأوراق", "that what the offer claims is backed by documents")}</strong>{" "}
        {t(
          "— لا أنّ الموسم سيربح. تلك تبقى مخاطرةً تخصّك.",
          "— not that the season will make a profit. That remains your risk.",
        )}
      </p>

      {offers.lands.length > 0 && (
        <section aria-labelledby="lands" className="mt-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="lands" className="title-bar text-lg font-black">
              {t("أراضٍ موثّقة تبحث عن شريك", "Verified land looking for a partner")}{" "}
              <span className="text-muted">({offers.lands.length})</span>
            </h2>
            <Link href="/invest" className="text-sm font-bold text-primary underline">
              {t("كيف تعمل الشراكة", "How the partnership works")}
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.lands.map((l) => (
              <LandOfferCard
                key={l.land_id}
                land={l}
                signedIn={Boolean(user)}
                fee={offers.fee}
                inspection={offers.openInspection.get(l.land_id)}
                inspectionsOn={offers.inspectionsOn}
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}

      <figure className="my-6">
        <FilmPlayer base="/video/projects-wide" poster="/video/projects-wide.jpg" label={t("فيلم سوداقري: حين نتّفق نزرع أكثر", "A Sudagri film: when we agree, we grow more")} />
      </figure>

      {error ? (
        <p className="mt-8 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
          {t("تعذّر قراءة المشاريع الآن —", "We couldn't load the projects just now —")}{" "}
          <strong>{t("والخلل عندنا", "the fault is ours")}</strong>
          {t("، لا أنّه لا مشاريع. أعد المحاولة بعد قليل.", ", not a sign that there are no projects. Try again in a moment.")}
        </p>
      ) : projects.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center">
          <h2 className="mb-2 font-bold">{t("لا توجد مشاريع مطروحة بعد", "No projects on offer yet")}</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
            {t(
              "المشروع فرصةٌ يكتبها صاحبها بالمحصول والحصص، وتراجعها الإدارة قبل نشرها.",
              "A project is an opportunity its owner writes out with a crop and shares; the administrators review it before publication.",
            )}{" "}
            <Link href="/feedback" className="text-primary underline">
              {t("سجّل اهتمامك", "Register your interest")}
            </Link>{" "}
            {t("وسنبلغك أوّل ما يُطرح مشروع موثّق.", "and we will let you know as soon as a documented project is listed.")}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} locale={locale} verifiedLand={projectLands.get(project.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
