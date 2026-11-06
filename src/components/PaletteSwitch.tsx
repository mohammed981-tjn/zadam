"use client";

import { useSyncExternalStore } from "react";
import { tr } from "@/lib/i18n";
import { DEFAULT_PALETTE, PALETTE_COOKIE, PALETTE_MAX_AGE, toPalette, type Palette } from "@/lib/palette";
import { useLocale } from "./LocaleProvider";

/**
 * «ألوان الشعار» أو «أخضر الأوراق» — the visitor picks the site's colours (the owner, 6 November 2026).
 *
 * The choice is a cookie for the next page the server draws (the layout reads it into `<html data-palette>`),
 * and `document.documentElement.dataset.palette` for this one, so the colours change at the tap with no reload.
 * The swatches are drawn from the palettes' own colours, so they say what they do without being read.
 *
 * At night both palettes are the same dark one (globals.css), so a tap there changes nothing until the lights
 * come back on; the choice is kept for then.
 */
const OPTIONS: { key: Palette; ar: string; en: string; swatch: string }[] = [
  {
    key: "logo",
    ar: "ألوان الشعار",
    en: "Logo colours",
    // The logo's ring green, its leaf, its sun.
    swatch: "conic-gradient(#023f24 0 50%, #579b2e 50% 75%, #fec247 75%)",
  },
  {
    key: "leaf",
    ar: "أخضر الأوراق",
    en: "Leaf green",
    swatch: "conic-gradient(#367a23 0 50%, #e0a93a 50% 75%, #f7f3e6 75%)",
  },
];

/** The palette on the page now, as React reads it; it changes when the attribute does. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
  return () => observer.disconnect();
}
const current = () => toPalette(document.documentElement.dataset.palette);
const onServer = () => DEFAULT_PALETTE;

/** The cookie for the pages the server draws next, the attribute for this one; the observer above re-renders. */
function choose(next: Palette) {
  document.cookie = `${PALETTE_COOKIE}=${next}; path=/; max-age=${PALETTE_MAX_AGE}; samesite=lax`;
  document.documentElement.dataset.palette = next;
}

export default function PaletteSwitch({
  className = "",
  stacked = false,
}: {
  className?: string;
  /** One choice under the other, for a narrow column (the desktop side column) where two side by side wrap. */
  stacked?: boolean;
}) {
  const locale = useLocale();
  const palette = useSyncExternalStore(subscribe, current, onServer);

  return (
    <div role="group" aria-label={tr(locale, "ألوان الموقع", "Site colours")} className={className}>
      <p className="mb-1.5 text-xs font-bold text-muted">{tr(locale, "ألوان الموقع", "Site colours")}</p>
      <div className={`grid gap-2 ${stacked ? "grid-cols-1" : "grid-cols-2"}`}>
        {OPTIONS.map((o) => {
          const on = palette === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(o.key)}
              className={`flex items-center gap-2 rounded-xl border px-2.5 text-start text-xs font-bold transition ${
                stacked ? "py-1.5" : "py-2"
              } ${
                on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <span
                aria-hidden
                className={`size-6 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-card ${on ? "ring-primary" : "ring-border"}`}
                style={{ background: o.swatch }}
              />
              {tr(locale, o.ar, o.en)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
