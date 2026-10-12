"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import { money } from "@/lib/marketCrops";

/**
 * «نبّهني إذا تجاوز السعر…» — حدٌّ يحفظه الزائر في متصفّحه، ويُفحص حين يفتح الصفحة.
 *
 * WHY IT SAYS "ON YOUR NEXT VISIT"
 *
 * There is no push service yet, and the prices themselves change only when
 * the data file does. So the honest promise is the one this keeps: the
 * threshold lives in this browser's localStorage, and the next time the page
 * opens with a figure past it, the card says so — and, if the visitor allowed
 * it, the browser shows a notification as well. The form says exactly that,
 * rather than implying a message will arrive on a phone that is switched off.
 *
 * WHY useSyncExternalStore
 *
 * The server has no localStorage, so the first render cannot know the saved
 * threshold. Reading it in an external-store subscription gives the server
 * snapshot (nothing saved) to hydration and the real one immediately after,
 * without a mismatch and without setting state in an effect.
 */

const STORE = "sudagri.market.alerts.v1";
type Alert = { dir: "above" | "below"; price: number };
type Alerts = Record<string, Alert>;

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
const snapshot = () => {
  try {
    return window.localStorage.getItem(STORE);
  } catch {
    return null;
  }
};
const parse = (raw: string | null): Alerts => {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};
function write(next: Alerts) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // Private windows may refuse storage; the form then simply does not remember.
  }
  listeners.forEach((fn) => fn());
}

export default function PriceAlert({
  id,
  label,
  unit,
  price,
  date,
  locale,
}: {
  /** `gedaref:sesame` */
  id: string;
  /** The crop and market, for the notification's text. */
  label: string;
  /** «للقنطار» / "per qintar" */
  unit: string;
  price: number;
  date: string;
  locale: Locale;
}) {
  const en = locale === "en";
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const saved = useMemo(() => parse(raw)[id] as Alert | undefined, [raw, id]);
  const [open, setOpen] = useState(false);
  const hit = saved ? (saved.dir === "above" ? price > saved.price : price < saved.price) : false;

  // One notification per figure: the key includes the date, so re-opening the
  // page on the same figure does not ring again.
  useEffect(() => {
    if (!hit || !saved || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const rung = `${STORE}.rung.${id}.${date}`;
    try {
      if (window.localStorage.getItem(rung)) return;
      window.localStorage.setItem(rung, "1");
    } catch {
      return;
    }
    new Notification(en ? "Sudagri — crop market" : "سوداقري — سوق المحاصيل", {
      body: en
        ? `${label}: ${money(price)} SDG ${unit} (${date}) — past your ${money(saved.price)}`
        : `${label}: ${money(price)} جنيه ${unit} (${date}) — تجاوز حدّك ${money(saved.price)}`,
      lang: locale,
    });
  }, [hit, saved, id, date, label, price, unit, en, locale]);

  function save(fd: FormData) {
    const p = Number(String(fd.get("price") ?? "").replace(/[,\s]/g, ""));
    if (!Number.isFinite(p) || p <= 0) return;
    write({ ...parse(snapshot()), [id]: { dir: fd.get("dir") === "below" ? "below" : "above", price: p } });
    setOpen(false);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  function clear() {
    const all = parse(snapshot());
    delete all[id];
    write(all);
  }

  return (
    <div className="text-xs">
      {hit && saved && (
        <p role="status" className="mb-2 rounded-lg bg-accent/15 px-3 py-2 font-bold">
          {en
            ? `🔔 ${saved.dir === "above" ? "Above" : "Below"} your ${money(saved.price)} — it is ${money(price)}.`
            : `🔔 ${saved.dir === "above" ? "فوق" : "دون"} حدّك ${money(saved.price)} — السعر ${money(price)}.`}
        </p>
      )}
      {saved && !open ? (
        <p className="text-muted">
          {en
            ? `Alert: ${saved.dir === "above" ? "above" : "below"} ${money(saved.price)}. `
            : `تنبيهك: ${saved.dir === "above" ? "فوق" : "دون"} ${money(saved.price)}. `}
          <button type="button" onClick={() => setOpen(true)} className="text-primary underline">
            {en ? "Change" : "غيّره"}
          </button>{" "}
          ·{" "}
          <button type="button" onClick={clear} className="text-primary underline">
            {en ? "Remove" : "احذفه"}
          </button>
        </p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-primary underline">
          {en ? "🔔 Alert me if the price passes…" : "🔔 نبّهني إذا تجاوز السعر…"}
        </button>
      ) : (
        <form action={save} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select name="dir" defaultValue={saved?.dir ?? "above"} className="rounded-md border border-border bg-background px-2 py-1">
              <option value="above">{en ? "Above" : "فوق"}</option>
              <option value="below">{en ? "Below" : "دون"}</option>
            </select>
            <input
              name="price"
              inputMode="numeric"
              required
              defaultValue={saved?.price ?? ""}
              placeholder={money(price)}
              aria-label={en ? "Price in pounds" : "السعر بالجنيه"}
              className="w-28 rounded-md border border-border bg-background px-2 py-1"
              dir="ltr"
            />
            <span className="text-muted">{en ? `SDG ${unit}` : `جنيه ${unit}`}</span>
            <button className="rounded-md bg-primary px-3 py-1 font-bold text-primary-foreground">{en ? "Save" : "احفظ"}</button>
          </div>
          <p className="leading-relaxed text-muted">
            {en
              ? "Saved in this browser only. You are alerted when you open this page and the price is past your limit — not by message while you are away; that needs push notifications, which come later."
              : "يُحفظ في هذا المتصفّح وحده. ننبّهك حين تفتح هذه الصفحة والسعر قد تجاوز حدّك — لا برسالةٍ وأنت بعيد؛ فذلك يحتاج إشعاراتٍ فوريّة لم تُبنَ بعد."}
          </p>
        </form>
      )}
    </div>
  );
}
