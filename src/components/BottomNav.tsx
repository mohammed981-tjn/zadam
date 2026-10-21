"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { useLocale } from "./LocaleProvider";
import { tr } from "@/lib/i18n";
import { matchesPath } from "@/lib/nav";
import { MENU_STATE_EVENT, TOGGLE_MENU_EVENT } from "@/lib/events";

/**
 * The bar along the bottom of a phone (backlog 122).
 *
 * The research the owner asked for was plain on this one: navigation hidden
 * behind a menu button is used far less than navigation on screen — on mobile,
 * 57% of the time against 86% when it shows (NN/g, «Hamburger Menus and Hidden
 * Navigation Hurt UX Metrics»), and a bar at the bottom was faster to use than
 * the menu in a direct comparison (Tsiodoulos, KTH 2016). Material's rules for
 * such a bar are followed as written: three to five destinations, each an icon
 * with a one- or two-word label that is always shown, one marked as current,
 * and nothing that scrolls or moves.
 *
 * Four places people come back to, and the fifth opens the full menu — the
 * same one the header opens on a wider screen, where this bar is not shown.
 */
export default function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => setMenuOpen(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(MENU_STATE_EVENT, onState);
    return () => window.removeEventListener(MENU_STATE_EVENT, onState);
  }, []);

  const items: { href: string; icon: IconName; label: string; match: string[] }[] = [
    { href: "/", icon: "home", label: t("الرئيسية", "Home"), match: ["/"] },
    { href: "/market", icon: "chart", label: t("السوق", "Market"), match: ["/market", "/rates"] },
    signedIn
      ? { href: "/lands", icon: "wheat", label: t("مزرعتي", "My farm"), match: ["/lands", "/seasons", "/herds", "/my-project"] }
      : { href: "/signup", icon: "wheat", label: t("مزرعتك", "Your farm"), match: ["/signup", "/login"] },
    { href: "/nafir", icon: "people", label: t("النفير", "Nafir"), match: ["/nafir"] },
  ];

  const pill = (on: boolean) =>
    `flex h-8 w-14 items-center justify-center rounded-full transition ${on ? "bg-primary/15 text-primary" : "text-muted"}`;

  return (
    <nav
      aria-label={t("التنقّل الرئيسي", "Main navigation")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(202_44_114_/_0.08)] backdrop-blur-md sm:hidden print:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {items.map((it) => {
          const on = !menuOpen && it.match.some((m) => matchesPath(m, pathname));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-1"
              >
                <span className={pill(on)}>
                  <Icon name={it.icon} className="size-5" />
                </span>
                <span className={`text-[11px] leading-none ${on ? "font-extrabold text-primary" : "font-bold text-muted"}`}>
                  {it.label}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-expanded={menuOpen}
            // The menu closes itself on any press outside it; this press is
            // the toggle, so it must not reach that listener first.
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={() => window.dispatchEvent(new Event(TOGGLE_MENU_EVENT))}
            className="flex h-full w-full flex-col items-center justify-center gap-1"
          >
            <span className={pill(menuOpen)}>
              <span aria-hidden className="flex flex-col items-end gap-[3px]">
                <span className="block h-[2px] w-4 rounded-full bg-current" />
                <span className="block h-[2px] w-3 rounded-full bg-current" />
                <span className="block h-[2px] w-4 rounded-full bg-current" />
              </span>
            </span>
            <span className={`text-[11px] leading-none ${menuOpen ? "font-extrabold text-primary" : "font-bold text-muted"}`}>
              {t("القائمة", "Menu")}
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
