"use client";

import Link from "next/link";
import { useId, useRef, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";
import { activeHref, groupForPath, type NavGroup } from "@/lib/nav";

export type { NavItem, NavGroup } from "@/lib/nav";

/**
 * One menu instead of eight links across the bar, and one section open at a
 * time inside it.
 *
 * The bar became a menu when it grew an item per feature and wrapped onto two
 * lines on a phone. The menu then grew the same problem: every section printed
 * every one of its links at once, so eight groups and twenty-two links arrived
 * as a single scroll with the headings buried in it. Nothing was hidden and
 * nothing was findable.
 *
 * So the sections collapse. A closed accordion shows the titles — the whole
 * shape of the platform on one screen — and opening one shows only what is
 * inside it. Because the point is to shorten the list, opening a section closes
 * the previous one; leaving them all open would rebuild the wall a click at a
 * time.
 *
 * The section holding the current page opens on its own, so the menu opens
 * showing where the reader already is rather than making them find it.
 *
 * Which entry counts as current lives in lib/nav.ts, where it can be tested —
 * it was wrong here for months.
 */

export default function NavMenu({
  groups,
  signOut,
}: {
  groups: NavGroup[];
  signOut?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const baseId = useId();
  const current = activeHref(groups, pathname);

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

  // Chosen here rather than in an effect: an effect that calls setState on open
  // is the pattern the React Compiler rejects, and this is the moment the
  // choice is actually made anyway.
  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpenGroup(groupForPath(groups, pathname));
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={toggleMenu}
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
          className="absolute end-0 top-full z-50 mt-2 max-h-[80vh] w-72 overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
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

          {groups.map((group) => {
            const expanded = openGroup === group.title;
            const holdsCurrentPage = group.items.some(
              (item) => item.href === current,
            );
            const sectionId = `${baseId}-${group.title}`;

            return (
              <div
                key={group.title}
                className="border-b border-border last:border-0"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={sectionId}
                  onClick={() => setOpenGroup(expanded ? null : group.title)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-background"
                >
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={`text-sm font-semibold ${
                        holdsCurrentPage ? "text-primary" : ""
                      }`}
                    >
                      {group.title}
                    </span>
                    {group.hint && (
                      <span className="text-xs font-normal text-muted">
                        {group.hint}
                      </span>
                    )}
                  </span>

                  <span className="flex items-center gap-2">
                    {/* A closed section says how much is inside it, so the
                        reader can judge whether it is worth opening. */}
                    {!expanded && (
                      <span className="text-xs text-muted">
                        {group.items.length}
                      </span>
                    )}
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      // Points down when open; rotated a quarter turn it points
                      // to the left, which is the closed direction in RTL.
                      className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${
                        expanded ? "" : "rotate-90"
                      }`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {expanded && (
                  <div id={sectionId} className="pb-2">
                    {group.items.map((item) => {
                      const active = item.href === current;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          // Closed on selection rather than by watching the
                          // path, so the menu never lingers over the page being
                          // navigated to.
                          onClick={() => setOpen(false)}
                          className={`block border-e-2 py-2.5 pe-4 ps-8 text-sm transition hover:bg-background ${
                            active
                              ? "border-e-primary font-bold text-primary"
                              : "border-e-transparent"
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

          {signOut && <div className="px-4 py-3">{signOut}</div>}
        </div>
      )}
    </div>
  );
}
