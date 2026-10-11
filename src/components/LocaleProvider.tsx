"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("ar");

/** Hands the server-read language to client components below it. */
export default function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
