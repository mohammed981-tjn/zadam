import { MEMBER_COLUMNS } from "@/lib/visitorColumns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { formatUsd, statusLabel } from "@/lib/format";
import { activeProvider } from "@/lib/embedding";
import { countStale } from "@/lib/backfillEmbeddings";
import EmbeddingBackfill from "@/components/EmbeddingBackfill";
import { loadFeedStates, staleLines } from "@/lib/priceFreshness";
import type { Project } from "@/types/database";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const [{ data: projects }, { data: lastCheck }] = await Promise.all([
    supabase.from("projects").select(MEMBER_COLUMNS.projects).order("created_at", { ascending: false }),
    // The view answers "has the schedule stopped?" from the database's own
    // clock. Comparing the check's timestamp against the web server's clock
    // would compare two different clocks, and drift on either would report a
    // healthy schedule as stalled or the reverse.
    supabase
      .from("system_health")
      .select("checked_at, ok, details, stale")
      .maybeSingle(),
  ]);

  const check = lastCheck as {
    checked_at: string;
    ok: boolean;
    details: { problems?: string[] };
    stale: boolean;
  } | null;
  const problems = check?.details?.problems ?? [];
  const scheduleStalled = check?.stale === true;
  // GAP-3: a price feed that has gone quiet shows here, not only in a table nobody opens.
  const stalePrices = staleLines(await loadFeedStates(supabase), locale);

  /*
   * How many knowledge entries are waiting for a vector.
   *
   * Counted with the engine's own rule rather than a filter written here, and
   * counted at all only when a provider is configured: without one there is no
   * model to be stale against, and every row would count as pending against a
   * button that could not do anything about it.
   *
   * A failed count returns null and the panel stays hidden. That is deliberate
   * — the panel exists to report a number, and showing zero when the count did
   * not run would report the opposite of the truth.
   */
  const embeddingProvider = activeProvider();
  const pendingEmbeddings = embeddingProvider
    ? await countStale(supabase, embeddingProvider.model)
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("لوحة إدارة المشاريع", "Projects admin")}</h1>
        {/* Wraps, because the list of admin screens has outgrown one line on a
            phone — and a row that overflows hides whichever screen was added
            last, which is always the one nobody knows about yet. */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/analytics"
            className="text-sm text-primary underline"
          >
            {t("التحليلات", "Analytics")}
          </Link>
          <Link href="/admin/news" className="text-sm text-primary underline">
            {t("الأخبار", "News")}
          </Link>
          <Link href="/admin/review" className="text-sm text-primary underline">
            {t("مراجعة الفرص", "Opportunity review")}
          </Link>
          <Link href="/admin/leads" className="text-sm text-primary underline">
            {t("العملاء المحتملون", "Leads")}
          </Link>
          <Link href="/admin/users" className="text-sm text-primary underline">
            {t("المسجَّلون", "Sign-ups")}
          </Link>
          <Link href="/admin/oversight" className="text-sm text-primary underline">
            {t("الرقابة الماليّة", "Financial oversight")}
          </Link>
          <Link href="/admin/books" className="text-sm text-primary underline">
            {t("دفتر المنصّة والرسوم", "Platform ledger and fees")}
          </Link>
          <Link
            href="/admin/feedback"
            className="text-sm text-primary underline"
          >
            {t("ملاحظات الزوّار", "Visitor feedback")}
          </Link>
          <Link
            href="/admin/suppliers"
            className="text-sm text-primary underline"
          >
            {t("الموردون والناقلون والبلاغات", "Suppliers, carriers and reports")}
          </Link>
          <Link
            href="/admin/canal-images"
            className="text-sm text-primary underline"
          >
            {t("صور القناة", "Canal images")}
          </Link>
          <Link
            href="/admin/projects/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("+ مشروع جديد", "+ New project")}
          </Link>
        </div>
      </div>

      {/* البند ١٢٤: الطريقُ إلى كلّ ما ينتظر، قبل أيّ شيءٍ آخر في اللوحة. */}
      <Link
        href="/admin/inbox"
        className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-card hover:opacity-95"
      >
        <span>
          <span className="block text-lg font-black">{t("قائمة المراجعة", "Review queue")}</span>
          <span className="block text-xs opacity-90">
            {t(
              "الأراضي والفرص ومقدّمو الخدمة والموردون والشركات والصادر والنفير — في مكانٍ واحد",
              "Lands, opportunities, service providers, suppliers, companies, export and nafir — in one place",
            )}
          </span>
        </span>
        <span className="text-2xl font-black">{locale === "en" ? "→" : "←"}</span>
      </Link>

      <section
        className={`mb-6 rounded-xl border p-4 ${
          !check || scheduleStalled || !check.ok
            ? "border-danger/40 bg-danger/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{t("حالة المنصة", "Platform health")}</h2>
          <span className="text-xs text-muted">
            {check
              ? `${t("آخر فحص", "Last check")}: ${new Date(check.checked_at).toLocaleString(locale === "en" ? "en-GB" : "ar-EG")}`
              : t("لم يُجرَ أي فحص بعد", "No check has run yet")}
          </span>
        </div>

        {!check && (
          <p className="mt-2 text-sm text-danger">
            {t(
              "الفحص اليومي لم يعمل ولا مرة. تأكّد من إعداد المهمة المجدولة — بدونها تتوقف قاعدة البيانات المجانية بعد سبعة أيام من عدم النشاط.",
              "The daily check has never run. Make sure the scheduled job is set up — without it the free database pauses after seven days of inactivity.",
            )}
          </p>
        )}

        {scheduleStalled && (
          <p className="mt-2 text-sm text-danger">
            {t(
              "مضى على آخر فحص أكثر من يومين. المهمة المجدولة توقفت على الأرجح، وهي وحدها ما يمنع إيقاف قاعدة البيانات.",
              "The last check was more than two days ago. The scheduled job has most likely stopped, and it alone keeps the database from being paused.",
            )}
          </p>
        )}

        {check && check.ok && !scheduleStalled && (
          <p className="mt-2 text-sm text-muted">
            {t("كل الفحوص سليمة، وقاعدة البيانات نشطة.", "All checks pass, and the database is active.")}
          </p>
        )}

        {problems.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
            {problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}

        {stalePrices.length > 0 && (
          <div className="mt-3 text-sm text-danger">
            <ul className="flex flex-col gap-1">
              {stalePrices.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
            <Link href="/admin/prices" className="mt-1 inline-block text-xs text-primary underline">
              {t("شاشة الأسعار", "Prices screen")}
            </Link>
          </div>
        )}
      </section>

      {pendingEmbeddings !== null && (
        <EmbeddingBackfill initialPending={pendingEmbeddings} />
      )}

      {!projects || projects.length === 0 ? (
        <p className="text-sm text-muted">{t("لا توجد مشاريع بعد.", "No projects yet.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-start">
              <tr>
                <th className="px-4 py-3">{t("المشروع", "Project")}</th>
                <th className="px-4 py-3">{t("الحالة", "Status")}</th>
                <th className="px-4 py-3">{t("التمويل", "Funding")}</th>
                <th className="px-4 py-3">{t("سعر الحصة", "Share price")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(projects as unknown as Project[]).map((project) => (
                <tr key={project.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{project.name}</td>
                  <td className="px-4 py-3">{statusLabel(project.status, locale)}</td>
                  <td className="px-4 py-3">
                    {project.shares_sold}/{project.total_shares}
                  </td>
                  <td className="px-4 py-3">
                    {formatUsd(project.price_per_share, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-primary underline"
                    >
                      {t("إدارة", "Manage")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
