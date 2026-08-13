import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CROPS } from "@/lib/agronomy";
import { computeTrust, type SeasonRecord } from "@/lib/trust";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

interface SeasonRow {
  season_id: string;
  name: string;
  crop_key: string;
  planting_date: string;
  status: "active" | "completed" | "abandoned";
  feddans: number;
  planned_budget: number;
  actual_costs: number;
  revenue: number;
  stages_total: number;
  stages_completed: number;
  stages_with_evidence: number;
  stages_on_time: number;
}

export default async function FarmerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Both come from security-definer functions that return aggregates only —
  // a visitor can judge the record without reading the farmer's invoices.
  const [{ data: profileRows }, { data: seasonRows }] = await Promise.all([
    supabase.rpc("public_farmer_profile", { p_id: id }),
    supabase.rpc("farmer_season_records", { p_id: id }),
  ]);

  const profile = (
    profileRows as
      | {
          id: string;
          full_name: string;
          country: string | null;
          created_at: string;
        }[]
      | null
  )?.[0];

  if (!profile) notFound();

  const seasons = (seasonRows ?? []) as SeasonRow[];

  const records: SeasonRecord[] = seasons.map((s) => ({
    status: s.status,
    feddans: Number(s.feddans),
    plannedBudget: Number(s.planned_budget),
    actualCosts: Number(s.actual_costs),
    revenue: Number(s.revenue),
    stagesTotal: s.stages_total,
    stagesCompleted: s.stages_completed,
    stagesWithEvidence: s.stages_with_evidence,
    stagesOnTime: s.stages_on_time,
  }));

  const trust = computeTrust(records);

  const bandTone =
    trust.band === "trusted"
      ? "text-primary"
      : trust.band === "established"
        ? "text-accent"
        : "text-muted";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{profile.full_name}</h1>
      <p className="mt-1 text-sm text-muted">
        {profile.country ? `${profile.country} · ` : ""}
        منضمّ منذ {new Date(profile.created_at).toLocaleDateString("ar-EG")}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs text-muted">مؤشر الثقة</p>
        {trust.score === null ? (
          <p className="mt-1 text-3xl font-black text-muted">—</p>
        ) : (
          <p className={`mt-1 text-4xl font-black ${bandTone}`}>
            {trust.score}
            <span className="text-lg text-muted">/100</span>
          </p>
        )}
        <p className={`text-sm font-medium ${bandTone}`}>{trust.bandLabel}</p>
        <p className="mt-2 text-sm text-muted">{trust.summary}</p>

        {trust.factors.length > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            {trust.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted">
                    {Math.round(f.score * f.weight)}/{f.weight}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.round(f.score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">{f.detail}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted">
          كل رقم أعلاه محسوب من مواسم سجّلها هذا المنفّذ ووثّق مراحلها بأدلة —
          لا من تقييم كتبه عن نفسه ولا من انطباعات. وتفاصيل مصروفاته تبقى خاصة
          به: ما يظهر هنا مجاميع فقط.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-bold">المواسم ({seasons.length})</h2>
        {seasons.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            لا توجد مواسم مسجّلة لهذا المنفّذ.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {seasons.map((s) => {
              const crop =
                CROPS.find((c) => c.key === s.crop_key)?.name ?? s.crop_key;
              return (
                <li
                  key={s.season_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted">
                      {crop} · {n0(Number(s.feddans))} فدان · زراعة{" "}
                      {s.planting_date}
                    </p>
                  </div>
                  <div className="text-left text-sm">
                    <p className="text-muted">
                      {s.stages_completed}/{s.stages_total} مراحل
                    </p>
                    <span
                      className={`text-xs font-medium ${
                        s.status === "completed"
                          ? "text-primary"
                          : s.status === "abandoned"
                            ? "text-danger"
                            : "text-accent"
                      }`}
                    >
                      {s.status === "completed"
                        ? "مكتمل"
                        : s.status === "abandoned"
                          ? "متوقف"
                          : "جارٍ"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
