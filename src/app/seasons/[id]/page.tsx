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
import type {
  LedgerEntryRow,
  Season,
  SeasonStage,
  StageEvidence,
} from "@/types/database";
import { addLedgerEntry, completeSeason, completeStage } from "../actions";
import StageEvidenceUpload from "@/components/StageEvidence";
import YieldBenchmark from "@/components/YieldBenchmark";

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
        <h2 className="mb-4 text-lg font-bold">
          {t("دفتر الحسابات", "Ledger")}
        </h2>

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
          <form
            action={addLedgerEntry}
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
              {t("المبلغ ($)", "Amount ($)")}
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
              {t("الوصف", "Description")}
              <input name="description" className={field} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("أضف قيداً", "Add entry")}
            </button>
          </form>
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
