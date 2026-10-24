/**
 * Shown the moment a link is tapped, while the next page is read (the review
 * of 23 October, UX-4: after a tap the screen stayed still for a second or
 * more, and people thought the site had frozen). A small pink ring and one
 * word; no text that needs the locale, so it can render before anything else.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <span className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary motion-reduce:animate-none" />
      <span className="text-sm font-bold text-muted">…</span>
      <span className="sr-only">Loading — جارٍ التحميل</span>
    </div>
  );
}
