import { MEMBER_COLUMNS } from "@/lib/visitorColumns";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { formatUsd, statusLabel } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import type { Investment, Profile, Project, ProjectUpdate } from "@/types/database";
import { addProjectUpdate, confirmInvestment, updateProjectStatus } from "../../actions";

type InvestmentRow = Investment & { profiles: Profile | null };

export default async function AdminProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

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

  const { data: project } = await supabase
    .from("projects")
    .select(MEMBER_COLUMNS.projects)
    .eq("id", id)
    .single();
  if (!project) notFound();
  const typedProject = project as unknown as Project;

  const { data: updates } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const { data: investments } = await supabase
    .from("investments")
    .select("*, profiles(*)")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const investmentRows = (investments ?? []) as unknown as InvestmentRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted">{typedProject.location}</p>
      <h1 className="text-2xl font-bold">{typedProject.name}</h1>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={updateProjectStatus} className="mt-4 flex items-center gap-3">
        <input type="hidden" name="project_id" value={typedProject.id} />
        <label className="text-sm">
          {t("حالة المشروع:", "Project status:")}{" "}
          <select
            name="status"
            defaultValue={typedProject.status}
            className="rounded-lg border border-border bg-card px-2 py-1"
          >
            <option value="draft">{t("مسودة", "Draft")}</option>
            <option value="open">{t("مفتوح للاستثمار", "Open for investment")}</option>
            <option value="funded">{t("تم تمويله بالكامل", "Fully funded")}</option>
            <option value="in_progress">{t("قيد التنفيذ", "In progress")}</option>
            <option value="completed">{t("مكتمل", "Completed")}</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          {t("تحديث", "Update")}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("طلبات الاستثمار", "Investment requests")} ({investmentRows.length})</h2>
        {investmentRows.length === 0 ? (
          <p className="text-sm text-muted">{t("لا توجد طلبات استثمار بعد.", "No investment requests yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {investmentRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{row.profiles?.full_name || t("مستثمر", "Investor")}</p>
                  <p className="text-xs text-muted">
                    {row.shares} {t("حصة", "shares")} · {formatUsd(row.amount, locale)} · {statusLabel(row.status, locale)}
                  </p>
                </div>
                {row.status === "pending" && (
                  <form action={confirmInvestment}>
                    <input type="hidden" name="investment_id" value={row.id} />
                    <input type="hidden" name="project_id" value={typedProject.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                    >
                      {t("تأكيد الاستثمار", "Confirm investment")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("إضافة تقرير ميداني", "Add a field report")}</h2>
        <form action={addProjectUpdate} className="flex flex-col gap-3">
          <input type="hidden" name="project_id" value={typedProject.id} />
          <input
            name="title"
            placeholder={t("عنوان التقرير", "Report title")}
            required
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <textarea
            name="body"
            placeholder={t("تفاصيل التقرير...", "Report details...")}
            rows={3}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("نشر التقرير", "Publish report")}
          </button>
        </form>

        <ul className="mt-6 flex flex-col gap-3">
          {(updates as ProjectUpdate[] | null)?.map((update) => (
            <li key={update.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <p className="font-medium">{update.title}</p>
              {update.body && <p className="mt-1 text-foreground/80">{update.body}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
