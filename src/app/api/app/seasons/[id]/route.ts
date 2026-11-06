import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { budgetVsActual, disbursementDecision, LEDGER_LABEL, summariseLedger, type LedgerCategory } from "@/lib/season";
import { cropName, irrigationLabel, ledgerLabel, stageActivities, stageName, stationName } from "@/lib/farmLabelsEn";
import { returnBand } from "@/lib/risk";
import { ledgerToday } from "@/lib/ledger/today";
import { revalueOpenPounds } from "@/lib/fxRevalue";
import { boursePriceFor, standingCropValue } from "@/lib/cropValue";
import { loadCropMarkets } from "@/lib/marketData";
import { currentMarketPrices } from "@/lib/livePrices";
import type { LedgerEntryRow, Season, SeasonStage, StageEvidence } from "@/types/database";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * صفحة الموسم في التطبيق (البند ٢٠٣): what /seasons/[id] shows on the website, as data.
 *
 * Every row is read as the signed-in person, through row-level security, with the same queries the page makes; the
 * figures are worked out by the same functions (`summariseLedger`, `budgetVsActual`, `disbursementDecision`,
 * `revalueOpenPounds`, `standingCropValue`), so the app and the page cannot disagree. Writing is for the owner of an
 * active season only, as on the page — the database refuses everyone else anyway.
 */

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const PAID_FROM = (locale: Locale): Record<LedgerEntryRow["paid_from"], string> => ({ cash: tr(locale, "نقداً", "Cash"), bank: tr(locale, "بنك", "Bank"), wallet: tr(locale, "محفظة", "Wallet"), credit: tr(locale, "آجل", "On credit") });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: seasonRow } = await supabase.from("seasons").select("*").eq("id", id).maybeSingle();
  if (!seasonRow) return NextResponse.json({ error: tr(locale, "لم نجد هذا الموسم، أو ليس لك أن تراه.", "We could not find this season, or it is not yours to see.") }, { status: 404 });
  const season = seasonRow as Season;
  const isOwner = season.owner_id === user.id;
  const canWrite = isOwner && season.status === "active";

  const [{ data: stageRows }, { data: ledgerRows }] = await Promise.all([
    supabase.from("season_stages").select("*").eq("season_id", id).order("stage_order"),
    supabase.from("ledger_entries").select("*").eq("season_id", id),
  ]);
  const stages = (stageRows ?? []) as SeasonStage[];
  const ledger = (ledgerRows ?? []) as LedgerEntryRow[];

  const today = ledgerToday();
  const suggested = isOwner
    ? ((await supabase.rpc("ledger_fx_rate", { p_date: today, p_source: "parallel" })).data as
        | { rate: number; rate_date: string }[]
        | null)?.[0] ?? null
    : null;
  const credit = isOwner
    ? (((await supabase.rpc("farm_credit_status", { p_season: id })).data as
        | { entry_id: string; settled_on: string | null }[]
        | null) ?? [])
    : [];
  const settledOn = new Map(credit.map((c) => [c.entry_id, c.settled_on]));
  const creditRows = [...ledger]
    .filter((l) => settledOn.has(l.id))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
  const revaluation = suggested
    ? revalueOpenPounds(
        creditRows
          .filter((l) => !settledOn.get(l.id) && l.currency === "SDG" && l.entered_amount !== null)
          .map((l) => ({ pounds: Number(l.entered_amount), bookedUsd: Number(l.amount), receivable: l.category === "revenue" })),
        Number(suggested.rate),
      )
    : null;

  // قرار المالك (6 نوفمبر): قيمة المحصول القائم تقديراً، تُعرض لصاحب الموسم ولا تُقيَّد في الدفتر.
  const [cropMarkets, bourse] =
    isOwner && season.status === "active" ? await Promise.all([loadCropMarkets(), currentMarketPrices()]) : [null, null];
  const cropMarket = cropMarkets?.[season.crop_key] ?? null;
  const boursePrice = bourse ? boursePriceFor(season.crop_key, bourse.series) : null;
  const cropValue = cropMarket
    ? standingCropValue({
        feddans: Number(season.feddans),
        sudanKgPerHa: cropMarket.sudanKgPerHa,
        yieldYear: cropMarket.year,
        bourse: boursePrice,
        faostat: { usdPerTonne: cropMarket.usdPerTonne, basis: cropMarket.priceBasis, year: cropMarket.year },
        poundsPerDollar: suggested ? Number(suggested.rate) : null,
      })
    : null;
  const bourseMarket = boursePrice && bourse ? bourse.markets[boursePrice.market] : null;

  const { data: evidenceRows } = await supabase
    .from("stage_evidence")
    .select("*")
    .in("stage_id", stages.length ? stages.map((s) => s.id) : ["0"]);
  const evidence = (evidenceRows ?? []) as StageEvidence[];
  const evidenceFor = (stageId: string) => evidence.filter((e) => e.stage_id === stageId);

  const plannedBudget = stages.reduce((sum, s) => sum + Number(s.budget), 0);
  const summary = summariseLedger(
    ledger.map((l) => ({ category: l.category, amount: Number(l.amount) })),
    Number(season.feddans),
    plannedBudget,
  );
  const variance = budgetVsActual(
    stages.map((s) => ({ id: s.id, budget: Number(s.budget) })),
    ledger.map((l) => ({ stage_id: l.stage_id, category: l.category, amount: Number(l.amount) })),
  );
  const spentOn = new Map(variance.stages.map((v) => [v.stageId, v]));
  const gateInput = stages.map((s) => ({ key: s.stage_key, completed: s.completed, evidenceCount: evidenceFor(s.id).length }));
  const doneCount = stages.filter((s) => s.completed).length;
  const released = stages.reduce((sum, s, i) => (disbursementDecision(gateInput, i).released ? sum + Number(s.budget) : sum), 0);
  const band = returnBand(season.crop_key);

  const entry = (l: LedgerEntryRow) => ({
    id: l.id,
    category: l.category,
    label: ledgerLabel(l.category, locale),
    description: l.description,
    entry_date: l.entry_date,
    currency: l.currency,
    amount_usd: Number(l.amount),
    entered_amount: l.entered_amount === null ? null : Number(l.entered_amount),
    fx_rate: l.fx_rate === null ? null : Number(l.fx_rate),
    paid_from: l.paid_from,
    paid_from_label: PAID_FROM(locale)[l.paid_from] ?? l.paid_from,
    stage_id: l.stage_id,
  });

  const recent = [...ledger]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  return NextResponse.json(
    {
      season: {
        id: season.id,
        name: season.name,
        crop_key: season.crop_key,
        crop: cropName(season.crop_key, locale),
        station: stationName(season.station_key, locale),
        irrigation: irrigationLabel(season.irrigation, locale),
        feddans: Number(season.feddans),
        location: season.location,
        status: season.status,
        planting_date: season.planting_date,
        harvest_date: season.harvest_date,
        partnership_id: season.partnership_id ?? null,
      },
      is_owner: isOwner,
      can_write: canWrite,
      today,
      progress: { done: doneCount, total: stages.length, pct: stages.length ? Math.round((doneCount / stages.length) * 100) : 0 },
      totals: {
        costs: summary.costs,
        revenue: summary.revenue,
        profit: summary.profit,
        profit_per_feddan: summary.profitPerFeddan,
        cost_per_feddan: summary.costPerFeddan,
        planned_per_feddan: summary.plannedPerFeddan,
        revenue_per_feddan: summary.revenuePerFeddan,
        margin_pct: summary.marginPct,
        planned_budget: plannedBudget,
        released,
      },
      by_category: summary.byCategory.map((c) => ({
        category: c.category,
        label: ledgerLabel(c.category, locale),
        amount: c.amount,
        share: summary.costs > 0 ? Math.round((c.amount / summary.costs) * 100) : 0,
      })),
      variance: { planned: variance.planned, spent: variance.spent, unassigned: variance.unassigned },
      stages: stages.map((s, i) => {
        const decision = disbursementDecision(gateInput, i);
        const v = spentOn.get(s.id);
        return {
          id: s.id,
          key: s.stage_key,
          name: stageName(s.stage_key, locale),
          order: s.stage_order,
          planned_start: s.planned_start,
          planned_end: s.planned_end,
          water_m3: Number(s.planned_water_m3),
          budget: Number(s.budget),
          spent: v?.spent ?? 0,
          left: v?.left ?? Number(s.budget),
          completed: s.completed,
          released: decision.released,
          reason: decision.released ? null : decision.reason,
          activities: stageActivities(s.stage_key, locale),
          evidence: evidenceFor(s.id).map((e) => ({ id: e.id, kind: e.kind, caption: e.caption })),
        };
      }),
      entries: recent.map(entry),
      credit: creditRows.map((l) => ({ ...entry(l), settled_on: settledOn.get(l.id) ?? null })),
      suggested_rate: suggested ? { rate: Number(suggested.rate), rate_date: suggested.rate_date } : null,
      revaluation,
      crop_value: cropValue
        ? {
            usd: cropValue.usd,
            pounds: cropValue.pounds,
            kg: cropValue.kg,
            kg_per_feddan: cropValue.kgPerFeddan,
            basis: cropValue.basis,
            price_when: cropValue.priceWhen,
            yield_year: cropValue.yieldYear,
            // The page's sentence, word for word, so the app says where the figure came from as the website does.
            note:
              tr(locale, `نحو ${n0(cropValue.kg)} كجم: ${n0(cropValue.kgPerFeddan)} كجم للفدان، وهو متوسّط غلّة السودان (FAOSTAT${cropValue.yieldYear ? ` ${cropValue.yieldYear}` : ""})، × ${season.feddans} فدان. `, `About ${n0(cropValue.kg)} kg: ${n0(cropValue.kgPerFeddan)} kg per feddan, Sudan's average yield (FAOSTAT${cropValue.yieldYear ? ` ${cropValue.yieldYear}` : ""}), × ${season.feddans} feddans.`) +
              (cropValue.basis === "bourse" && boursePrice
                ? tr(locale, `بسعر ${bourseMarket?.bourse_ar ?? boursePrice.market} يوم ${boursePrice.date}: ${n0(boursePrice.poundsPerKg)} جنيه للكيلو.`, `At the ${bourseMarket?.bourse_en ?? boursePrice.market} price on ${boursePrice.date}: ${n0(boursePrice.poundsPerKg)} pounds per kilo.`)
                : cropValue.basis === "sudan_export"
                  ? tr(locale, `بسعر صادر السودان لهذا المحصول (FAOSTAT ${cropValue.priceWhen}).`, `At Sudan's export price for this crop (FAOSTAT ${cropValue.priceWhen}).`)
                  : tr(locale, `بسعر المنتج في بلدٍ مجاور (FAOSTAT ${cropValue.priceWhen})، فلا سعر سودانيّاً منشوراً لهذا المحصول.`, `At the producer price in a neighbouring country (FAOSTAT ${cropValue.priceWhen}), as no Sudanese price is published for this crop.`)) +
              (suggested ? tr(locale, ` والتحويل بسعر الموازي ${n0(Number(suggested.rate))} جنيه للدولار (${suggested.rate_date}).`, ` Converted at the parallel rate of ${n0(Number(suggested.rate))} pounds to the dollar (${suggested.rate_date}).`) : ""),
          }
        : null,
      band: band ? { p50: band.p50 } : null,
      categories: (Object.keys(LEDGER_LABEL) as LedgerCategory[]).map((c) => ({ key: c, label: ledgerLabel(c, locale) })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
