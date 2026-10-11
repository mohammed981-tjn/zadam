"use client";

import { usePathname } from "next/navigation";
import { isTranslated } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/**
 * In English, a page not yet translated keeps its Arabic and its right-to-left
 * layout, under one line saying so — rather than English chrome around Arabic
 * paragraphs running the wrong way.
 */
export default function PageLang({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname();
  if (locale !== "en" || isTranslated(pathname)) return <>{children}</>;
  return (
    <>
      <p className="mx-auto mt-4 max-w-3xl rounded-lg border border-border bg-card px-4 py-2 text-center text-sm text-muted">
        This page is still in Arabic — its English version is on the way.
      </p>
      <div lang="ar" dir="rtl">
        {children}
      </div>
    </>
  );
}
