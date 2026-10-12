"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

/**
 * The phone's own position, read when the person presses the button — never in
 * the background. It fills hidden inputs named `${prefix}lat`, `${prefix}lng`
 * and `${prefix}accuracy` for the form around it.
 */
export default function GpsField({ prefix = "", label, required }: { prefix?: string; label: string; required?: boolean }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function read() {
    setMsg(null);
    if (!("geolocation" in navigator)) {
      setMsg(t("المتصفّح لا يعطي الموقع.", "This browser cannot give a location."));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setBusy(false);
      },
      (e) => {
        setMsg(
          e.code === e.PERMISSION_DENIED
            ? t("رُفض إذن الموقع. اسمح به من إعدادات المتصفّح.", "Location permission was denied. Allow it in the browser settings.")
            : t("تعذّرت قراءة الموقع. اخرج إلى مكانٍ مكشوف وأعد المحاولة.", "Could not read the location. Step outside and try again."),
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={read}
          disabled={busy}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-50"
        >
          {busy ? t("جارٍ تحديد الموقع…", "Locating…") : pos ? t("أعد القراءة", "Read again") : t("حدّد موقعي الآن", "Use my location now")}
        </button>
        {pos && (
          <span className="figure text-xs text-muted" dir="ltr">
            {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} (±{Math.round(pos.acc)} m)
          </span>
        )}
      </div>
      <input type="hidden" name={`${prefix}lat`} value={pos ? String(pos.lat) : ""} required={required} />
      <input type="hidden" name={`${prefix}lng`} value={pos ? String(pos.lng) : ""} required={required} />
      <input type="hidden" name={`${prefix}accuracy`} value={pos ? String(pos.acc) : ""} />
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </div>
  );
}
