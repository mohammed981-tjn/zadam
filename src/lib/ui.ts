/**
 * The class strings every form on the site shares (backlog 121).
 *
 * The nafir and supply frames each exported their own `field` and `button`,
 * a few pixels apart, and a dozen pages wrote a third and fourth by hand — so
 * the same input was a different height depending on which section it lived
 * in. These are the one copy; the frames re-export them so nothing that
 * imports from there has to change.
 *
 * `text-base` on a phone is deliberate: iOS zooms the page into any input set
 * below 16px, and the zoom does not undo itself when the keyboard closes.
 * Focus turns orange because orange is the site's «you are here».
 */
export const field =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base transition focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/20 sm:text-sm";

export const label = "flex flex-col gap-1 text-sm";

export const button =
  "rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-card transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50";

export const ghost =
  "rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:border-orange hover:text-orange";

export const card = "rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5";
