import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import OpportunityForm from "@/components/OpportunityForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { readOfferableLand } from "@/lib/landOpportunity";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "ارفع فرصة زراعية | سوداقري", "Submit a farming opportunity | Sudagri"),
  };
}

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ land?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(loginTo("/opportunities/new"));

  // «ارفع فرصة للمستثمرين» on a verified land opens this page with ?land=
  // (backlog 123), and the form starts from that land.
  const fromLand = sp.land ? await readOfferableLand(supabase, user.id, sp.land) : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_seasons, reporting_rate")
    .eq("id", user.id)
    .single();

  const p = profile as {
    completed_seasons: number;
    reporting_rate: number;
  } | null;

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("ارفع فرصة زراعية", "Submit a farming opportunity")}</h1>
      <p className="mb-2 mt-2 text-sm text-muted">
        {locale === "en" ? (
          <>
            Fill in the details and your score appears <strong>instantly</strong>, with the
            reason for each factor — so you know exactly what raises it and what lowers it
            before you submit.
          </>
        ) : (
          <>
            املأ البيانات وستظهر لك درجة التقييم <strong>لحظياً</strong> مع سبب كل
            عامل — لتعرف بالضبط ما الذي يرفعها وما الذي يخفضها قبل أن ترفعها.
          </>
        )}
      </p>
      <p className="mb-8 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
        {t(
          "الفرصة لا تُنشر للجمهور مباشرة. تدخل قائمة المراجعة، ولا تظهر إلا بعد اعتماد الإدارة واكتمال التوثيق.",
          "An opportunity is not published to the public straight away. It goes into the review queue and appears only after the administration approves it and its documentation is complete.",
        )}
      </p>
      {sp.land && !fromLand && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {t(
            "هذه الأرض ليست أرضك الموثّقة، فلم تُملأ الفرصة منها. املأها بنفسك، أو ارجع إلى «أراضيّ».",
            "This land is not your verified land, so the opportunity was not filled from it. Fill it in yourself, or go back to «My land».",
          )}
        </p>
      )}
      <OpportunityForm
        operatorSeasons={p?.completed_seasons ?? 0}
        operatorReportingRate={p?.reporting_rate ?? 0}
        fromLand={fromLand}
      />
    </div>
  );
}
