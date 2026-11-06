"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import LiveMap, { type Ground } from "@/components/map/LiveMap";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import type { MapTheme } from "@/lib/mapLayers";

/**
 * شاشة الخرائط (البند ١٤٧): خريطةٌ واحدة بملء الشاشة، وفوقها شريطُ طبقاتٍ كما
 * في تطبيقات التوصيل.
 *
 * A row of chips along the top. The week's layers (rain, heat, the air's
 * demand, terrain, soil, lands) replace one another, since two colour scales
 * on one map cannot both be read; the canal, the minerals and the roads and
 * power are lines and dots, laid over whichever is shown and over each other.
 * The key sits in a card at the bottom and folds away. The choice is kept in
 * the address, so a map can be sent as it is seen.
 *
 * The same screen, smaller and with fewer layers, is the map on the rain,
 * canal and mining pages («وستغيّر جميع الخرائط»), with a chip that opens it
 * full size on /map.
 */
export default function MapScreen({
  themes,
  initial,
  initialOver,
  className = "h-[calc(100dvh-9.5rem)] min-h-[26rem] sm:h-[calc(100dvh-6.5rem)]",
  bounds,
  initialGround,
  address = true,
  full,
}: {
  themes: MapTheme[];
  initial: string | null;
  initialOver: string[];
  className?: string;
  bounds?: [[number, number], [number, number]];
  initialGround?: Ground;
  /** Keep the choice in the page's address (?layer=, ?over=). */
  address?: boolean;
  /** Where the full-size map is, for a page that shows it small. */
  full?: string;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const grids = themes.filter((x) => x.group === "grid");
  const overs = themes.filter((x) => x.group === "over");
  const [gridKey, setGridKey] = useState<string | null>(
    initial === "none" ? null : (grids.find((x) => x.key === initial) ?? grids[0])?.key ?? null,
  );
  const [over, setOver] = useState<string[]>(initialOver.filter((k) => overs.some((x) => x.key === k)));
  const [keyOpen, setKeyOpen] = useState(true);

  const grid = grids.find((x) => x.key === gridKey) ?? null;
  const shownOver = overs.filter((x) => over.includes(x.key));
  // A new list only when the choice changes: the map redraws on a new list.
  const overlays = useMemo(
    () => [
      ...(themes.find((x) => x.group === "grid" && x.key === gridKey)?.overlays ?? []),
      ...themes.filter((x) => x.group === "over" && over.includes(x.key)).flatMap((x) => x.overlays),
    ],
    [themes, gridKey, over],
  );

  const remember = (g: string | null, o: string[]) => {
    if (!address) return;
    const q = new URLSearchParams(window.location.search);
    q.set("layer", g ?? "none");
    if (o.length) q.set("over", o.join(","));
    else q.delete("over");
    try {
      window.history.replaceState(null, "", `?${q}`);
    } catch {
      // The address is a convenience; the map works without it.
    }
  };
  const pickGrid = (k: string) => {
    const g = k === gridKey ? null : k;
    setGridKey(g);
    remember(g, over);
  };
  const toggleOver = (k: string) => {
    const o = over.includes(k) ? over.filter((x) => x !== k) : [...over, k];
    setOver(o);
    remember(gridKey, o);
  };

  const chip =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-extrabold shadow-float ring-1 backdrop-blur transition active:scale-95 md:px-3 md:py-1.5";

  return (
    <LiveMap
      overlays={overlays}
      className={className}
      bounds={bounds}
      initialGround={initialGround}
      // The country first seen clear of the chips above, the key below and the buttons beside.
      padding={{ top: 64, bottom: 190, left: 16, right: 72 }}
    >
      {/* الطبقات: شريطٌ يُمرَّر أفقيّاً على الهاتف؛ ومن عرض الحاسوب اللوحيّ فما فوق تظهر كلّها في سطرين إن لزم
          (المالك، 26 أكتوبر: «صورة الخرائط لا تعرض تبويبات الخرائط كاملة»)، ويُترك يمينها لأزرار الخريطة. */}
      <nav
        aria-label={t("طبقات الخريطة", "Map layers")}
        className="absolute inset-x-0 top-0 flex gap-2 overflow-x-auto p-2.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pr-20 [&::-webkit-scrollbar]:hidden"
      >
        {grids.map((x) => {
          const on = x.key === gridKey;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => pickGrid(x.key)}
              aria-pressed={on}
              className={`${chip} ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-card/95 text-foreground ring-border"}`}
            >
              <span aria-hidden>{x.emoji}</span>
              {x.title}
            </button>
          );
        })}
        {grids.length > 0 && overs.length > 0 && <span aria-hidden className="my-1.5 w-px shrink-0 bg-border" />}
        {overs.map((x) => {
          const on = over.includes(x.key);
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => toggleOver(x.key)}
              aria-pressed={on}
              className={`${chip} ${on ? "bg-card text-primary ring-2 ring-primary" : "bg-card/95 text-foreground ring-border"}`}
            >
              <span aria-hidden>{on ? "✓" : x.emoji}</span>
              {x.title}
            </button>
          );
        })}
        {full && (
          <Link href={full} className={`${chip} bg-card/95 text-primary ring-border`}>
            <span aria-hidden>⤢</span>
            {t("ملء الشاشة", "Full screen")}
          </Link>
        )}
      </nav>

      {/* A layer with nothing yet says so on the map, with the way to change that. */}
      {grid?.empty && grid.overlays.length === 0 && (
        <p className="absolute inset-x-6 top-1/3 mx-auto max-w-xs rounded-2xl bg-card/95 p-4 text-center text-sm font-bold shadow-float ring-1 ring-border">
          {grid.empty.text}{" "}
          <Link href={grid.empty.href} className="text-primary underline">
            {grid.empty.link}
          </Link>
        </p>
      )}

      {/* المفتاح: بطاقةٌ في الأسفل تُطوى. */}
      {(grid || shownOver.length > 0) && (
        <div className="absolute bottom-2.5 right-2.5 w-[min(22rem,calc(100%-5.5rem))] rounded-2xl bg-card/95 shadow-float ring-1 ring-border backdrop-blur">
          <button
            type="button"
            onClick={() => setKeyOpen((v) => !v)}
            aria-expanded={keyOpen}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-start"
          >
            <span className="min-w-0 truncate text-sm font-black">
              {[grid?.title, ...shownOver.map((x) => x.title)].filter(Boolean).join(" · ")}
            </span>
            <span aria-hidden className={`text-muted transition ${keyOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {keyOpen && (
            <div className="max-h-[38vh] overflow-y-auto px-3.5 pb-3">
              {grid && (
                <div>
                  <p className="text-xs leading-5">{grid.note}</p>
                  {grid.sub && <p className="text-[11px] leading-5 text-muted">{grid.sub}</p>}
                  {grid.legend && grid.key !== "soil" && (
                    // Low to high from the left, as every such bar is read.
                    <div className="mt-2" dir="ltr">
                      <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-border">
                        {grid.legend.map((b) => (
                          <span key={b.label} className="flex-1" style={{ background: b.colour === "rgba(0,0,0,0)" ? "var(--card)" : b.colour }} />
                        ))}
                      </div>
                      <div className="mt-1 flex text-[10px] leading-tight text-muted">
                        {grid.legend.map((b) => (
                          <span key={b.label} className="flex-1 text-center" dir={locale === "en" ? "ltr" : "rtl"}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                      {grid.unit && (
                        <p className="mt-0.5 text-center text-[11px] text-muted" dir={locale === "en" ? "ltr" : "rtl"}>
                          {grid.unit}
                        </p>
                      )}
                    </div>
                  )}
                  {grid.legend && grid.key === "soil" && (
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      {grid.legend.map((b) => (
                        <li key={b.label} className="flex items-center gap-1.5">
                          <span className="size-3 shrink-0 rounded-sm ring-1 ring-border" style={{ background: b.colour }} />
                          {b.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {grid.key === "lands" && grid.overlays.length > 0 && (
                    <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <span className="inline-block size-4 rounded-full bg-[#0f5a32]" />
                      {t("الرقم عدد الأراضي الموثّقة في المربّع (نحو ١٦٧ كم)", "The number is the count of verified lands in the square (about 167 km)")}
                    </p>
                  )}
                </div>
              )}
              {shownOver.map((x) => (
                <div key={x.key} className={grid || x !== shownOver[0] ? "mt-2.5 border-t border-border pt-2" : ""}>
                  <p className="text-xs leading-5">{x.note}</p>
                  {x.key2 && (
                    <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      {x.key2.map((k) => (
                        <li key={k.label} className="flex items-center gap-1.5">
                          {k.shape === "dot" ? (
                            <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white" style={{ background: k.colour }} />
                          ) : (
                            <span
                              className={`w-5 shrink-0 ${k.shape === "dash" ? "border-t-2 border-dashed" : "h-1 rounded-full"}`}
                              style={k.shape === "dash" ? { borderColor: k.colour } : { background: k.colour }}
                            />
                          )}
                          {k.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <p className="mt-2 text-[11px] text-muted">{t("المس أيّ لونٍ أو علامةٍ لتعرف ما هي.", "Tap any colour or mark to see what it is.")}</p>
            </div>
          )}
        </div>
      )}
    </LiveMap>
  );
}
