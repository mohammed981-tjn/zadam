"use client";

import { useState } from "react";
import { FX_NAME, type FxCurrency } from "@/lib/fxCurrencies";
import { tr } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";

const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

type Table = Partial<Record<FxCurrency, number>>;

/** Converts between a foreign currency and the Sudanese pound, at the bank or the parallel rate. */
export default function FxConverter({ bank, parallel }: { bank: Table; parallel: Table }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const currencies = Object.keys(bank) as FxCurrency[];
  const [cur, setCur] = useState<FxCurrency>("USD");
  const [which, setWhich] = useState<"bank" | "parallel">("bank");
  const [amount, setAmount] = useState(100);
  const [pounds, setPounds] = useState(1_000_000);
  const rate = (which === "bank" ? bank : parallel)[cur] ?? 0;
  const field = "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
  const ok = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        {t("العملة", "Currency")}
        <select value={cur} onChange={(e) => setCur(e.target.value as FxCurrency)} className={field}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {locale === "en" ? FX_NAME[c].en : FX_NAME[c].ar} ({c})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("بأيّ سعر", "At which rate")}
        <select value={which} onChange={(e) => setWhich(e.target.value as "bank" | "parallel")} className={field}>
          <option value="bank">{t("سعر بنك الخرطوم", "Bank of Khartoum")}</option>
          <option value="parallel">{t("السوق الموازي", "Parallel market")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t(`المبلغ بـ ${cur}`, `Amount in ${cur}`)}
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={field} />
        <span className="font-bold">
          = {n2(ok(amount) * rate)} {t("جنيه سوداني", "Sudanese pounds")}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("المبلغ بالجنيه السوداني", "Amount in Sudanese pounds")}
        <input type="number" min={0} value={pounds} onChange={(e) => setPounds(Number(e.target.value))} className={field} />
        <span className="font-bold">
          = {rate > 0 ? n2(ok(pounds) / rate) : "—"} {cur}
        </span>
      </label>
    </div>
  );
}
