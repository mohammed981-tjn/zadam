import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain from "@/components/Explain";
import { completeHerdStage, setHerdBudget } from "@/app/herds/actions";
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

  // والميزانيّةُ لا تُخزَّن للرأس، بل مقسومةً على المراحل — فتُشتقّ للعرض.
  const perHead =
    herd.head_count > 0 ? Math.round(totalBudget / herd.head_count) : 0;

  const days = (from: string | null, to: string | null) =>
    from && to
      ? Math.round(
          (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
        ) + 1
      : null;

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
          <p className="text-lg font-bold">
            {totalBudget > 0 ? n0(totalBudget) : "—"}
          </p>
          {totalBudget > 0 && (
            <p className="text-[11px] text-muted">{n0(perHead)} للرأس</p>
          )}
        </div>
      </div>

      {/*
        صفرٌ يقول لماذا هو صفر.
        The budget is a figure the owner types once at creation, and the field
        is optional. Left blank it produced «0» here and «· 0» on every phase,
        beside a feed number that *is* computed — which reads as a broken
        calculation rather than an empty field. It is neither: it is a number
        nobody entered, and until now there was no way to enter it afterwards.
      */}
      {totalBudget === 0 && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm leading-7">
          <strong>لم تُدخَل ميزانيّةٌ لهذه الدورة.</strong> حقلُ «الميزانية
          للرأس» اختياريٌّ عند الإنشاء، وتُرك فارغاً — فالأصفارُ أدناه ليست
          حساباً فشل، بل رقماً لم يُكتب. اكتبه الآن ويُقسَّم على المراحل بنسبة
          العلف.
        </p>
      )}

      <form
        action={setHerdBudget}
        className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-5"
      >
        <input type="hidden" name="herd_id" value={herd.id} />
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-muted">
            الميزانية للرأس — وتُقسَّم على المراحل بنسبة العلف
          </span>
          <input
            name="budget_per_head"
            type="number"
            min={0}
            step="any"
            defaultValue={perHead || ""}
            placeholder="مثال: 45000"
            className="w-full min-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {totalBudget > 0 ? "حدّث الميزانية" : "أضف الميزانية"}
        </button>
        {/* والمواعيدُ والعلفُ لا تُمسّ: المالُ خطّةٌ تُراجَع، والجدولُ ما جرت
            عليه الدورةُ فعلاً وقد تكون مرحلةٌ منه أُغلقت. */}
      </form>

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

            {/*
              وكانت هذه السطورُ ثلاثةَ أرقامٍ بلا أسماء: «١٬٠٩٠ كجم علف · ٠».
              الصفرُ الأخير ميزانيّةٌ لا يقول شيءٌ إنّها ميزانيّة، والمدّةُ
              مطويّةٌ في تاريخين على القارئ أن يطرحهما. فصار لكلّ رقمٍ اسمُه.
            */}
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">من</dt>
                <dd>{s.planned_start ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">إلى</dt>
                <dd>{s.planned_end ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">المدّة</dt>
                <dd>
                  {days(s.planned_start, s.planned_end) != null
                    ? `${days(s.planned_start, s.planned_end)} يوماً`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">العلف التقديري</dt>
                <dd>
                  {s.planned_feed_kg != null
                    ? `${n0(Number(s.planned_feed_kg))} كجم`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">حصّتها من الميزانية</dt>
                <dd>
                  {Number(s.budget ?? 0) > 0
                    ? n0(Number(s.budget))
                    : "لم تُدخَل"}
                </dd>
              </div>
              {totalFeed > 0 && s.planned_feed_kg != null && (
                <div>
                  <dt className="text-xs text-muted">من علف الدورة</dt>
                  <dd>
                    {Math.round(
                      (Number(s.planned_feed_kg) / totalFeed) * 100,
                    )}
                    ٪
                  </dd>
                </div>
              )}
            </dl>

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
