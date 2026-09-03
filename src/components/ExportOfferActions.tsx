"use client";

import { useState } from "react";
import { moveOffer, type ActionResult } from "@/app/export/offers/actions";
import type { OfferStatus } from "@/lib/exportOffers";

/**
 * ما يستطيع المزارعُ فعلَه بعرضه، وما لا يظهر أصلاً.
 *
 * The buttons offered are derived from the state machine in the migration, not
 * from a second list kept here: draft submits or withdraws, submitted comes
 * back, rejected returns to draft to be fixed. Published and withdrawn offer
 * nothing, because a farmer cannot unpublish their own goods and there is no
 * transition to give them one.
 *
 * Showing a button the database would refuse is worse than showing none: it
 * promises an act and then reports a failure the person cannot interpret.
 */
export default function ExportOfferActions({
  offerId,
  status,
}: {
  offerId: string;
  status: OfferStatus;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const moves: { to: "submitted" | "draft" | "withdrawn"; label: string; primary?: boolean }[] =
    status === "draft"
      ? [
          { to: "submitted", label: "أرسل للمراجعة", primary: true },
          { to: "withdrawn", label: "اسحب" },
        ]
      : status === "submitted"
        ? [{ to: "draft", label: "أعده مسوّدة" }]
        : status === "rejected"
          ? [{ to: "draft", label: "أصلحه وأعده مسوّدة", primary: true }]
          : [];

  if (moves.length === 0 && !result) return null;

  async function run(to: "submitted" | "draft" | "withdrawn") {
    if (pending) return;
    setPending(true);
    try {
      setResult(await moveOffer(offerId, to));
    } catch {
      setResult({
        ok: false,
        message: "تعذّر الوصول إلى الخادم. أعد المحاولة.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {moves.map((m) => (
          <button
            key={m.to}
            type="button"
            onClick={() => run(m.to)}
            disabled={pending}
            className={
              m.primary
                ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                : "rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50"
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {result && (
        <p
          role="status"
          className={`mt-2 text-sm ${result.ok ? "text-muted" : "text-danger"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
