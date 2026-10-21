import Link from "next/link";

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
 * On a phone the tabs are a grid of equal cells, every name whole. A first
 * draft scrolled them sideways with the edges faded, and the owner read the
 * cut-off name at the edge as a page that does not display properly
 * («أرى أنّه لا يُعرض جيداً») — which, on a phone, is what it was. Four tabs
 * are two rows of two, up to six are rows of three, more are rows of four;
 * from `sm` up they sit in one row.
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
  const n = tabs.length;
  const phone = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  return (
    <nav
      aria-label={label}
      className="mb-6 grid grid-cols-[repeat(var(--tabs-phone),minmax(0,1fr))] gap-1.5 rounded-2xl bg-card p-1.5 shadow-card ring-1 ring-border sm:grid-cols-[repeat(var(--tabs-wide),minmax(0,1fr))]"
      style={{ "--tabs-phone": phone, "--tabs-wide": Math.min(n, 8) } as React.CSSProperties}
    >
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl px-1.5 py-2 text-center text-[13px] font-bold leading-tight transition sm:text-sm ${
              on ? "tab-on" : "bg-background text-muted hover:bg-rose/10 hover:text-rose"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
