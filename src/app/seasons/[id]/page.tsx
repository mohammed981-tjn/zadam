import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  disbursementDecision,
  summariseLedger,
  LEDGER_LABEL,
  type LedgerCategory,
} from "@/lib/season";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  cropName as cropLabel,
  disbursementReasonEn,
  irrigationLabel,
  ledgerLabel,
  stageActivities,
  stageName,
  stationName as stationLabel,
} from "@/lib/farmLabelsEn";
import { returnBand } from "@/lib/risk";
import { ledgerToday } from "@/lib/ledger/today";
import type {
  LedgerEntryRow,
  Season,
  SeasonStage,
  StageEvidence,
} from "@/types/database";
import { addLedgerEntry, completeSeason, completeStage, settleLedgerEntry, unsettleLedgerEntry } from "../actions";
import StageEvidenceUpload from "@/components/StageEvidence";
import YieldBenchmark from "@/components/YieldBenchmark";
import OfflineForm from "@/components/OfflineForm";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const paidFromLabel = (p: LedgerEntryRow["paid_from"], t: (ar: string, en: string) => string) =>
  p === "bank"
    ? t("بنك", "Bank")
    : p === "wallet"
      ? t("محفظة", "Wallet")
      : p === "credit"
        ? t("آجل", "On credit")
        : t("نقداً", "Cash");

