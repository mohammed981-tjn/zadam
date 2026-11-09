"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { setLandLocation, type LandResult } from "@/app/lands/actions";
import GpsField from "@/components/supply/GpsField";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { field } from "@/lib/ui";

/** The corners drawn on the map, as in the app (backlog 210). */
const BoundaryDrawer = dynamic(() => import("@/components/map/BoundaryDrawer"), { ssr: false });

/**
 * Adds or corrects the place of a land already registered (BUG-13, backlog 162). Before this the page told
 * the owner to «edit the land», and there was nothing to edit with.
 */
export default function LandLocationForm({
  landId,
  current,
  verified,
}: {
  landId: string;
  current: { lat: number; lng: number } | null;
  verified: boolean;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [state, action, pending] = useActionState<LandResult | null, FormData>(setLandLocation, null);
  const [drawing, setDrawing] = useState(false);

  return (
    <details className="mt-4 rounded-xl bg-background p-3 text-sm">
      <summary className="cursor-pointer font-bold">
        {current ? t("صحّح موقع الأرض", "Correct the land's location") : t("أضف موقع الأرض", "Add the land's location")}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="land_id" value={landId} />
        {current && (
          <p className="figure text-xs text-muted" dir="ltr">
            {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
          </p>
        )}
        {verified && (
          <p className="text-xs text-accent">
            {t(
              "أرضك موثّقة: تغيير موقعها يعيدها إلى مراجعة الإدارة ولا تُعرض حتى تعتمدها من جديد.",
              "Your land is verified: changing its location sends it back to the administrators, and it is not shown until they approve it again.",
            )}
          </p>
        )}
        <button
          type="button"
          onClick={() => setDrawing((v) => !v)}
          aria-expanded={drawing}
          className="self-start rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10"
        >
          🔷 {drawing ? t("ألغِ رسم الحدود", "Cancel drawing the boundary") : t("ارسم حدود الأرض بالنقاط على الخريطة", "Draw the land's boundary with points on the map")}
        </button>
        {drawing && <BoundaryDrawer start={current ? [current.lng, current.lat] : null} />}
        {!drawing && (
          <>
        <GpsField label={t("وأنت واقفٌ في الأرض:", "While you stand on the land:")} />
        <label className="flex flex-col gap-1">
          {t("أو الصق الموقع (رابط خريطة، أو رقمان)", "Or paste the location (a map link, or two numbers)")}
          <input name="paste" className={field} dir="ltr" placeholder="15.60, 32.50" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            {t("خطّ العرض", "Latitude")}
            <input name="latitude" type="number" step="any" className={field} dir="ltr" placeholder="15.6" />
          </label>
          <label className="flex flex-col gap-1">
            {t("خطّ الطول", "Longitude")}
            <input name="longitude" type="number" step="any" className={field} dir="ltr" placeholder="32.5" />
          </label>
        </div>
          </>
        )}
        {state && (
          <p className={`text-xs ${state.ok ? "text-primary" : "text-danger"}`} role="status">
            {state.message}
          </p>
        )}
        <button
          disabled={pending}
          className="self-start rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("جارٍ الحفظ…", "Saving…") : drawing ? t("احفظ الحدود والموقع", "Save the boundary and location") : t("احفظ الموقع", "Save the location")}
        </button>
      </form>
    </details>
  );
}
