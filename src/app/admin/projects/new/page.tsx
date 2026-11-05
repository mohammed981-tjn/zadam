import { createProject } from "../../actions";
import { requireAdmin } from "@/lib/adminGuard";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Every other admin page checks its reader; this one rendered the form for
  // anyone (backlog 132). The action was always guarded by requireAdmin.
  await requireAdmin();
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("مشروع جديد", "New project")}</h1>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={createProject} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("اسم المشروع", "Project name")}
          <input name="name" required className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("الموقع", "Location")}
          <input name="location" required className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("الوصف", "Description")}
          <textarea name="description" rows={4} className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("إجمالي الفدادين", "Total feddans")}
            <input type="number" name="total_feddans" min={0} step="0.01" required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("العائد السنوي المتوقع (%)", "Expected annual return (%)")}
            <input type="number" name="expected_annual_return" min={0} step="0.1" className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("سعر الحصة (USD)", "Share price (USD)")}
            <input type="number" name="price_per_share" min={1} step="0.01" required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("إجمالي عدد الحصص", "Total number of shares")}
            <input type="number" name="total_shares" min={1} required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("مستوى المخاطرة", "Risk level")}
            <select name="risk_level" defaultValue="medium" className="rounded-lg border border-border bg-card px-3 py-2">
              <option value="low">{t("منخفض", "Low")}</option>
              <option value="medium">{t("متوسط", "Medium")}</option>
              <option value="high">{t("مرتفع", "High")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("الحالة", "Status")}
            <select name="status" className="rounded-lg border border-border bg-card px-3 py-2">
              <option value="draft">{t("مسودة", "Draft")}</option>
              <option value="open">{t("مفتوح للاستثمار", "Open for investment")}</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          {t("حفظ المشروع", "Save project")}
        </button>
      </form>
    </div>
  );
}
