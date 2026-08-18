/**
 * Which menu entry the reader is currently on.
 *
 * This is small enough to look obvious and was wrong for as long as it lived
 * inside the menu component. The old rule was "highlight when the path starts
 * with the href", applied to every entry independently — so standing on
 * /services/mine highlighted both "جهتي كمقدّم خدمة" and "كتالوج الخدمات",
 * because /services/mine does start with /services.
 *
 * Nobody noticed while the two links sat in different sections of a long list.
 * Grouping the contracted-services links together put them three lines apart
 * and made two bold entries obviously wrong.
 *
 * The fix is to decide once for the whole menu instead of once per entry: the
 * longest matching href wins, and everything else is inactive. Prefix matching
 * still has to happen — /seasons/42 has no entry of its own and should light up
 * "مواسمي" — so the answer cannot simply be equality.
 */

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  title: string;
  /** One line under the title saying what the section is for. */
  hint?: string;
  items: NavItem[];
}

/**
 * Does this entry cover this path at all?
 *
 * The boundary check matters: without it /services would match /services-old,
 * and /admin would match /administration.
 */
export function matchesPath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The single entry to highlight — longest match, or null off-menu. */
export function activeHref(
  groups: NavGroup[],
  pathname: string,
): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (!matchesPath(item.href, pathname)) continue;
      if (best === null || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/** The section to open on its own, so the menu opens where the reader is. */
export function groupForPath(
  groups: NavGroup[],
  pathname: string,
): string | null {
  const href = activeHref(groups, pathname);
  if (href === null) return null;
  return groups.find((g) => g.items.some((i) => i.href === href))?.title ?? null;
}
