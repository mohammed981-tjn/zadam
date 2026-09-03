"use client";

import { useState } from "react";
import {
  addCustodyEvent,
  attachEvidence,
  type ActionResult,
} from "@/app/export/offers/[id]/actions";

interface Origin {
  plot_ref: string;
  area_hectares: string | null;
  latitude: string;
  longitude: string;
  boundary: unknown | null;
}
interface Custody {
  sequence: number;
  occurred_at: string;
  place_name: string;
  latitude: string | null;
  longitude: string | null;
  note: string | null;
}
interface Evidence {
  id: string;
  kind: string;
  captured_at: string | null;
  storage_path: string;
  sha256: string | null;
}
interface Requirement {
  mode: string;
  document_type: { name_ar: string; note_ar: string | null } | null;
}
interface Available {
  id: string;
  kind: string;
  caption: string | null;
  captured_at: string | null;
  storage_path: string;
}

const MODE_LABEL: Record<string, string> = {
  required: "إلزامي",
  conditional: "مشروط",
  recommended: "مُستحسَن",
};

/**
 * الأدلّةُ والعهدة — الجزءُ الذي يُبنى على مرّات.
 *
 * WHY THE CUSTODY CHAIN HAS NO EDIT CONTROL
 *
 * Because the database has no edit path: two rules refuse UPDATE and DELETE on
 * that table outright. Rendering a pencil that the database would ignore is
 * worse than rendering none — it promises a correction that silently does not
 * happen, which is the failure mode this platform has hit before.
 *
 * WHY AN UNHASHED PIECE OF EVIDENCE IS LABELLED AND NOT HIDDEN
 *
 * A fingerprint is what lets an auditor ask for the original two years from now
 * and prove it was not swapped. When the file could not be read, the evidence
 * is still worth attaching but is worth less — so it says «بلا بصمة» rather
 * than looking identical to evidence that carries one.
 */
export default function ExportOfferDetail({
  offerId,
  editable,
  origins,
  custody,
  evidence,
  requirements,
  frozenAt,
  available,
}: {
  offerId: string;
  editable: boolean;
  origins: Origin[];
  custody: Custody[];
  evidence: Evidence[];
  requirements: Requirement[];
  frozenAt: string | null;
  available: Available[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const box = "mt-6 rounded-xl border border-border bg-card p-4";
  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

  async function submitCustody(formData: FormData) {
    setBusy(true);
    try {
      setResult(await addCustodyEvent(offerId, formData));
    } catch {
      setResult({ ok: false, message: "تعذّر الوصول إلى الخادم." });
    } finally {
      setBusy(false);
    }
  }

  async function attach(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      setResult(await attachEvidence(offerId, id));
    } catch {
      setResult({ ok: false, message: "تعذّر الوصول إلى الخادم." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {result && (
        <p
          role="status"
          className={`mt-4 rounded-lg border p-3 text-sm ${
            result.ok
              ? "border-border bg-background"
              : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {result.message}
        </p>
      )}

      <section className={box}>
        <h2 className="font-medium">المنشأ</h2>
        {origins.length === 0 ? (
          <p className="mt-1 text-sm text-danger">بلا إحداثيّة.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {origins.map((o, i) => (
              <li key={i}>
                {o.plot_ref} · {o.latitude}, {o.longitude}
                {o.area_hectares ? ` · ${o.area_hectares} هكتار` : ""} ·{" "}
                {o.boundary ? "بمضلَّع" : "نقطة"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={box}>
        <h2 className="font-medium">سلسلة العهدة</h2>
        <p className="mt-1 text-xs text-muted">
          تُلحَق ولا تُعدَّل ولا تُحذف — وسلسلةٌ يمكن تعديلُها ليست سلسلةَ عهدة.
        </p>

        {custody.length === 0 ? (
          <p className="mt-2 text-sm text-muted">لا أحداثَ بعد.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm">
            {custody.map((c) => (
              <li key={c.sequence} className="border-r-2 border-border pr-3">
                <span className="font-medium">{c.sequence}.</span> {c.place_name}
                <div className="text-xs text-muted">
                  {new Date(c.occurred_at).toLocaleString("ar-EG")}
                  {c.latitude ? ` · ${c.latitude}, ${c.longitude}` : ""}
                </div>
                {c.note && <div className="text-xs text-muted">{c.note}</div>}
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <form action={submitCustody} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium" htmlFor="place_name">
                المكان
              </label>
              <input id="place_name" name="place_name" className={field} required />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="occurred_at">
                الوقت
              </label>
              <input
                id="occurred_at"
                name="occurred_at"
                type="datetime-local"
                className={field}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium" htmlFor="latitude">
                  خط العرض
                </label>
                <input id="latitude" name="latitude" className={field} inputMode="decimal" />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="longitude">
                  خط الطول
                </label>
                <input id="longitude" name="longitude" className={field} inputMode="decimal" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium" htmlFor="note">
                ملاحظة
              </label>
              <input id="note" name="note" className={field} />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="justify-self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              أضف حدثاً
            </button>
          </form>
        )}
      </section>

      <section className={box}>
        <h2 className="font-medium">الأدلّة</h2>
        {evidence.length === 0 ? (
          <p className="mt-1 text-sm text-danger">
            بلا أدلّة — لا شيء يسند ما يقوله العرض.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {evidence.map((e) => (
              <li key={e.id}>
                {e.kind}
                {e.captured_at
                  ? ` · ${new Date(e.captured_at).toLocaleDateString("ar-EG")}`
                  : ""}{" "}
                ·{" "}
                {e.sha256 ? (
                  <span className="font-mono text-xs">{e.sha256.slice(0, 12)}…</span>
                ) : (
                  <span className="text-danger">بلا بصمة</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">أدلّةُ الموسم — أَلحِق ما يخصّ هذه البضاعة</h3>
            {available.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                لا أدلّةَ إضافيةً في الموسم المرتبط بهذا العرض.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {available.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
                  >
                    <span>
                      {a.kind}
                      {a.caption ? ` — ${a.caption}` : ""}
                      {a.captured_at
                        ? ` · ${new Date(a.captured_at).toLocaleDateString("ar-EG")}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => attach(a.id)}
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-background disabled:opacity-50"
                    >
                      أَلحِق
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              البصمةُ تُحسب من الملفّ نفسِه لا من مساره — بصمةٌ من المسار تتطابق
              دائماً ولا تكشف تبديلاً أبداً.
            </p>
          </div>
        )}
      </section>

      {frozenAt && (
        <section className={box}>
          <h2 className="font-medium">المستندات المطلوبة — مجمَّدةٌ لهذا العرض</h2>
          <p className="mt-1 text-xs text-muted">
            نسخةٌ ممّا كان سارياً لحظةَ الإرسال في{" "}
            {new Date(frozenAt).toLocaleString("ar-EG")}. اللوائحُ تتغيّر، وهذه لا
            تتغيّر معها — فيبقى «ماذا كان مطلوباً؟» سؤالاً له جواب.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {requirements.map((r, i) => (
              <li key={i}>
                <strong>{r.document_type?.name_ar}</strong>{" "}
                <span className="text-xs text-muted">
                  ({MODE_LABEL[r.mode] ?? r.mode})
                </span>
                {r.document_type?.note_ar && (
                  <span className="block text-xs text-muted">
                    {r.document_type.note_ar}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
