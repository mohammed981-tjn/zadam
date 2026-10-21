import Link from "next/link";

export interface SectionTab {
  href: string;
  label: string;
}

/** On a phone, a row holds this many cells; more tabs fold into «المزيد». */
const PHONE_ROW = 4;

/**
 * One tab bar for every section that has sub-pages (backlog 121).
 *
 * The nafir, supply and partner sections each carried their own copy of the
 * same row of pills, and the market pages had none — just a back link on one
 * page and a cluster of «←» buttons on another. Four ways of saying «these
 * pages belong together». This is the one way.
 *
 * One row, always (backlog 122). The research the owner asked for agrees from
 * every side: tabs sit in a single row (Material; BBC GEL), wrapping them onto
 * a second line is to be avoided (CMS design system), and the fewer the better
 * — about four fit a phone (NN/g «Tabs, Used Right»; BBC: «roughly three»). A
 * first draft scrolled the row sideways and the cut-off name at its edge read
 * as a broken page; a second wrapped it into two rows, which the guidance
 * rules out. So on a phone a section with more than four pages shows three, the
 * one you are on if it is not among them, and «المزيد» holding the rest. From
 * `sm` up every tab fits in the row.
 *
 * «المزيد» is a `<details>`: it opens without any script, and a phone on a
 * slow connection can use it before the page has finished loading.
 */
export default function SectionTabs({
  tabs,
  active,
  label,
  moreLabel = "المزيد",
}: {
  tabs: SectionTab[];
  active: string;
  label: string;
  moreLabel?: string;
}) {
  const cell = (on: boolean) =>
    `flex min-h-11 items-center justify-center rounded-xl px-1.5 py-2 text-center text-[13px] font-bold leading-tight transition sm:text-sm ${
      on ? "tab-on" : "text-muted hover:bg-rose/10 hover:text-rose"
    }`;
  const link = (t: SectionTab) => (
    <Link key={t.href} href={t.href} aria-current={t.href === active ? "page" : undefined} className={cell(t.href === active)}>
      {t.label}
    </Link>
  );

  const folds = tabs.length > PHONE_ROW;
  let shown = tabs;
  let rest: SectionTab[] = [];
  if (folds) {
    const lead = tabs.slice(0, PHONE_ROW - 1);
    const current = tabs.find((t) => t.href === active);
    // The page you are on is always in view: it takes the third place if it
    // would otherwise be inside «المزيد».
    shown = current && !lead.includes(current) ? [...lead.slice(0, PHONE_ROW - 2), current] : lead;
    rest = tabs.filter((t) => !shown.includes(t));
  }

  return (
    <nav aria-label={label} className="mb-6 rounded-2xl bg-card p-1.5 shadow-card ring-1 ring-border">
      {/* A phone: one row of at most four cells. */}
      <div
        className="grid gap-1.5 sm:hidden"
        style={{ gridTemplateColumns: `repeat(${folds ? PHONE_ROW : tabs.length}, minmax(0, 1fr))` }}
      >
        {shown.map(link)}
        {folds && (
          <details className="group relative">
            <summary className={`${cell(false)} cursor-pointer list-none gap-1 [&::-webkit-details-marker]:hidden`}>
              {moreLabel}
              <svg aria-hidden viewBox="0 0 24 24" className="size-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="absolute end-0 top-full z-30 mt-2 flex w-48 flex-col gap-1 rounded-2xl bg-card p-1.5 shadow-float ring-1 ring-border">
              {rest.map((t) => (
                <Link key={t.href} href={t.href} className="rounded-xl px-3 py-2.5 text-sm font-bold text-foreground hover:bg-rose/10 hover:text-rose">
                  {t.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Wider: every tab in the one row. */}
      <div className="hidden gap-1.5 sm:grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(link)}
      </div>
    </nav>
  );
}
