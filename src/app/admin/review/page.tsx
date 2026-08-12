import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, riskLabel } from "@/lib/format";
import { MONTH_NAMES, CROPS, STATIONS } from "@/lib/agronomy";
import {
  assessProject,
  WATER_SOURCE_LABEL,
  type WaterSource,
} from "@/lib/risk";
import type { IrrigationMethod } from "@/lib/agronomy";
import type { Project } from "@/types/database";
import { approveOpportunity, rejectOpportunity } from "./actions";

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("review_status", "submitted")
    .order("created_at", { ascending: true });

  const pending = (data ?? []) as Project[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">مراجعة الفرص المرفوعة</h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {pending.length === 0
          ? "لا توجد فرص بانتظار المراجعة."
          : `${pending.length} فرصة بانتظار قرارك. الدرجة أدناه مُعاد حسابها الآن من بيانات الفرصة.`}
      </p>

      <div className="flex flex-col gap-6">
        {pending.map((p) => {
          const assessment = assessProject({
            cropKey: p.crop_key ?? "",
            stationKey: p.station_key ?? "",
            plantingMonth: p.planting_month ?? 0,
            irrigation: (p.irrigation ?? "flood") as IrrigationMethod,
            waterSource: (p.water_source ?? "canal") as WaterSource,
            declaredWaterPerFeddan: p.declared_water_per_feddan ?? 0,
            documentsOnFile: p.documents_on_file,
            documentsRequired: p.documents_required,
            operatorSeasons: 0,
            operatorReportingRate: 0,
            kmToMarket: p.km_to_market ?? 0,
          });

          const cropName =
            CROPS.find((c) => c.key === p.crop_key)?.name ?? p.crop_key;
          const stationName =
            STATIONS.find((s) => s.key === p.station_key)?.name ??
            p.station_key;

          return (
            <article
              key={p.id}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <p className="text-sm text-muted">{p.location}</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-black text-primary">
                    {assessment.score}
                    <span className="text-sm text-muted">/100</span>
                  </p>
                  <p className="text-xs text-muted">
                    مخاطرة {riskLabel(assessment.level)}
                  </p>
                </div>
              </div>

              {p.description && (
                <p className="mt-3 text-sm text-foreground/85">
                  {p.description}
                </p>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {[
                  ["المحصول", cropName],
                  ["المنطقة", stationName],
                  ["شهر الزراعة", MONTH_NAMES[p.planting_month ?? 0]],
                  [
                    "مصدر المياه",
                    WATER_SOURCE_LABEL[
                      (p.water_source ?? "canal") as WaterSource
                    ],
                  ],
                  ["المساحة", `${p.total_feddans} فدان`],
                  [
                    "الحصص",
                    `${p.total_shares} × ${formatUsd(p.price_per_share)}`,
                  ],
                  ["التوثيق", `${p.documents_on_file}/${p.documents_required}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-col gap-2 rounded-xl bg-background p-4">
                {assessment.factors.map((f) => (
                  <div key={f.key} className="text-xs">
                    <span className="font-medium">{f.label}</span>{" "}
                    <span className="text-muted">
                      {Math.round(f.score * f.weight)}/{f.weight} — {f.detail}
                    </span>
                  </div>
                ))}
              </div>

              {assessment.blockers.length > 0 && (
                <ul className="mt-4 list-disc space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-4 pr-8 text-sm text-danger">
                  {assessment.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-end gap-3">
                <form action={approveOpportunity}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    disabled={assessment.blockers.length > 0}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    اعتمد وانشر
                  </button>
                </form>

                <form
                  action={rejectOpportunity}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    سبب الرفض
                    <input
                      name="note"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
                  >
                    ارفض
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
