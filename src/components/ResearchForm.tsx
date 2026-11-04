"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES } from "@/lib/nafir";
import { RESEARCH_KINDS, RESEARCH_KIND_LABEL, RESEARCH_MAX_BYTES } from "@/lib/research";

/**
 * «شارك دراستك أو بحثك» (البند ٢٠٢). A visitor or a member fills one form; a PDF goes from the browser straight to
 * the private bucket through an upload link the server made for one path (a serverless function would refuse a body
 * that large), then the fields go to /api/research, which writes the row pending. Nothing here is published by being
 * sent.
 */
export default function ResearchForm() {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, lang: locale }),
    });
    return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; message?: string; path?: string; token?: string };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    const pdf = file instanceof File && file.size > 0 ? file : null;
    if (pdf && (pdf.type !== "application/pdf" || pdf.size > RESEARCH_MAX_BYTES)) {
      setError(t("الملفّ PDF حتى ٢٠ ميجابايت.", "The file is a PDF of up to 20 MB."));
      return;
    }
    if (!pdf && !String(fd.get("link_url") ?? "").trim()) {
      setError(t("أرفق ملفّ PDF أو ضع رابط العمل.", "Attach a PDF or give a link to the work."));
      return;
    }
    setBusy(true);
    try {
      let file_path = "";
      if (pdf) {
        const slot = await post({ step: "upload" });
        if (!slot.ok || !slot.path || !slot.token) throw new Error(slot.message ?? "");
        const { error: up } = await createClient().storage.from("research").uploadToSignedUrl(slot.path, slot.token, pdf, {
          contentType: "application/pdf",
        });
        if (up) throw new Error(t("تعذّر رفع الملفّ. تحقّق من الاتّصال وأعد المحاولة.", "The upload failed. Check the connection and try again."));
        file_path = slot.path;
      }
      const field = (k: string) => String(fd.get(k) ?? "");
      const sent = await post({
        step: "submit",
        kind: field("kind"),
        title: field("title"),
        authors: field("authors"),
        institution: field("institution"),
        year: field("year"),
        language: field("language"),
        crop: field("crop"),
        state: field("state"),
        abstract: field("abstract"),
        link_url: field("link_url"),
        contact: field("contact"),
        file_path,
        consent: fd.get("consent") === "on",
      });
      if (!sent.ok) throw new Error(sent.message ?? "");
      setDone(true);
    } catch (err) {
      setError((err as Error).message || t("تعذّر الإرسال الآن، حاول بعد قليل.", "Sending failed just now; try again shortly."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-lg font-black">{t("وصل عملك، شكراً لك.", "Your work has arrived — thank you.")}</p>
        <p className="mt-2 leading-8 text-muted">
          {t(
            "تراجعه الإدارة، ثمّ تنشره في المكتبة باسمك أو تردّه إليك بسبب. إن كنت مسجَّلاً فسيصلك إشعار، وتتابعه من «ما أرسلتُه».",
            "The team reviews it, then publishes it in the library under your name or returns it with a reason. If you are signed in you will be notified, and can follow it under «What I sent».",
          )}
        </p>
        <Link href="/library" className="mt-4 inline-block text-primary underline">
          {t("→ إلى المكتبة", "← To the library")}
        </Link>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-border bg-card px-3 py-2";
  const label = "flex flex-col gap-1 text-sm font-medium";
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className={label}>
        {t("نوع العمل", "Kind of work")}
        <select name="kind" required defaultValue="feasibility" className={input}>
          {RESEARCH_KINDS.map((k) => (
            <option key={k} value={k}>
              {tr(locale, ...RESEARCH_KIND_LABEL[k])}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        {t("العنوان", "Title")}
        <input name="title" required minLength={5} maxLength={200} className={input} />
      </label>
      <label className={label}>
        {t("المؤلّف أو المؤلّفون", "Author or authors")}
        <input name="authors" required minLength={2} maxLength={200} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t("الجهة (جامعة، مركز، شركة) — اختياريّ", "Institution (university, centre, company) — optional")}
          <input name="institution" maxLength={200} className={input} />
        </label>
        <label className={label}>
          {t("السنة — اختياريّ", "Year — optional")}
          <input name="year" inputMode="numeric" maxLength={4} className={input} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {t("المحصول أو الموضوع — اختياريّ", "Crop or subject — optional")}
          <input name="crop" maxLength={60} placeholder={t("السمسم، القطن، الريّ…", "Sesame, cotton, irrigation…")} className={input} />
        </label>
        <label className={label}>
          {t("الولاية — اختياريّ", "State — optional")}
          <select name="state" defaultValue="" className={input}>
            <option value="">{t("كلّ السودان", "All of Sudan")}</option>
            {SUDAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("اللغة", "Language")}
          <select name="language" defaultValue="ar" className={input}>
            <option value="ar">{t("العربيّة", "Arabic")}</option>
            <option value="en">{t("الإنجليزيّة", "English")}</option>
            <option value="other">{t("غيرهما", "Other")}</option>
          </select>
        </label>
      </div>
      <label className={label}>
        {t("الملخّص: ما الذي درسته، وكيف، وماذا وجدت", "Abstract: what you studied, how, and what you found")}
        <textarea name="abstract" required minLength={40} maxLength={3000} rows={6} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {t("الملفّ (PDF حتى ٢٠ ميجابايت)", "The file (PDF up to 20 MB)")}
          <input name="file" type="file" accept="application/pdf" className={input} />
        </label>
        <label className={label}>
          {t("أو رابط العمل إن كان منشوراً", "Or a link to the work, if it is published")}
          <input name="link_url" type="url" placeholder="https://" maxLength={500} className={input} />
        </label>
      </div>
      <label className={label}>
        {t(
          "كيف نصل إليك إن احتجنا — اختياريّ، ولا يُنشر (هاتف أو بريد)",
          "How we can reach you if needed — optional, never published (phone or email)",
        )}
        <input name="contact" maxLength={200} className={input} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>
          {t(
            "أُقرّ بأنّ هذا العمل لي أو أنّ لي حقّ مشاركته، أو أنّه منشورٌ للعموم، وأوافق على نشره في المكتبة باسم مؤلّفيه.",
            "I confirm this work is mine or I have the right to share it, or it is already public, and I agree to its publication in the library under its authors' names.",
          )}
        </span>
      </label>
      {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <button
        disabled={busy}
        className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground shadow-card transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? t("يُرسَل…", "Sending…") : t("أرسل للمراجعة", "Send for review")}
      </button>
    </form>
  );
}
