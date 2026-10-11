"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/**
 * «ع / EN» — one button that names the language it switches *to*, in that
 * language, so a reader who cannot read the current one still finds it.
 */
export default function LangToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "en" ? "ar" : "en";

  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
        start(() => router.refresh());
      }}
      disabled={pending}
      lang={next}
      aria-label={next === "en" ? "Switch to English" : "التحويل إلى العربية"}
      className="rounded-lg border border-border px-2.5 py-2 text-sm font-bold hover:border-primary disabled:opacity-60"
    >
      {next === "en" ? "EN" : "ع"}
    </button>
  );
}
