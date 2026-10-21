"use client";

/**
 * The agreement is read on the platform, not copied out of it (backlog 127:
 * «العقد يُوقَّع في صفحة المنصّة بدون نسخ أو تنزيل»). No selection, no copy,
 * no long-press menu, and nothing to print — the print stylesheet replaces it
 * with a line saying where the agreement lives. A stamped copy for an official
 * body is issued by Sudagri on request, which is what keeps the record
 * retrievable as the Electronic Transactions Act 2007, art. 10, expects.
 */
export default function NoCopy({ children, printNote }: { children: React.ReactNode; printNote: string }) {
  const stop = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <>
      <div
        className="select-none [-webkit-touch-callout:none] print:hidden"
        onCopy={stop}
        onCut={stop}
        onContextMenu={stop}
        onDragStart={stop}
      >
        {children}
      </div>
      <p className="hidden print:block">{printNote}</p>
    </>
  );
}