export default async function SeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", id)
    .single();

  if (!seasonRow) notFound();
  const season = seasonRow as Season;
  // The investor of a signed partnership reads this season (backlog 129); only
  // its owner writes in it — the database refuses the rest anyway, so the
  // forms are not offered.
  const isOwner = season.owner_id === user.id;
  const canWrite = isOwner && season.status === "active";

  const [{ data: stageRows }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from("season_stages")
      .select("*")
      .eq("season_id", id)
      .order("stage_order"),
    supabase.from("ledger_entries").select("*").eq("season_id", id),
  ]);

  const stages = (stageRows ?? []) as SeasonStage[];
  const ledger = (ledgerRows ?? []) as LedgerEntryRow[];

  // The rate a pound entry would take today, shown so the farmer knows what he is agreeing to.
  // None published is a normal state: the farmer then types the rate he exchanged at.
  // Khartoum's day, as the ledger counts it: the server's clock is UTC, and between midnight and two it is still
  // yesterday there (review 198 B6).
  const today = ledgerToday();
  const suggested = isOwner
    ? ((await supabase.rpc("ledger_fx_rate", { p_date: today, p_source: "parallel" })).data as
        | { rate: number; rate_date: string }[]
        | null)?.[0] ?? null
    : null;
  // Rows kept on credit and whether each has been settled: the owner can settle them even after the season closes.
  const credit = isOwner
    ? (((await supabase.rpc("farm_credit_status", { p_season: id })).data as
        | { entry_id: string; settled_on: string | null }[]
        | null) ?? [])
    : [];
  const settledOn = new Map(credit.map((c) => [c.entry_id, c.settled_on]));
  const creditRows = [...ledger]
    .filter((l) => settledOn.has(l.id))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
  const recent = [...ledger]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  const { data: evidenceRows } = await supabase
    .from("stage_evidence")
    .select("*")
    .in("stage_id", stages.length ? stages.map((s) => s.id) : ["0"]);

  const evidence = (evidenceRows ?? []) as StageEvidence[];
  const evidenceFor = (stageId: string) =>
    evidence.filter((e) => e.stage_id === stageId);

  const plannedBudget = stages.reduce((sum, s) => sum + Number(s.budget), 0);
  const summary = summariseLedger(
    ledger.map((l) => ({
      category: l.category,
      amount: Number(l.amount),
    })),
    Number(season.feddans),
    plannedBudget,
  );

  const band = returnBand(season.crop_key);
  const cropName = cropLabel(season.crop_key, locale);
  const stationName = stationLabel(season.station_key, locale);

  const gateInput = stages.map((s) => ({
    key: s.stage_key,
    completed: s.completed,
    evidenceCount: evidenceFor(s.id).length,
  }));

  const doneCount = stages.filter((s) => s.completed).length;
  const progress = stages.length
    ? Math.round((doneCount / stages.length) * 100)
    : 0;
  const released = stages.reduce(
    (sum, s, i) =>
      disbursementDecision(gateInput, i).released
        ? sum + Number(s.budget)
        : sum,
    0,
  );

  const CATEGORIES = Object.keys(LEDGER_LABEL) as LedgerCategory[];
  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold" {...arText}>
        {season.name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {cropName} · {stationName} · {season.feddans} {t("فدان", "feddans")}{" "}
        · {irrigationLabel(season.irrigation, locale)}
        {season.location && (
          <>
            {" · "}
            <span {...arText}>{season.location}</span>
          </>
        )}
      </p>

      {/* What this season is tied to (backlog 129): the agreement it carries
          out, and for its owner the next step — services for its stages. */}
      {!isOwner && season.partnership_id && (
        <p className="mt-4 rounded-xl bg-leaf/5 px-4 py-3 text-sm ring-1 ring-leaf/20">
          {t(
            "أنت شريكٌ في هذا الموسم بعقدٍ موقَّع: تقرأ مراحله وأدلّته ودفتره كما يكتبها صاحب الأرض، ولا تكتب فيه.",
            "You are a partner in this season under a signed agreement: you read its stages, evidence and ledger as the landowner records them, and write none of it.",
          )}{" "}
          <Link href={`/invest/agreements/${season.partnership_id}`} className="font-bold text-primary underline">
            {t("العقد", "The agreement")}
          </Link>
        </p>
      )}
      {isOwner && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {season.partnership_id && (
            <Link href={`/invest/agreements/${season.partnership_id}`} className="rounded-lg px-3 py-1.5 font-bold text-primary ring-1 ring-primary/30 hover:bg-primary/10">
              {t("عقد الشراكة", "Partnership agreement")}
            </Link>
          )}
          {season.status === "active" && (
            <Link href={`/contracts/new?season=${season.id}`} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground hover:opacity-90">
              {t("اطلب خدمة لهذا الموسم", "Request a service for this season")}
            </Link>
          )}
          <Link href="/partners" className="rounded-lg px-3 py-1.5 font-bold text-leaf ring-1 ring-leaf/30 hover:bg-leaf/10">
            {t("الشركات الشريكة", "Partner companies")}
          </Link>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <YieldBenchmark
        cropKey={season.crop_key}
        declaredKgPerFeddan={
          season.harvest_kg != null && season.feddans > 0
            ? Number(season.harvest_kg) / Number(season.feddans)
            : null
        }
        locale={locale}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          {
            l: t("التقدّم", "Progress"),
            v: `${progress}%`,
            s: t(
              `${doneCount} من ${stages.length} مراحل`,
              `${doneCount} of ${stages.length} stages`,
            ),
          },
          {
            l: t("مصروف", "Spent"),
            v: `$${n0(summary.costs)}`,
            s: t(
              `من ميزانية $${n0(plannedBudget)}`,
              `of a $${n0(plannedBudget)} budget`,
            ),
          },
          {
            l: t("مُفرَج عنه", "Released"),
            v: `$${n0(released)}`,
            s: t("بعد اعتماد المراحل", "after stages are signed off"),
          },
          {
            l: t("صافي الربح", "Net profit"),
            v: `$${n0(summary.profit)}`,
            s: t(
              `$${summary.profitPerFeddan.toFixed(0)} للفدان`,
              `$${summary.profitPerFeddan.toFixed(0)} per feddan`,
            ),
          },
        ].map((c) => (
          <div
            key={c.l}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted">{c.l}</p>
            <p className="mt-1 text-xl font-black">{c.v}</p>
            <p className="text-xs text-muted">{c.s}</p>
          </div>
        ))}
      </div>

      {/* البند ١٦٥: التكلفة والهامش لكلّ فدان، بجانب الخطّة. */}
      {summary.costs > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-bold">{t("لكلّ فدان", "Per feddan")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">{t("التكلفة حتى الآن", "Cost so far")}</dt>
              <dd className="font-black">${n0(summary.costPerFeddan)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("الخطّة", "The plan")}</dt>
              <dd className="font-black">${n0(summary.plannedPerFeddan)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("المبيع", "Sold")}</dt>
              <dd className="font-black">${n0(summary.revenuePerFeddan)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("الهامش", "Margin")}</dt>
              <dd className="font-black" dir="ltr">
                {summary.marginPct === null ? "—" : `${summary.marginPct.toFixed(0)}%`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {t(
              "الهامش = الربح ÷ المبيع، ولا يظهر قبل أن يُسجَّل بيع. كلّ الأرقام بالدولار كما في دفتر الموسم.",
              "Margin = profit ÷ sold, and it does not show before a sale is entered. All figures are in dollars, as in the season ledger.",
            )}
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">
          {t("خط الموسم", "Season timeline")}
        </h2>
        <ol className="flex flex-col gap-4">
          {stages.map((s, i) => {
            const decision = disbursementDecision(gateInput, i);
            const ev = evidenceFor(s.id);
            const activities = stageActivities(s.stage_key, locale);
            const reason =
              locale === "en"
                ? disbursementReasonEn(gateInput, i)
                : decision.reason;

            return (
              <li
                key={s.id}
                className={`rounded-2xl border bg-card p-5 ${
                  s.completed ? "border-primary/50" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">
                      {s.completed ? "✅ " : ""}
                      {stageName(s.stage_key, locale)}
                    </h3>
                    <p className="text-xs text-muted">
                      {s.planned_start} {locale === "en" ? "→" : "←"}{" "}
                      {s.planned_end}
                      {Number(s.planned_water_m3) > 0
                        ? ` · ${n0(Number(s.planned_water_m3))} ${t("م³", "m³")}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold">${n0(Number(s.budget))}</p>
                    <p
                      className={`text-xs font-medium ${
                        decision.released ? "text-primary" : "text-accent"
                      }`}
                    >
                      {decision.released
                        ? t("مُفرَج عنه", "Released")
                        : t("محجوز", "Held")}
                    </p>
                  </div>
                </div>

                {activities.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 ps-5 text-xs text-muted">
                    {activities.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}

                {!decision.released && (
                  <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">
                    {reason}
                  </p>
                )}

                {ev.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {ev.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                        {...arText}
                      >
                        {e.caption}
                      </li>
                    ))}
                  </ul>
                )}

                {canWrite && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <StageEvidenceUpload stageId={s.id} seasonId={season.id} />

                    {!s.completed && (
                      <form action={completeStage}>
                        <input type="hidden" name="stage_id" value={s.id} />
                        <input
                          type="hidden"
                          name="season_id"
                          value={season.id}
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                        >
                          {t("اعتمد المرحلة", "Sign off stage")}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("دفتر الحسابات", "Ledger")}</h2>
          {isOwner && (
            <Link href="/books?r=seasons" className="text-sm text-primary hover:underline">
              {t("القوائم الماليّة وميزان المراجعة ←", "Statements and trial balance →")}
            </Link>
          )}
        </div>

        {summary.byCategory.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-start">
                <tr>
                  <th className="px-4 py-3">{t("البند", "Item")}</th>
                  <th className="px-4 py-3">{t("المبلغ", "Amount")}</th>
                  <th className="px-4 py-3">
                    {t("النسبة من التكلفة", "Share of cost")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-border">
                    <td className="px-4 py-2">
                      {ledgerLabel(c.category, locale)}
                    </td>
                    <td className="px-4 py-2">${n0(c.amount)}</td>
                    <td className="px-4 py-2">
                      {summary.costs > 0
                        ? Math.round((c.amount / summary.costs) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-card font-bold">
                  <td className="px-4 py-2">{t("الإيراد", "Revenue")}</td>
                  <td className="px-4 py-2">${n0(summary.revenue)}</td>
                  <td className="px-4 py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {canWrite && (
          <OfflineForm
            action={addLedgerEntry}
            outboxKey={`ledger:${season.id}`}
            label={t("قيد مصروف أو إيراد", "A cost or revenue entry")}
            stamp="entry_date"
            className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
          >
            <input type="hidden" name="season_id" value={season.id} />
            <label className="flex flex-col gap-1 text-xs">
              {t("البند", "Item")}
              <select name="category" className={field} defaultValue="seeds">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ledgerLabel(c, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("المبلغ", "Amount")}
              <input
                type="text"
                inputMode="decimal"
                name="amount"
                required
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("العملة", "Currency")}
              <select name="currency" className={field} defaultValue="USD">
                <option value="USD">{t("دولار ($)", "US dollar ($)")}</option>
                <option value="SDG">{t("جنيه سوداني", "Sudanese pound")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("دُفع أو قُبض", "Paid or received")}
              <select name="paid_from" className={field} defaultValue="cash">
                <option value="cash">{t("نقداً", "Cash")}</option>
                <option value="bank">{t("من البنك", "Bank")}</option>
                <option value="wallet">{t("محفظة إلكترونية", "Mobile wallet")}</option>
                <option value="credit">{t("آجل — لم يُدفع أو يُقبض بعد", "On credit — not paid or received yet")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("سعر الصرف (للجنيه فقط)", "Exchange rate (pounds only)")}
              <input
                type="text"
                inputMode="decimal"
                name="fx_rate"
                placeholder={suggested ? String(Number(suggested.rate)) : t("جنيه لكل دولار", "pounds per dollar")}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("الوصف", "Description")}
              <input name="description" className={field} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("أضف قيداً", "Add entry")}
            </button>
            <p className="basis-full text-xs text-muted">
              {suggested
                ? t(
                    `إن كتبت بالجنيه ولم تكتب سعراً، نأخذ ${Number(suggested.rate).toLocaleString("en-US")} جنيهاً للدولار (السوق الموازي، ${suggested.rate_date}).`,
                    `If you enter pounds and no rate, we take ${Number(suggested.rate).toLocaleString("en-US")} pounds per dollar (parallel market, ${suggested.rate_date}).`,
                  )
                : t(
                    "إن كتبت بالجنيه فاكتب سعر الصرف الذي صرفت به (جنيهات لكل دولار)؛ لا سعر منشوراً اليوم نأخذه عنك.",
                    "If you enter pounds, type the rate you exchanged at (pounds per dollar); there is no published rate to take for you today.",
                  )}
            </p>
          </OfflineForm>
        )}

        {recent.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-start">
                <tr>
                  <th className="px-4 py-3">{t("التاريخ", "Date")}</th>
                  <th className="px-4 py-3">{t("البند", "Item")}</th>
                  <th className="px-4 py-3">{t("المبلغ", "Amount")}</th>
                  <th className="px-4 py-3">{t("بالدولار", "In dollars")}</th>
                  <th className="px-4 py-3">{t("الدفع", "Paid")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-2">{l.entry_date}</td>
                    <td className="px-4 py-2">
                      {ledgerLabel(l.category, locale)}
                      {l.description && <span className="text-muted"> · {l.description}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {l.currency === "SDG" && l.entered_amount !== null
                        ? `${Number(l.entered_amount).toLocaleString("en-US")} ${t("ج.س", "SDG")}`
                        : `$${Number(l.amount).toLocaleString("en-US")}`}
                    </td>
                    <td className="px-4 py-2">
                      ${Number(l.amount).toLocaleString("en-US")}
                      {l.currency === "SDG" && l.fx_rate !== null && (
                        <span className="text-xs text-muted"> · {Number(l.fx_rate).toLocaleString("en-US")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{paidFromLabel(l.paid_from, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {creditRows.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-bold">{t("الآجل", "On credit")}</h3>
            <ul className="space-y-2">
              {creditRows.map((l) => {
                const done = settledOn.get(l.id);
                const isRevenue = l.category === "revenue";
                return (
                  <li key={l.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {ledgerLabel(l.category, locale)}
                        {l.description && <span className="text-muted"> · {l.description}</span>}
                        <span className="text-muted"> · {l.entry_date}</span>
                      </span>
                      <span className="font-bold">
                        {l.currency === "SDG" && l.entered_amount !== null
                          ? `${Number(l.entered_amount).toLocaleString("en-US")} ${t("ج.س", "SDG")}`
                          : `$${Number(l.amount).toLocaleString("en-US")}`}
                      </span>
                    </div>
                    {done ? (
                      <form action={unsettleLedgerEntry} className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="season_id" value={season.id} />
                        <input type="hidden" name="entry_id" value={l.id} />
                        <span className="text-primary">
                          {isRevenue
                            ? t(`قُبض في ${done}`, `Received on ${done}`)
                            : t(`سُدِّد في ${done}`, `Paid on ${done}`)}
                        </span>
                        {isOwner && (
                          <button type="submit" className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-background">
                            {t("إلغاء السداد", "Cancel")}
                          </button>
                        )}
                      </form>
                    ) : (
                      isOwner && (
                        <form action={settleLedgerEntry} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="season_id" value={season.id} />
                          <input type="hidden" name="entry_id" value={l.id} />
                          <label className="flex flex-col gap-1 text-xs">
                            {isRevenue ? t("قُبض في", "Received into") : t("دُفع من", "Paid from")}
                            <select name="paid_from" className={field} defaultValue="cash">
                              <option value="cash">{t("نقداً", "Cash")}</option>
                              <option value="bank">{t("البنك", "Bank")}</option>
                              <option value="wallet">{t("محفظة إلكترونية", "Mobile wallet")}</option>
                            </select>
                          </label>
                          {l.currency === "SDG" && (
                            <label className="flex flex-col gap-1 text-xs">
                              {t("سعر الصرف اليوم", "Today's rate")}
                              <input
                                type="text"
                                inputMode="decimal"
                                name="fx_rate"
                                placeholder={suggested ? String(Number(suggested.rate)) : t("جنيه لكل دولار", "pounds per dollar")}
                                className={field}
                              />
                            </label>
                          )}
                          <label className="flex flex-col gap-1 text-xs">
                            {t("التاريخ (اختياري)", "Date (optional)")}
                            <input type="date" name="settle_date" max={today} className={field} />
                          </label>
                          <button
                            type="submit"
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                          >
                            {isRevenue ? t("قبضتُ", "I was paid") : t("سدّدتُ", "I paid")}
                          </button>
                        </form>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {band && (
          <p className="mt-4 text-sm text-muted">
            {t(
              "للمقارنة: الوسيط المتوقع لهذا المحصول",
              "For comparison: the expected median for this crop is",
            )}{" "}
            <span className="font-bold text-foreground">
              ${band.p50.toFixed(0)}
            </span>{" "}
            {t(
              "صافي ربح للفدان، ونتيجتك حتى الآن",
              "net profit per feddan, and your result so far is",
            )}{" "}
            <span className="font-bold text-foreground">
              ${summary.profitPerFeddan.toFixed(0)}
            </span>
            .
          </p>
        )}
      </section>

      {canWrite &&
        doneCount === stages.length &&
        stages.length > 0 && (
          <form action={completeSeason} className="mt-10">
            <input type="hidden" name="season_id" value={season.id} />
            <label className="mb-3 block max-w-xs text-sm">
              <span className="mb-1 block font-medium">
                {t(
                  "الوزن المحصود (كجم) — اختياري",
                  "Harvested weight (kg) — optional",
                )}
              </span>
              <input
                name="harvest_kg"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className={field + " w-full"}
                placeholder={t(
                  `مثلاً: ${n0(season.feddans * 250)}`,
                  `e.g. ${n0(season.feddans * 250)}`,
                )}
              />
              <span className="mt-1 block text-xs text-muted">
                {locale === "en"
                  ? `Divided by ${season.feddans} feddans and compared with the national average. It does not count towards any score.`
                  : `يُقسَم على ${season.feddans} فدان ويُقارَن بالمتوسّط الوطني. لا يدخل في أيّ درجة.`}
              </span>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
            >
              {t(
                "أغلق الموسم واحتسبه في سجلي",
                "Close the season and count it in my record",
              )}
            </button>
          </form>
        )}
    </div>
  );
}
