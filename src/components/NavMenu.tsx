"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * One menu instead of eight links across the bar.
 *
 * The old navbar grew an item per feature until it wrapped onto two lines on a
 * phone and read as a wall. Grouping them behind a single control keeps the bar
 * legible however many sections the platform ends up with, and gives the
 * assistant a permanent home that does not depend on spotting a floating
 * button.
 */
export default function NavMenu({
  groups,
  signOut,
}: {
  groups: NavGroup[];
  signOut?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:border-primary"
      >
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="block h-[2px] w-4 bg-current" />
          <span className="block h-[2px] w-4 bg-current" />
          <span className="block h-[2px] w-4 bg-current" />
        </span>
        القائمة
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
            }}
            className="flex w-full items-center gap-2 border-b border-border bg-primary/10 px-4 py-3 text-right text-sm font-bold text-primary transition hover:bg-primary/15"
          >
            <span aria-hidden>💬</span>
            اسأل مساعد سودجري
          </button>

          {groups.map((group) => (
            <div
              key={group.title}
              className="border-b border-border last:border-0"
            >
              <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted">
                {group.title}
              </p>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    // Closed on selection rather than by watching the path, so
                    // the menu never lingers over the page being navigated to.
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2.5 text-sm transition hover:bg-background ${
                      active ? "font-bold text-primary" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {signOut && <div className="px-4 py-3">{signOut}</div>}
        </div>
      )}
    </div>
  );
}
