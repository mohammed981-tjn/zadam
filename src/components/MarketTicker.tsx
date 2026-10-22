import Link from "next/link";
import { ageInDays } from "@/lib/fxRates";
import type { Locale } from "@/lib/i18n";
import { MARKET_STALE_DAYS, UNIT_NAME, cropName, latest, money } from "@/lib/marketPrices";
import { currentMarketPrices } from "@/lib/livePrices";

/**
 * شريط السوق للصفحة الرئيسية: سعر السمسم والفتريتة في القضارف، بتاريخهما.
 *
 * A server component (it reads the data file), small enough to sit in a row
 * of the home page. It shows two figures because those two decide a Gedaref
 * farmer's season — the cash crop and the staple — and links to /market for
 * the rest. The date is always shown, and turns dark gold (the site has no
 * red since backlog 121) past three days, because a
 * price on a home page without its date reads as today's.
 */
export default async function MarketTicker({ locale = "ar" }: { locale?: Locale }) {
  const en = locale === "en";
  const data = await currentMarketPrices();
  const picks = ["sesame", "feterita"]
    .map((crop) => data?.series.find((s) => s.market === "gedaref" && s.crop === crop))
    .filter((s) => s !== undefined);
  if (!data || picks.length === 0) return null;

  return (
    <Link
      href="/market"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm transition hover:border-rose"
    >
      <span className="font-bold">{en ? "Gedaref market" : "سوق القضارف"}</span>
      {picks.map((s) => {
        const { last, change } = latest(s);
        const stale = ageInDays(last.date) > MARKET_STALE_DAYS;
        return (
          <span key={s.crop} className="flex items-baseline gap-1.5">
            <span className="text-muted">{cropName(s.crop, locale)}</span>
            <span className="font-black" dir="ltr">{money(last.price)}</span>
            <span className="text-xs text-muted">
              {en ? `SDG/${UNIT_NAME[s.unit].en}` : `جنيه/${UNIT_NAME[s.unit].ar.slice(2)}`}
            </span>
            {change !== null && change !== 0 && (
              <span className={change > 0 ? "text-leaf" : "text-danger"}>{change > 0 ? "▲" : "▼"}</span>
            )}
            <span className={`text-xs ${stale ? "text-danger" : "text-muted"}`} dir="ltr">{last.date}</span>
          </span>
        );
      })}
      <span className="ms-auto text-xs text-primary">{en ? "All prices →" : "كلّ الأسعار ←"}</span>
    </Link>
  );
}
