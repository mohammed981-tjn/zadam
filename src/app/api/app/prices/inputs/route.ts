import { NextResponse } from "next/server";
import { INPUT_WINDOW_DAYS, PUBLISHED_OLD_DAYS, SUPPLIER_INPUTS, loadInputBoard } from "@/lib/priceBoards";
import { createPublicClient } from "@/lib/supabase/public";
import {
  AVAILABILITY_LABEL,
  ITEM_LABEL,
  KIND_LABEL,
  availabilityVerdict,
  daysBetween,
  groupByItem,
  khartoumToday,
  label,
  perUnit,
} from "@/lib/inputBoard";
import { stateName } from "@/lib/nafir";
import { appLocale } from "@/lib/appLocale";

/**
 * «أين السماد والجازولين هذا الأسبوع وبكم» في التطبيق (البند ٢٠٣): what /market/inputs shows, from the same loader
 * (`loadInputBoard`) — people's reports of the last two weeks summarised per state, every report, the verified
 * suppliers, and the published figures with their dates. Public, as the page is: the report functions are granted to
 * `anon` and never return who reported. Reporting a price stays on the website (/market/inputs/report).
 */
export async function GET(req: Request) {
  const locale = appLocale(req);
  const today = khartoumToday();
  const { pending, rows, reports, supplierCount, published } = await loadInputBoard(createPublicClient());

  return NextResponse.json(
    {
      pending,
      window_days: INPUT_WINDOW_DAYS,
      groups: groupByItem(rows).map(([item, list]) => ({
        item,
        name: label(ITEM_LABEL, item, locale),
        rows: list.map((r) => {
          const verdict = availabilityVerdict(r);
          return {
            state: stateName(r.state, locale),
            kind: r.price_kind ? label(KIND_LABEL, r.price_kind, locale) : null,
            verdict,
            verdict_label: label(AVAILABILITY_LABEL, verdict, locale),
            median: r.priced > 0 ? r.median : null,
            low: r.priced > 1 ? r.low : null,
            high: r.priced > 1 ? r.high : null,
            per_unit: perUnit(r.unit, locale),
            reports: r.reports,
            reporters: r.reporters,
            unavailable: r.unavailable,
            latest_on: r.latest_on,
            latest_days_ago: daysBetween(r.latest_on, today),
          };
        }),
      })),
      reports: reports.map((r) => ({
        id: r.id,
        item: label(ITEM_LABEL, r.item, locale),
        state: stateName(r.state, locale),
        locality: r.locality,
        kind: r.price_kind ? label(KIND_LABEL, r.price_kind, locale) : null,
        price: r.price_sdg === null ? null : Number(r.price_sdg),
        per_unit: perUnit(r.unit, locale),
        availability: r.availability,
        availability_label: label(AVAILABILITY_LABEL, r.availability, locale),
        observed_on: r.observed_on,
        note: r.note,
      })),
      suppliers: SUPPLIER_INPUTS.map((k) => {
        const item = k === "urea" ? "urea" : k === "DAP" ? "dap" : "npk";
        return { key: k, name: label(ITEM_LABEL, item, locale), count: supplierCount(k) };
      }),
      published: published
        ? {
            old_days: PUBLISHED_OLD_DAYS,
            figures: published.figures.map((f) => {
              const age = daysBetween(f.date, today);
              return {
                item: label(ITEM_LABEL, f.item, locale),
                place: f.place_ar,
                price: f.price,
                per_unit: perUnit(f.unit, locale),
                date: f.date,
                age_days: age,
                old: age > PUBLISHED_OLD_DAYS,
                note: f.note_ar ?? null,
                source: f.source_ar,
                url: f.url,
              };
            }),
            trends: published.trends.map((t) => ({ month: t.month, text: t.ar, source: t.source_ar, url: t.url })),
          }
        : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
