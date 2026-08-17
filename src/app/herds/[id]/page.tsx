import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain from "@/components/Explain";
import { completeHerdStage } from "@/app/herds/actions";
import { SPECIES_LABEL, PURPOSE_LABEL, HERD_STAGE_LABEL } from "@/lib/livestock";
import type { Herd, HerdStage } from "@/types/database";

export const metadata = { title: "دورة إنتاج حيواني | سودجري" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function HerdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: herdRow } = await supabase
    .from("herds")
    .select("*")
    .eq("id", id)
    .single();

  if (!herdRow) notFound();
  const herd = herdRow as Herd;

  const { data: stageRows } = await supabase
    .from("herd_stages")
    .select("*")
    .eq("herd_id", id)
    .order("stage_order");

  const stages = (stageRows ?? []) as HerdStage[];

  const done = stages.filter((s) => s.completed).length;
  const totalFeed = stages.reduce((s, x) => s + Number(x.planned_feed_kg ?? 0), 0);
  const totalBudget = stages.reduce((s, x) => s + Number(x.budget ?? 0), 0);

  // The next open phase is the only one that can be closed, so it is the only
  // one that gets a button — the rule is shown by the interface rather than
  // discovered by being refused.
  const nextOpen = stages.find((s) => !s.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{herd.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {SPECIES_LABEL[herd.species]} — {PURPOSE_LABEL[herd.purpose]}
        {herd.breed && ` — ${herd.breed}`} — {n0(herd.head_count)} رأس
      </p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">المراحل المنجزة</p>
          <p className="text-lg font-bold">
            {done} / {stages.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">العلف التقديري</p>
          <p className="text-lg font-bold">{n0(totalFeed)} كجم</p>
        </div>
        <div>
          <p className="text-xs text-muted">الميزانية</p>
          <p className="text-lg font-bold">{n0(totalBudget)}</p>
        </div>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
          {errorMessage}
        </p>
      )}

      <Explain tone="warn">
        تقدير العلف مبنٍ على متوسطات استهلاك المادة الجافة كنسبة من وزن الحيوان،
        وليس حساباً مرجعياً كاحتياج المحاصيل المائي. اعتمده كنقطة بداية وعدّله
        على واقع قطيعك.
      </Explain>

      <ol className="mt-6 flex flex-col gap-3">
        {stages.map((s) => (
          <li
            key={s.id}
            className={`rounded-2xl border p-5 ${
              s.completed ? "border-primary/30 bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">
                {s.stage_order}. {HERD_STAGE_LABEL[s.stage_key]}
              </h2>
              <span
                className={`text-sm ${s.completed ? "text-primary" : "text-muted"}`}
              >
                {s.completed ? "منجزة" : "مفتوحة"}
              </span>
            </div>

            <p className="mt-1 text-sm text-muted">
              {s.planned_start} — {s.planned_end}
              {s.planned_feed_kg != null && (
                <> · {n0(Number(s.planned_feed_kg))} كجم علف</>
              )}
              {s.budget != null && <> · {n0(Number(s.budget))}</>}
            </p>

            {nextOpen?.id === s.id && (
              <form action={completeHerdStage} className="mt-4">
                <input type="hidden" name="stage_id" value={s.id} />
                <input type="hidden" name="herd_id" value={herd.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-primary px-4 py-1.5 text-sm font-medium text-primary"
                >
                  اعتمد المرحلة
                </button>
              </form>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
