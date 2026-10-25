"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { activeHref, groupForPath, type NavGroup } from "@/lib/nav";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import Icon from "./Icon";

/**
 * القائمة الجانبيّة على الشاشة العريضة (البند ٢٠١؛ المالك، 25 أكتوبر 2026:
 * «تصميم هذا تصميم تطبيق، اجعلها dashboard»).
 *
 * On a phone the platform is an app: a bar at the bottom and the menu as a sheet.
 * On a computer that same menu behind a button made the screen read as a phone
 * held sideways. From `lg` up the menu is a column of its own, always there, as
 * a dashboard's is: the sections with their marks, the one holding the current
 * page open, and any other a click away; several may be open at once, since
 * the column has the height for it. The same groups as the phone's menu
 * (Navbar builds them once), so the two never disagree about what is where.
 */
export default function DesktopSidebar({
  groups,
  account,
}: {
  groups: NavGroup[];
  account?: React.ReactNode;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const current = activeHref(groups, pathname);
  const here = groupForPath(groups, pathname);
  const [opened, setOpened] = useState<Set<string>>(() => new Set(here ? [here] : []));
  // A page in a closed section opens it, without closing what the reader opened.
  const isOpen = (title: string) => opened.has(title) || title === here;

  return (
    <aside
      aria-label={tr(locale, "أقسام المنصّة", "Platform sections")}
      className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-border bg-card print:hidden lg:flex"
    >
      <div className="brand-edge" aria-hidden />
      <Link href="/" className="flex items-center gap-2 px-5 py-4 text-xl font-black text-primary">
        <span aria-hidden="true">🌾</span>
        {tr(locale, "سوداقري", "Sudagri")}
      </Link>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT))}
        className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-start text-sm font-bold text-primary transition hover:bg-primary/15"
      >
        <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon name="message" className="size-4" />
        </span>
        {tr(locale, "اسأل مساعد سوداقري", "Ask the Sudagri assistant")}
      </button>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group) => {
          const open = isOpen(group.title);
          const holdsCurrent = group.title === here;
          return (
            <div key={group.title} className="mt-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpened((s) => {
                    const n = new Set(s);
                    if (open) n.delete(group.title);
                    else n.add(group.title);
                    return n;
                  })
                }
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start text-sm font-bold transition hover:bg-background ${
                  holdsCurrent ? "text-rose" : ""
                }`}
              >
                {group.icon && (
                  <span
                    aria-hidden
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      holdsCurrent ? "tab-on" : "bg-rose/10 text-rose"
                    }`}
                  >
                    <Icon name={group.icon} className="size-4" />
                  </span>
                )}
                <span className="flex-1">{group.title}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "" : "rotate-90"}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {open && (
                <div className="pb-1">
                  {group.items.map((item) => {
                    const active = item.href === current;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-lg py-1.5 pe-2 ps-13 text-[0.8125rem] transition ${
                          active ? "bg-rose/10 font-bold text-rose" : "text-foreground/85 hover:bg-background"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {account && <div className="border-t border-border px-4 py-3">{account}</div>}
    </aside>
  );
}
