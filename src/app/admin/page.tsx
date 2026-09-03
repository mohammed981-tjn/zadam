import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, statusLabel } from "@/lib/format";
import { activeProvider } from "@/lib/embedding";
import { countStale } from "@/lib/backfillEmbeddings";
import EmbeddingBackfill from "@/components/EmbeddingBackfill";
import type { Project } from "@/types/database";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const [{ data: projects }, { data: lastCheck }] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
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
        <h1 className="text-2xl font-bold">لوحة إدارة المشاريع</h1>
        {/* Wraps, because the list of admin screens has outgrown one line on a
            phone — and a row that overflows hides whichever screen was added
            last, which is always the one nobody knows about yet. */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/analytics"
            className="text-sm text-primary underline"
          >
            التحليلات
          </Link>
          <Link href="/admin/review" className="text-sm text-primary underline">
            مراجعة الفرص
          </Link>
          <Link href="/admin/leads" className="text-sm text-primary underline">
            العملاء المحتملون
          </Link>
          <Link
            href="/admin/feedback"
            className="text-sm text-primary underline"
          >
            ملاحظات الزوّار
          </Link>
          <Link
            href="/admin/canal-images"
            className="text-sm text-primary underline"
          >
            صور القناة
          </Link>
          <Link
            href="/admin/projects/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + مشروع جديد
          </Link>
        </div>
      </div>

      <section
        className={`mb-6 rounded-xl border p-4 ${
          !check || scheduleStalled || !check.ok
            ? "border-danger/40 bg-danger/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">حالة المنصة</h2>
          <span className="text-xs text-muted">
            {check
              ? `آخر فحص: ${new Date(check.checked_at).toLocaleString("ar-EG")}`
              : "لم يُجرَ أي فحص بعد"}
          </span>
        </div>

        {!check && (
          <p className="mt-2 text-sm text-danger">
            الفحص اليومي لم يعمل ولا مرة. تأكّد من إعداد المهمة المجدولة — بدونها
            تتوقف قاعدة البيانات المجانية بعد سبعة أيام من عدم النشاط.
          </p>
        )}

        {scheduleStalled && (
          <p className="mt-2 text-sm text-danger">
            مضى على آخر فحص أكثر من يومين. المهمة المجدولة توقفت على الأرجح، وهي
            وحدها ما يمنع إيقاف قاعدة البيانات.
          </p>
        )}

        {check && check.ok && !scheduleStalled && (
          <p className="mt-2 text-sm text-muted">
            كل الفحوص سليمة، وقاعدة البيانات نشطة.
          </p>
        )}

        {problems.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
            {problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}
      </section>

      {pendingEmbeddings !== null && (
        <EmbeddingBackfill initialPending={pendingEmbeddings} />
      )}

      {!projects || projects.length === 0 ? (
        <p className="text-sm text-muted">لا توجد مشاريع بعد.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-right">
              <tr>
                <th className="px-4 py-3">المشروع</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">التمويل</th>
                <th className="px-4 py-3">سعر الحصة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(projects as Project[]).map((project) => (
                <tr key={project.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{project.name}</td>
                  <td className="px-4 py-3">{statusLabel(project.status)}</td>
                  <td className="px-4 py-3">
                    {project.shares_sold}/{project.total_shares}
                  </td>
                  <td className="px-4 py-3">
                    {formatUsd(project.price_per_share)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-primary underline"
                    >
                      إدارة
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
