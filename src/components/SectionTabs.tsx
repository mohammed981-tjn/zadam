"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export interface SectionTab {
  href: string;
  label: string;
}

/**
 * One tab bar for every section that has sub-pages (backlog 121).
 *
 * The nafir, supply and partner sections each carried their own copy of the
 * same row of pills, and the market pages had none — just a back link on one
 * page and a cluster of «←» buttons on another. Four ways of saying «these
 * pages belong together». This is the one way.
 *
 * On a phone the row scrolls sideways instead of wrapping: eight pills wrapped
 * into three ragged lines above the content. The tab you are on is scrolled to
 * the middle of the row on load, so arriving on the seventh tab does not hide
 * it off the edge. That is the only script here, and it moves the row, never
 * the page — `scrollIntoView` would also scroll the window, which on a link
 * to `#section` drags the reader back up to the tabs.
 */
export default function SectionTabs({
  tabs,
  active,
  label,
}: {
  tabs: SectionTab[];
  active: string;
  label: string;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = strip.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !tab) return;
    const r = row.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    row.scrollLeft += t.left + t.width / 2 - (r.left + r.width / 2);
  }, [active]);

  return (
    <nav aria-label={label} className="mb-6 rounded-2xl bg-card p-1 shadow-card ring-1 ring-border">
      <div ref={strip} className="tab-strip flex gap-1 overflow-x-auto px-2 py-1">
        {tabs.map((t) => {
          const on = t.href === active;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                on ? "tab-on" : "text-muted hover:bg-orange-soft hover:text-orange"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
