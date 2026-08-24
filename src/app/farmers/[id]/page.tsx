import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  /*
   * The record is read with the service-role client, and the reason is the gap
   * between what this page shows and what its source returned.
   *
   * The page displays a score. `farmer_season_records` returns the numbers the
   * score is computed FROM — per-season planned budget, actual costs and
   * revenue. One season's revenue is that farmer's income for that season; it
   * is not an aggregate that protects anybody. And the function was
   * SECURITY DEFINER with EXECUTE to PUBLIC, so anyone holding the anon key —
   * which every browser on this site holds — could call it directly for any
   * owner id and read the money this page deliberately never prints.
   *
   * The intent was always right; the endpoint contradicted it. Reading it
   * server-side means the figures reach the scoring function and stop there.
   */
  const admin = createAdminClient();

  const [{ data: profileRows }, seasonResponse] = await Promise.all([
    supabase.rpc("public_farmer_profile", { p_id: id }),
    admin ? admin.rpc("farmer_season_records", { p_id: id }) : null,
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

  /*
   * Unreadable is not the same as empty, and the page has to say which.
   *
   * With no service-role key configured, or with the call failing, an empty
   * list would render as "this person has recorded no seasons" — a statement
   * about them — and would feed computeTrust an empty record, which is a
   * judgement drawn from nothing. Both are worse than saying we could not read
   * it.
   */
  const recordUnavailable = seasonResponse === null || !!seasonResponse.error;
  if (seasonResponse?.error) {
    console.error("farmer_season_records: read failed", seasonResponse.error);
  }

  const seasons = (seasonResponse?.data ?? []) as SeasonRow[];

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
        {/*
          A score is a judgement, and a judgement drawn from a record we failed
          to read is a judgement drawn from nothing. When the record is
          unavailable the index says so and stops — it does not fall back to
          "no history", which reads as a verdict on the person.
        */}
        {recordUnavailable ? (
          <>
            <p className="mt-1 text-3xl font-black text-muted">—</p>
            <p className="mt-2 text-sm text-muted">
              لا يمكن حساب المؤشر قبل قراءة السجلّ. وغياب الرقم هنا لا يعني أن
              السجلّ خالٍ.
            </p>
          </>
        ) : (
          <>
            {trust.score === null ? (
              <p className="mt-1 text-3xl font-black text-muted">—</p>
            ) : (
              <p className={`mt-1 text-4xl font-black ${bandTone}`}>
                {trust.score}
                <span className="text-lg text-muted">/100</span>
              </p>
            )}
            <p className={`text-sm font-medium ${bandTone}`}>
              {trust.bandLabel}
            </p>
            <p className="mt-2 text-sm text-muted">{trust.summary}</p>
          </>
        )}

        {!recordUnavailable && trust.factors.length > 0 && (
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
        <h2 className="mb-4 text-lg font-bold">
          المواسم{recordUnavailable ? "" : ` (${seasons.length})`}
        </h2>
        {recordUnavailable ? (
          <p className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
            تعذّر قراءة سجلّ المواسم الآن — <strong>والخلل عندنا</strong>، فلا
            تقرأ هذا على أنه سجلّ فارغ. أعد المحاولة بعد قليل.
          </p>
        ) : seasons.length === 0 ? (
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
