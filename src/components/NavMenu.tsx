"use client";

import Link from "next/link";
import { useId, useRef, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { signInFrom } from "@/lib/authEntry";
import { MENU_STATE_EVENT, OPEN_ASSISTANT_EVENT, TOGGLE_MENU_EVENT } from "@/lib/events";
import { activeHref, groupForPath, type NavGroup } from "@/lib/nav";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import Icon from "./Icon";
import PaletteSwitch from "./PaletteSwitch";

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
  const locale = useLocale();
  /** The open state as the bottom bar's toggle reads it, outside React's render. */
  const openRef = useRef(open);

  // The bottom bar on a phone (backlog 122) opens and closes this same menu,
  // and lights its own «القائمة» while the menu is open.
  useEffect(() => {
    openRef.current = open;
    window.dispatchEvent(new CustomEvent(MENU_STATE_EVENT, { detail: open }));
  }, [open]);
  useEffect(() => {
    const onToggle = () => {
      if (openRef.current) {
        setOpen(false);
        return;
      }
      setOpenGroup(groupForPath(groups, window.location.pathname));
      setOpen(true);
    };
    window.addEventListener(TOGGLE_MENU_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_MENU_EVENT, onToggle);
  }, [groups]);

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
        // On a phone the bottom bar carries «القائمة», so the header does
        // not show the same button a second time.
        // On the header, so in the header's ink (`.hdr-chip`), with a gold edge while open.
        className="hdr-chip hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition sm:flex"
      >
        {/* Three bars, the middle one shorter, so the mark reads as a list and not as a flag. */}
        <span aria-hidden className="flex flex-col items-end gap-[3px]">
          <span className="block h-[2px] w-4 rounded-full bg-current" />
          <span className="block h-[2px] w-3 rounded-full bg-current" />
          <span className="block h-[2px] w-4 rounded-full bg-current" />
        </span>
        {tr(locale, "القائمة", "Menu")}
      </button>

      {/* On a phone the menu is a sheet across the screen under the header,
          with the page dimmed behind it: a 21rem dropdown hung off the
          button's edge left a strip of page showing beside it and wrapped
          every section's hint onto a second line («لا يُعرض جيداً»). From
          `sm` up it is the dropdown again. A tap on the dimmed page closes
          it, through the outside-tap listener above. On a phone the sheet's
          end is padded by the height of the assistant's floating button,
          which rests over its lower corner: scrolled to the end, the colours
          switch and «خروج» sit above it rather than under it. */}
      {open && (
        // The header is 3px of brand edge and a 4rem row (Navbar), so the dimming starts where it ends.
        <div aria-hidden className="fixed inset-x-0 bottom-0 top-[calc(4rem_+_3px)] z-30 bg-foreground/30 sm:hidden" />
      )}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          // text-foreground: the sheet hangs from the header, whose ink is white on the logo palette, and the section
          // titles inherited it — white on the white card (owner, 6 November 2026: «غير واضحة في قائمة الويب»).
          className="fixed inset-x-3 top-[calc(4.5rem_+_3px)] z-50 pb-16 sm:pb-0 max-h-[calc(100dvh_-_5.9rem_-_var(--nav-bottom))] overflow-y-auto rounded-3xl border border-border bg-card text-foreground shadow-float sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:max-h-[80vh] sm:w-[22rem]"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
            }}
            className="flex w-full items-center gap-3 border-b border-border bg-primary/10 px-4 py-3.5 text-start text-sm font-bold text-primary transition hover:bg-primary/15"
          >
            <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon name="message" className="size-5" />
            </span>
            {tr(locale, "اسأل مساعد سوداقري", "Ask the Sudagri assistant")}
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
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition hover:bg-background ${
                    expanded ? "bg-background" : ""
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {/* The section's mark. Solid pink when the page you are
                        on is inside it, so the closed menu still says where
                        you are. */}
                    {group.icon && (
                      <span
                        aria-hidden
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          holdsCurrentPage ? "tab-on" : "bg-rose/10 text-rose"
                        }`}
                      >
                        <Icon name={group.icon} className="size-5" />
                      </span>
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span
                        className={`text-sm font-bold ${
                          holdsCurrentPage ? "text-rose" : ""
                        }`}
                      >
                        {group.title}
                      </span>
                      {group.hint && (
                        <span className="text-xs font-normal leading-snug text-muted">
                          {group.hint}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="flex items-center gap-2">
                    {/* A closed section says how much is inside it, so the
                        reader can judge whether it is worth opening. */}
                    {!expanded && (
                      <span className="figure min-w-6 rounded-full bg-background px-1.5 text-center text-xs font-bold text-muted">
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
                  <div id={sectionId} className="bg-background pb-2">
                    {group.items.map((item) => {
                      const active = item.href === current;
                      return (
                        <Link
                          key={item.href}
                          // The menu is drawn once by the layout, so its sign-in item is pointed back at the page shown now, here.
                          href={item.href === "/login" ? signInFrom(pathname) : item.href}
                          role="menuitem"
                          // Closed on selection rather than by watching the
                          // path, so the menu never lingers over the page being
                          // navigated to.
                          onClick={() => setOpen(false)}
                          // Indented to the title's text, past the icon, so
                          // the entries read as inside their section.
                          className={`mx-2 block rounded-xl py-2.5 pe-3 ps-14 text-sm transition ${
                            active
                              ? "bg-rose/10 font-bold text-rose"
                              : "hover:bg-card"
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

          {/* The site's colours (the owner, 6 November 2026), for everyone, signed in or not. */}
          <PaletteSwitch className="px-4 py-3" />
          {signOut && <div className="border-t border-border px-4 py-3">{signOut}</div>}
        </div>
      )}
    </div>
  );
}
