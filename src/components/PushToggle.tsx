"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

type State = "checking" | "unsupported" | "off" | "on" | "blocked" | "busy";

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * «فعّل تنبيهات الهاتف» (البند ١١٩): one switch on the notifications page.
 *
 * The browser asks once for permission; the subscription it hands back is
 * filed under the signed-in user, and the daily job pushes to it. No app,
 * no number, nothing paid. On an iPhone it works only after the site is
 * added to the home screen, and the hint says so.
 */
export default function PushToggle() {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("busy");
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const keyRes = await fetch("/api/push/key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("no key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setState("on");
    } catch (e) {
      setState("off");
      setNote(t(`تعذّر التفعيل: ${(e as Error).message}`, `Could not turn it on: ${(e as Error).message}`));
    }
  }

  async function turnOff() {
    setState("busy");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setState("on");
      setNote(t(`تعذّر الإيقاف: ${(e as Error).message}`, `Could not turn it off: ${(e as Error).message}`));
    }
  }

  const iphone = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("تنبيهات الهاتف", "Phone notifications")}</p>
          <p className="text-xs text-muted">
            {t(
              "يصلك الإشعار على شاشة الهاتف والموقع مغلق: جرادٌ قرب أرضك، مرضٌ في ولايتك، موعد مرحلة.",
              "The notification reaches your phone's screen with the site closed: locusts near your land, a disease in your state, a stage due.",
            )}
          </p>
        </div>
        {state === "checking" && <span className="text-xs text-muted">…</span>}
        {state === "unsupported" && (
          <span className="text-xs text-muted">
            {iphone
              ? t("على الآيفون: أضف الموقع إلى الشاشة الرئيسيّة من زرّ المشاركة، ثمّ افتحه منها وعد هنا.", "On iPhone: add the site to the Home Screen from the share button, open it from there, then come back here.")
              : t("هذا المتصفّح لا يدعم تنبيهات الهاتف. جرّب كروم.", "This browser does not support phone notifications. Try Chrome.")}
          </span>
        )}
        {state === "blocked" && (
          <span className="text-xs text-danger">
            {t("منعتَ التنبيهات لهذا الموقع في إعدادات المتصفّح. اسمح بها ثمّ عد هنا.", "You blocked notifications for this site in the browser settings. Allow them, then come back here.")}
          </span>
        )}
        {(state === "off" || state === "on" || state === "busy") && (
          <button
            type="button"
            disabled={state === "busy"}
            onClick={state === "on" ? turnOff : turnOn}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${state === "on" ? "border border-border" : "bg-primary text-primary-foreground"}`}
          >
            {state === "busy" ? t("لحظة…", "One moment…") : state === "on" ? t("أوقف على هذا الهاتف", "Stop on this phone") : t("فعّل على هذا الهاتف", "Turn on for this phone")}
          </button>
        )}
      </div>
      {state === "on" && <p className="mt-2 text-xs text-primary">{t("مفعَّلة على هذا الهاتف.", "On for this phone.")}</p>}
      {note && <p className="mt-2 text-xs text-danger">{note}</p>}
    </div>
  );
}
