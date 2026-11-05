"use client";

import { useState } from "react";
import { markInterest, type MarkResult } from "@/app/admin/export/interests/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

const STATUS_LABEL: Record<string, string> = {
  new: "جديد",
  contacted: "تواصلتُ معه",
  closed: "مُغلق",
};

const STATUS_LABEL_EN: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

/**
 * بطاقةُ طلبِ مشترٍ، بوسائل اتّصاله والعرض الذي سأل عنه.
 *
 * The contact details are shown as links — a phone that dials and a mail that
 * opens a compose window — because the whole job of this screen is to get from
 * "a buyer wrote" to "someone replied" in as few steps as possible. Every step
 * between those two is a day the buyer spends talking to somebody else.
 */
export default function InterestCard({
  id,
  status,
  handledNote,
  createdAt,
  buyer,
  wanted,
  message,
  offer,
}: {
  id: string;
  status: "new" | "contacted" | "closed";
  handledNote: string | null;
  createdAt: string;
  buyer: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
  };
  wanted: string | null;
  message: string | null;
  offer: {
    reference: string;
    commodity: string;
    destination: string;
    quantity: string;
  } | null;
}) {
  const [note, setNote] = useState(handledNote ?? "");
  const [current, setCurrent] = useState(status);
  const [result, setResult] = useState<MarkResult | null>(null);
  const [pending, setPending] = useState(false);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  async function mark(next: "contacted" | "closed" | "new") {
    if (pending) return;
    setPending(true);
    try {
      const outcome = await markInterest(id, next, note);
      setResult(outcome);
      if (outcome.ok) setCurrent(next);
    } catch {
      setResult({ ok: false, message: t("تعذّر الوصول إلى الخادم.", "Could not reach the server.") });
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className={`rounded-xl border p-4 ${
        current === "new"
          ? "border-accent/50 bg-accent/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">
          {buyer.name}
          {buyer.company && (
            <span className="text-muted"> — {buyer.company}</span>
          )}
        </h2>
        <span className="text-xs text-muted">
          {(locale === "en" ? STATUS_LABEL_EN : STATUS_LABEL)[current]} ·{" "}
          {new Date(createdAt).toLocaleString(locale === "en" ? "en-GB" : "ar-EG")}
        </span>
      </div>

      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" dir="auto">
        {buyer.email && (
          <a href={`mailto:${buyer.email}`} className="text-primary underline" dir="ltr">
            {buyer.email}
          </a>
        )}
        {buyer.phone && (
          <a href={`tel:${buyer.phone}`} className="text-primary underline" dir="ltr">
            {buyer.phone}
          </a>
        )}
        {buyer.country && <span className="text-muted">{buyer.country}</span>}
      </p>

      {offer && (
        <p className="mt-2 text-sm text-muted">
          {t("عن", "About")} <span className="font-mono">{offer.reference}</span> ·{" "}
          {offer.commodity} {locale === "en" ? "→" : "←"} {offer.destination} ·{" "}
          {t("معروض", "Offered")} {offer.quantity}
          {wanted && (
            <>
              {" "}
              · <strong>{t("يطلب", "Wants")} {wanted}</strong>
            </>
          )}
        </p>
      )}

      {message && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm">
          {message}
        </p>
      )}

      <label className="mt-3 block text-xs font-medium" htmlFor={`note-${id}`}>
        {t("ملاحظتك — ماذا حدث مع هذا الطلب", "Your note — what happened with this request")}
      </label>
      <input
        id={`note-${id}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        placeholder={t(
          "مثال: أرسلتُ له ملفّ الإرسالية، ينتظر عيّنة.",
          "Example: sent him the consignment file, he is waiting for a sample.",
        )}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {current !== "contacted" && (
          <button
            type="button"
            onClick={() => mark("contacted")}
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("تواصلتُ معه", "Contacted")}
          </button>
        )}
        {current !== "closed" && (
          <button
            type="button"
            onClick={() => mark("closed")}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50"
          >
            {t("أغلِق", "Close")}
          </button>
        )}
        {current !== "new" && (
          <button
            type="button"
            onClick={() => mark("new")}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-50"
          >
            {t("أعِده جديداً", "Mark as new")}
          </button>
        )}
      </div>

      {result && (
        <p
          role="status"
          className={`mt-2 text-xs ${result.ok ? "text-muted" : "text-danger"}`}
        >
          {result.message}
        </p>
      )}
    </li>
  );
}
