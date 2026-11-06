import { NextResponse } from "next/server";
import { loadMarketBoard } from "@/lib/priceBoards";
import { loadFeedStates, staleLines } from "@/lib/priceFreshness";
import { createPublicClient } from "@/lib/supabase/public";
import { ageInDays } from "@/lib/fxRates";
import {
  BOURSE_QUIET_DAYS,
  FEWS_SOURCE_URL,
  MARKET_STALE_DAYS,
  UNIT_NAME,
  cropName,
  fewsMarket,
  fewsProduct,
  fewsUnit,
  latest,
  seriesKey,
  type PriceSeries,
} from "@/lib/marketPrices";
import { WFP_PRICES_SOURCE, medianFor, orderTowns, pctChange, unusual, wfpItem, wfpMarketPlace, wfpTown, wfpUnit } from "@/lib/wfpPrices";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «سوق المحاصيل اليوم» في التطبيق (البند ٢٠٣): what /market shows, from the same loader (`loadMarketBoard`), laid out
 * as data for the phone — the bourse cards with each figure's date, age, source and the three-day warning, the
 * quiet-bourse notice with WFP's monthly figures, FEWS NET's and WFP's monthly tables, and how fresh each daily feed is
 * (`priceFreshness.ts`). Public, as the page is: read with the anon key, so only published rows come back.
 */
export async function GET(req: Request) {
  const locale = appLocale(req);
  const now = new Date();
  const [board, feeds] = await Promise.all([loadMarketBoard(now), loadFeedStates(createPublicClient(), now).catch(() => [])]);
  const { data, fx, fews, wfp, wfpPrices, wfpMedians, usdRate, byCrop, crops, lastBulletin, quiet, checked } = board;

  const perUnit = (s: PriceSeries) => tr(locale, `لل${UNIT_NAME[s.unit][locale].slice(2)}`, `per ${UNIT_NAME[s.unit].en}`);
  const card = (s: PriceSeries) => {
    const m = data!.markets[s.market];
    const { last, change, changePct } = latest(s);
    const age = ageInDays(last.date, now);
    return {
      key: seriesKey(s),
      market: s.market,
      market_name: m?.name_ar ?? s.market,
      unit: s.unit,
      per_unit: perUnit(s),
      price: last.price,
      usd: usdRate ? last.price / usdRate : null,
      date: last.date,
      age_days: age,
      stale: age > MARKET_STALE_DAYS,
      source: last.source,
      note: last.note ?? null,
      change,
      change_pct: changePct,
      arrivals: last.arrivals ?? null,
      all_sorghum: s.crop === "feterita" || s.crop === "tabat",
      history: s.history.slice(-12).map((p) => ({ date: p.date, price: p.price })),
      // The value the alert form takes for this series (priceAlerts.ts `subjectOptions`).
      alert_subject: `crop|${s.market}|${s.crop}|${s.unit}`,
    };
  };

  return NextResponse.json(
    {
      checked,
      quiet,
      quiet_days: BOURSE_QUIET_DAYS,
      stale_days: MARKET_STALE_DAYS,
      last_bulletins: [...lastBulletin.entries()].map(([m, d]) => ({ market_name: data?.markets[m]?.name_ar ?? m, date: d })),
      usd: fx ? { bank_name: fx.bank.name_ar, sell: fx.bank.sell, date: fx.bank.date } : null,
      crops:
        data === null
          ? []
          : crops.map((crop) => ({ crop, name: cropName(crop, locale), series: byCrop.get(crop)!.map(card) })),
      wfp_monthly: wfp,
      fews: fews?.map((f) => ({
        market: fewsMarket(f.market, locale),
        product: fewsProduct(f.product, locale),
        unit: f.unit ? fewsUnit(f.unit, locale) : "",
        value: f.value,
        prev: f.prev,
        month: f.date.slice(0, 7),
      })) ?? null,
      fews_source: FEWS_SOURCE_URL,
      wfp_towns: wfpPrices
        ? {
            latest: wfpPrices.latest,
            source: WFP_PRICES_SOURCE,
            towns: orderTowns(wfpPrices.towns, locale).map((town) => ({
              name: wfpTown(town.market, locale),
              place: wfpMarketPlace(town.market, locale),
              latest: town.latest,
              items: town.items.map((it) => {
                const median = medianFor(wfpMedians, it);
                return {
                  name: wfpItem(it.commodity, locale),
                  unit: wfpUnit(it.unit, locale),
                  month: it.month,
                  price: it.price,
                  vs_month_pct: pctChange(it.price, it.prevMonth),
                  vs_year_pct: pctChange(it.price, it.yearAgo),
                  unusual: unusual(it.price, median),
                  median,
                };
              }),
            })),
          }
        : null,
      feeds: feeds.map((f) => ({ key: f.key, newest: f.newest, age_days: f.ageDays, limit_days: f.limitDays, stale: f.stale })),
      stale_lines: staleLines(feeds, locale),
      units_note: `${UNIT_NAME.qintar.noteAr} ${UNIT_NAME.ardeb.noteAr}`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
