"use client";

import { useActionState, useState } from "react";
import { addLandTest, type LandResult } from "@/app/lands/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { button, field, label } from "@/lib/ui";

/** A water or soil test, entered as the lab or the farmer wrote it (backlog 164). */
export default function LandTestForm({ landId, today }: { landId: string; today: string }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [state, action, pending] = useActionState<LandResult | null, FormData>(addLandTest, null);
  const [kind, setKind] = useState("water");

  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="land_id" value={landId} />
      <label className={label}>
        {t("ماذا فُحص؟", "What was tested?")}
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="water">{t("ماء (بئر أو قناة)", "Water (well or canal)")}</option>
          <option value="soil">{t("تربة", "Soil")}</option>
        </select>
      </label>
      <label className={label}>
        {t("تاريخ الفحص", "Date of the test")}
        <input name="tested_on" type="date" required defaultValue={today} max={today} className={field} />
      </label>
      <label className={label}>
        {t("الملوحة EC (dS/m)", "Salinity EC (dS/m)")}
        <input name="ec_dsm" type="number" step="0.01" min={0} max={100} className={field} dir="ltr" />
      </label>
      <label className={label}>
        {t("الحموضة pH", "Acidity pH")}
        <input name="ph" type="number" step="0.01" min={0} max={14} className={field} dir="ltr" />
      </label>
      <label className={label}>
        {t("الصوديوم SAR (اختياري)", "Sodium SAR (optional)")}
        <input name="sar" type="number" step="0.01" min={0} max={100} className={field} dir="ltr" />
      </label>
      {kind === "soil" && (
        <label className={label}>
          {t("المادّة العضويّة ٪ (اختياري)", "Organic matter % (optional)")}
          <input name="organic_matter_pct" type="number" step="0.01" min={0} max={100} className={field} dir="ltr" />
        </label>
      )}
      <label className={`${label} sm:col-span-2`}>
        {t("المختبر أو من أجرى الفحص (اختياري)", "Lab or who did the test (optional)")}
        <input name="lab" maxLength={120} className={field} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        {t("ملاحظة (اختياري)", "Note (optional)")}
        <textarea name="note" maxLength={500} rows={2} className={field} />
      </label>
      {state && (
        <p className={`text-sm sm:col-span-2 ${state.ok ? "text-primary" : "text-danger"}`} role="status">
          {state.message}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={pending} className={button}>
          {pending ? t("جارٍ الحفظ…", "Saving…") : t("أضف الفحص", "Add the test")}
        </button>
      </div>
    </form>
  );
}
