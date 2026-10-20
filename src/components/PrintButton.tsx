"use client";

/**
 * «اطبع أو احفظ PDF» — the one thing a printable page needs script for. On a
 * phone the browser's print sheet is also where "save as PDF" lives, which is
 * how the file reaches the exporter on WhatsApp.
 */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 print:hidden"
    >
      {label}
    </button>
  );
}
