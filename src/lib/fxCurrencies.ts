/** Currency names, safe for client components (no file access). See fxRates.ts. */

/** The currencies that matter to a Sudanese farm: export markets and remittances. */
export const FX_CURRENCIES = ["USD", "SAR", "AED", "EGP", "EUR", "GBP", "CNY", "QAR"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export const FX_NAME: Record<FxCurrency, { ar: string; en: string }> = {
  USD: { ar: "الدولار الأمريكي", en: "US dollar" },
  SAR: { ar: "الريال السعودي", en: "Saudi riyal" },
  AED: { ar: "الدرهم الإماراتي", en: "UAE dirham" },
  EGP: { ar: "الجنيه المصري", en: "Egyptian pound" },
  EUR: { ar: "اليورو", en: "Euro" },
  GBP: { ar: "الجنيه الإسترليني", en: "Pound sterling" },
  CNY: { ar: "اليوان الصيني", en: "Chinese yuan" },
  QAR: { ar: "الريال القطري", en: "Qatari riyal" },
};
