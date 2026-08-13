"use client";

import { useActionState, useState } from "react";
import { EXTRACTION_LABEL, type ExtractionMethod } from "@/lib/provenance";
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
            ["lot", "شحنة جديدة"],
            ["site", "موقع تعدين"],
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
            اسم الموقع
            <input name="name" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الولاية
            <input name="state" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            المحلية
            <input name="locality" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            رقم الترخيص
            <input name="licence_number" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            خط العرض
            <input type="number" step="any" name="latitude" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            خط الطول
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
              الموقع مرخّص لدى سلطة التعدين
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="site_visited" />
              جرت معاينة مستقلة للموقع
            </label>
            <label className="flex items-center gap-2 text-sm text-danger">
              <input type="checkbox" name="armed_presence" />
              يوجد حضور مسلح في الموقع أو حوله
            </label>
            <label className="flex items-center gap-2 text-sm text-danger">
              <input type="checkbox" name="child_labour" />
              يعمل في الموقع من هم دون الثامنة عشرة
            </label>
            <p className="text-xs text-muted">
              الخانتان الأخيرتان علامتان حمراوان قاطعتان في إرشادات العناية
              الواجبة. تسجيلهما بصدق هو ما يجعل السجل ذا قيمة — إخفاؤهما يُفقده
              معناه كله.
            </p>
          </div>

          <button
            type="submit"
            disabled={sitePending}
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
          >
            {sitePending ? "جارٍ التسجيل..." : "سجّل الموقع"}
          </button>
        </form>
      ) : (
        <form action={lotAction} className="grid gap-4 sm:grid-cols-2">
          {sites.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2">
              سجّل موقع تعدين أولاً — كل شحنة يجب أن تُنسب إلى موقع.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                رقم الشحنة
                <input
                  name="reference"
                  required
                  className={field}
                  placeholder="LOT-2026-001"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                موقع الاستخراج
                <select name="site_id" required className={field}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.state}
                      {s.licensed ? "" : " (بلا ترخيص)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                تاريخ الاستخراج
                <input
                  type="date"
                  name="extracted_on"
                  required
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                طريقة الاستخلاص
                <select name="method" className={field} defaultValue="borax">
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {EXTRACTION_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                الوزن (جرام)
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
                العيار (نسبة بين 0 و1)
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
                {lotPending ? "جارٍ التسجيل..." : "سجّل الشحنة"}
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
