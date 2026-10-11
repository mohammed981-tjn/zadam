"use client";

import { useActionState, useState } from "react";
import { EXTRACTION_LABEL, extractionLabel, type ExtractionMethod } from "@/lib/provenance";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import {
  registerLot,
  registerSite,
  type RegistryResult,
} from "@/app/mining/registry/actions";

const METHODS = Object.keys(EXTRACTION_LABEL) as ExtractionMethod[];
const field =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export default function RegistryForms({
  sites,
}: {
  sites: { id: string; name: string; state: string; licensed: boolean }[];
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [tab, setTab] = useState<"site" | "lot">(sites.length ? "lot" : "site");

  const [siteState, siteAction, sitePending] = useActionState<
    RegistryResult | null,
    FormData
  >(registerSite, null);
  const [lotState, lotAction, lotPending] = useActionState<
    RegistryResult | null,
    FormData
  >(registerLot, null);

  const result = tab === "site" ? siteState : lotState;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-5 flex gap-2">
        {(
          [
            ["lot", t("شحنة جديدة", "New lot")],
            ["site", t("موقع تعدين", "Mining site")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === k
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:border-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "site" ? (
        <form action={siteAction} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("اسم الموقع", "Site name")}
            <input name="name" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("الولاية", "State")}
            <input name="state" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("المحلية", "Locality")}
            <input name="locality" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("رقم الترخيص", "Licence number")}
            <input name="licence_number" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("خط العرض", "Latitude")}
            <input type="number" step="any" name="latitude" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("خط الطول", "Longitude")}
            <input
              type="number"
              step="any"
              name="longitude"
              className={field}
            />
          </label>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="licensed" />
              {t("الموقع مرخّص لدى سلطة التعدين", "The site is licensed by the mining authority")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="site_visited" />
              {t("جرت معاينة مستقلة للموقع", "The site has had an independent inspection")}
            </label>
            <label className="flex items-center gap-2 text-sm text-danger">
              <input type="checkbox" name="armed_presence" />
              {t("يوجد حضور مسلح في الموقع أو حوله", "There is an armed presence at or around the site")}
            </label>
            <label className="flex items-center gap-2 text-sm text-danger">
              <input type="checkbox" name="child_labour" />
              {t("يعمل في الموقع من هم دون الثامنة عشرة", "People under eighteen work at the site")}
            </label>
            <p className="text-xs text-muted">
              {t(
                "الخانتان الأخيرتان علامتان حمراوان قاطعتان في إرشادات العناية الواجبة. تسجيلهما بصدق هو ما يجعل السجل ذا قيمة — إخفاؤهما يُفقده معناه كله.",
                "The last two boxes are definitive red flags in the due-diligence guidance. Recording them honestly is what gives the registry its value — hiding them strips it of all meaning.",
              )}
            </p>
          </div>

          <button
            type="submit"
            disabled={sitePending}
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
          >
            {sitePending ? t("جارٍ التسجيل...", "Registering...") : t("سجّل الموقع", "Register the site")}
          </button>
        </form>
      ) : (
        <form action={lotAction} className="grid gap-4 sm:grid-cols-2">
          {sites.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2">
              {t(
                "سجّل موقع تعدين أولاً — كل شحنة يجب أن تُنسب إلى موقع.",
                "Register a mining site first — every lot must be traced to a site.",
              )}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                {t("رقم الشحنة", "Lot number")}
                <input
                  name="reference"
                  required
                  className={field}
                  placeholder="LOT-2026-001"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("موقع الاستخراج", "Extraction site")}
                <select name="site_id" required className={field}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.state}
                      {s.licensed ? "" : t(" (بلا ترخيص)", " (unlicensed)")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("تاريخ الاستخراج", "Extraction date")}
                <input
                  type="date"
                  name="extracted_on"
                  required
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("طريقة الاستخلاص", "Extraction method")}
                <select name="method" className={field} defaultValue="borax">
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {extractionLabel(m, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("الوزن (جرام)", "Weight (grams)")}
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="initial_weight_grams"
                  required
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("العيار (نسبة بين 0 و1)", "Fineness (a fraction between 0 and 1)")}
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="1"
                  name="initial_fineness"
                  required
                  className={field}
                  placeholder="0.85"
                />
              </label>
              <button
                type="submit"
                disabled={lotPending}
                className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
              >
                {lotPending ? t("جارٍ التسجيل...", "Registering...") : t("سجّل الشحنة", "Register the lot")}
              </button>
            </>
          )}
        </form>
      )}

      {result && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            result.ok
              ? "border border-primary/30 bg-primary/10 text-primary"
              : "border border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
