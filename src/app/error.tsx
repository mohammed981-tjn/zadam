"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { button, ghost } from "@/lib/ui";

/**
 * When a page fails, in the reader's language (the review of 23 October,
 * ARCH-7). The error's own text is never shown — it can name the systems
 * behind the page (SEC-8) — only its reference, so the administration can
 * find it in the logs if the reader sends it.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  useEffect(() => {
    console.error("page error", error.digest ?? "");
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-6xl" aria-hidden="true">🛠️</p>
      <h1 className="mt-4 text-2xl font-black">{t("تعذّر فتح هذه الصفحة الآن", "This page could not open just now")}</h1>
      <p className="mt-2 text-muted">
        {t("حاول مرّةً أخرى بعد لحظة. وإن تكرّر، أخبرنا من «راسل سوداقري».", "Try again in a moment. If it keeps happening, tell us from «Write to Sudagri».")}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={button}>
          {t("حاول مرّةً أخرى", "Try again")}
        </button>
        <Link href="/" className={ghost}>{t("الرئيسية", "Home")}</Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-muted" dir="ltr">
          {t("رقم المرجع", "Reference")}: {error.digest}
        </p>
      )}
    </div>
  );
}
