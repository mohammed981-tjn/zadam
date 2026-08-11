import { createProject } from "../../actions";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">مشروع جديد</h1>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={createProject} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          اسم المشروع
          <input name="name" required className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          الموقع
          <input name="location" required className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          الوصف
          <textarea name="description" rows={4} className="rounded-lg border border-border bg-card px-3 py-2" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            إجمالي الفدادين
            <input type="number" name="total_feddans" min={0} step="0.01" required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            العائد السنوي المتوقع (%)
            <input type="number" name="expected_annual_return" min={0} step="0.1" className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            سعر الحصة (USD)
            <input type="number" name="price_per_share" min={1} step="0.01" required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            إجمالي عدد الحصص
            <input type="number" name="total_shares" min={1} required className="rounded-lg border border-border bg-card px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            مستوى المخاطرة
            <select name="risk_level" defaultValue="medium" className="rounded-lg border border-border bg-card px-3 py-2">
              <option value="low">منخفض</option>
              <option value="medium">متوسط</option>
              <option value="high">مرتفع</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الحالة
            <select name="status" className="rounded-lg border border-border bg-card px-3 py-2">
              <option value="draft">مسودة</option>
              <option value="open">مفتوح للاستثمار</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          حفظ المشروع
        </button>
      </form>
    </div>
  );
}
