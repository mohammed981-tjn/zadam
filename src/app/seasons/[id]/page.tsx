import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CROPS, STATIONS, IRRIGATION_LABEL } from "@/lib/agronomy";
import type { IrrigationMethod } from "@/lib/agronomy";
import {
  STAGE_TEMPLATES,
  disbursementDecision,
  summariseLedger,
  LEDGER_LABEL,
  type LedgerCategory,
} from "@/lib/season";
import { returnBand } from "@/lib/risk";
import type {
  LedgerEntryRow,
  Season,
  SeasonStage,
  StageEvidence,
} from "@/types/database";
import {
  addEvidence,
  addLedgerEntry,
  completeSeason,
  completeStage,
} from "../actions";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

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

  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", id)
    .single();

  if (!seasonRow) notFound();
  const season = seasonRow as Season;

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
  const cropName =
    CROPS.find((c) => c.key === season.crop_key)?.name ?? season.crop_key;
  const stationName =
    STATIONS.find((s) => s.key === season.station_key)?.name ??
    season.station_key;

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
      <h1 className="text-2xl font-bold">{season.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {cropName} · {stationName} · {season.feddans} فدان ·{" "}
        {IRRIGATION_LABEL[season.irrigation as IrrigationMethod] ??
          season.irrigation}
        {season.location ? ` · ${season.location}` : ""}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          {
            l: "التقدّم",
            v: `${progress}%`,
            s: `${doneCount} من ${stages.length} مراحل`,
          },
          {
            l: "مصروف",
            v: `$${n0(summary.costs)}`,
            s: `من ميزانية $${n0(plannedBudget)}`,
          },
          { l: "مُفرَج عنه", v: `$${n0(released)}`, s: "بعد اعتماد المراحل" },
          {
            l: "صافي الربح",
            v: `$${n0(summary.profit)}`,
            s: `$${summary.profitPerFeddan.toFixed(0)} للفدان`,
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

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">خط الموسم</h2>
        <ol className="flex flex-col gap-4">
          {stages.map((s, i) => {
            const decision = disbursementDecision(gateInput, i);
            const ev = evidenceFor(s.id);
            const template = STAGE_TEMPLATES[s.stage_key];

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
                      {template?.name ?? s.stage_key}
                    </h3>
                    <p className="text-xs text-muted">
                      {s.planned_start} ← {s.planned_end}
                      {Number(s.planned_water_m3) > 0
                        ? ` · ${n0(Number(s.planned_water_m3))} م³`
                        : ""}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold">${n0(Number(s.budget))}</p>
                    <p
                      className={`text-xs font-medium ${
                        decision.released ? "text-primary" : "text-accent"
                      }`}
                    >
                      {decision.released ? "مُفرَج عنه" : "محجوز"}
                    </p>
                  </div>
                </div>

                {template && (
                  <ul className="mt-3 list-disc space-y-1 pr-5 text-xs text-muted">
                    {template.activities.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}

                {!decision.released && (
                  <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">
                    {decision.reason}
                  </p>
                )}

                {ev.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {ev.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                      >
                        {e.caption}
                      </li>
                    ))}
                  </ul>
                )}

                {season.status === "active" && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <form
                      action={addEvidence}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="stage_id" value={s.id} />
                      <input type="hidden" name="season_id" value={season.id} />
                      <select
                        name="kind"
                        className={field}
                        defaultValue="photo"
                      >
                        <option value="photo">صورة</option>
                        <option value="invoice">فاتورة</option>
                        <option value="inspection">معاينة</option>
                        <option value="note">ملاحظة</option>
                      </select>
                      <input
                        name="caption"
                        required
                        placeholder="وصف الدليل"
                        className={field}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
                      >
                        أضف دليلاً
                      </button>
                    </form>

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
                          اعتمد المرحلة
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
        <h2 className="mb-4 text-lg font-bold">دفتر الحسابات</h2>

        {summary.byCategory.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-right">
                <tr>
                  <th className="px-4 py-3">البند</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">النسبة من التكلفة</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-border">
                    <td className="px-4 py-2">{c.label}</td>
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
                  <td className="px-4 py-2">الإيراد</td>
                  <td className="px-4 py-2">${n0(summary.revenue)}</td>
                  <td className="px-4 py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {season.status === "active" && (
          <form
            action={addLedgerEntry}
            className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
          >
            <input type="hidden" name="season_id" value={season.id} />
            <label className="flex flex-col gap-1 text-xs">
              البند
              <select name="category" className={field} defaultValue="seeds">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LEDGER_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              المبلغ ($)
              <input
                type="number"
                name="amount"
                min={0}
                step="1"
                required
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              الوصف
              <input name="description" className={field} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              أضف قيداً
            </button>
          </form>
        )}

        {band && (
          <p className="mt-4 text-sm text-muted">
            للمقارنة: الوسيط المتوقع لهذا المحصول{" "}
            <span className="font-bold text-foreground">
              ${band.p50.toFixed(0)}
            </span>{" "}
            صافي ربح للفدان، ونتيجتك حتى الآن{" "}
            <span className="font-bold text-foreground">
              ${summary.profitPerFeddan.toFixed(0)}
            </span>
            .
          </p>
        )}
      </section>

      {season.status === "active" &&
        doneCount === stages.length &&
        stages.length > 0 && (
          <form action={completeSeason} className="mt-10">
            <input type="hidden" name="season_id" value={season.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
            >
              أغلق الموسم واحتسبه في سجلي
            </button>
          </form>
        )}
    </div>
  );
}
