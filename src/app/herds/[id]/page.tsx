import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import Explain from "@/components/Explain";
import HerdReadiness from "@/components/HerdReadiness";
import HerdExportChecklist from "@/components/HerdExportChecklist";
import type { HealthRecord, HerdTag } from "@/lib/herdHealth";
import { buildChecklist, EXPORT_DESTINATIONS, type ExportDestination } from "@/lib/livestockExportChecklist";
import { diseaseName, fetchDiseaseEvents } from "@/lib/animalDisease";
import { DISEASE_ALERT_DAYS, isoDaysBefore } from "@/lib/fieldAlerts";
import { completeHerdStage, setHerdBudget } from "@/app/herds/actions";
import {
  SPECIES_LABEL,
  SPECIES_LABEL_EN,
  PURPOSE_LABEL,
  PURPOSE_LABEL_EN,
  HERD_STAGE_LABEL,
  HERD_STAGE_LABEL_EN,
} from "@/lib/livestock";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import type { Herd, HerdStage } from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "دورة إنتاج حيواني | سوداقري",
      "Livestock production cycle | Sudagri",
    ),
  };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function HerdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; rerror?: string; to?: string }>;
}) {
  const { id } = await params;
  const { error: errorMessage, rerror, to } = await searchParams;
  const destination: ExportDestination = EXPORT_DESTINATIONS.includes(to as ExportDestination) ? (to as ExportDestination) : "sa";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

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

  // الجاهزيّة للتصدير للمجترّات والإبل وحدها: الدواجن والأسماك لا تُصدَّر حيّةً من هنا.
  const exportable = ["cattle", "sheep", "goat", "camel"].includes(herd.species);
  const [{ data: recordRows }, { data: tagRows }] = exportable
    ? await Promise.all([
        supabase
          .from("herd_health_records")
          .select("id, kind, item_key, done_on, heads, result, product, batch, vet_name, note, withdrawn_at, withdrawn_note, created_at")
          .eq("herd_id", id)
          .order("done_on", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("herd_tags").select("tag, status, added_on").eq("herd_id", id).order("added_on").order("tag"),
      ])
    : [{ data: [] }, { data: [] }];

  // «من منطقةٍ لم تُسجَّل فيها أمراض وبائيّة»: ولاية أرض القطيع مقابل ما وصل الفاو.
  let stateDiseases: string[] | null = null;
  if (exportable && herd.land_id) {
    const { data: land } = await supabase.from("lands").select("state").eq("id", herd.land_id).maybeSingle();
    const state = (land as { state: string | null } | null)?.state ?? null;
    const events = state ? await fetchDiseaseEvents() : null;
    if (state && events) {
      const today = new Date().toISOString().slice(0, 10);
      const since = isoDaysBefore(today, DISEASE_ALERT_DAYS);
      stateDiseases = [
        ...new Set(
          events
            .filter((e) => e.country === "Sudan" && e.state === state && e.date >= since && e.date <= today)
            .map((e) => diseaseName(e.disease, locale)),
        ),
      ];
    }
  }
  const checklist = exportable
    ? buildChecklist(destination, {
        species: herd.species,
        headCount: herd.head_count,
        records: (recordRows ?? []) as HealthRecord[],
        tags: (tagRows ?? []) as HerdTag[],
        stateDiseases,
        today: new Date().toISOString().slice(0, 10),
      })
    : [];

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
      <h1 className="text-2xl font-bold" {...arText}>
        {herd.name}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {(en ? SPECIES_LABEL_EN : SPECIES_LABEL)[herd.species]} —{" "}
        {(en ? PURPOSE_LABEL_EN : PURPOSE_LABEL)[herd.purpose]}
        {herd.breed && (
          <>
            {" — "}
            <span {...arText}>{herd.breed}</span>
          </>
        )}{" "}
        — {n0(herd.head_count)} {t("رأس", "head")}
      </p>

      {/*
        من القطيع إلى العقد مباشرةً. القاعدةُ تقبل عقداً على قطيع منذ البداية،
        والنموذجُ يعرضه — لكن لم يكن من هنا طريقٌ إليه، فكان صاحبُ القطيع يخرج
        إلى صفحة العقود ويبحث عن قطيعه في القائمة من جديد.
      */}
      {herd.status === "active" && (
        <Link
          href={`/contracts/new?herd=${herd.id}`}
          className="mt-4 inline-block rounded-xl border border-primary/40 bg-card px-4 py-2 text-sm font-medium text-primary shadow-card transition hover:shadow-raised"
        >
          {t(
            "اطلب خدمة لهذا القطيع (برنامج بيطري، تغذية، متابعة صحّة)",
            "Request a service for this herd (veterinary programme, feeding, health monitoring)",
          )}{" "}
          {en ? "→" : "←"}
        </Link>
      )}

      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">
            {t("المراحل المنجزة", "Stages completed")}
          </p>
          <p className="text-lg font-bold">
            {done} / {stages.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">
            {t("العلف التقديري", "Estimated feed")}
          </p>
          <p className="text-lg font-bold">
            {n0(totalFeed)} {t("كجم", "kg")}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("الميزانية", "Budget")}</p>
          <p className="text-lg font-bold">
            {totalBudget > 0 ? n0(totalBudget) : "—"}
          </p>
          {totalBudget > 0 && (
            <p className="text-[11px] text-muted">
              {n0(perHead)} {t("للرأس", "per head")}
            </p>
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
          {en ? (
            <>
              <strong>No budget has been entered for this cycle.</strong> The
              “Budget per head” field is optional at creation and was left
              blank — so the zeros below are not a failed calculation, just a
              number nobody entered. Enter it now and it will be split across
              the stages in proportion to feed.
            </>
          ) : (
            <>
              <strong>لم تُدخَل ميزانيّةٌ لهذه الدورة.</strong> حقلُ «الميزانية
              للرأس» اختياريٌّ عند الإنشاء، وتُرك فارغاً — فالأصفارُ أدناه ليست
              حساباً فشل، بل رقماً لم يُكتب. اكتبه الآن ويُقسَّم على المراحل
              بنسبة العلف.
            </>
          )}
        </p>
      )}

      <form
        action={setHerdBudget}
        className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-5"
      >
        <input type="hidden" name="herd_id" value={herd.id} />
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-muted">
            {t(
              "الميزانية للرأس — وتُقسَّم على المراحل بنسبة العلف",
              "Budget per head — split across the stages in proportion to feed",
            )}
          </span>
          <input
            name="budget_per_head"
            type="number"
            min={0}
            step="any"
            defaultValue={perHead || ""}
            placeholder={t("مثال: 45000", "e.g. 45000")}
            className="w-full min-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {totalBudget > 0
            ? t("حدّث الميزانية", "Update budget")
            : t("أضف الميزانية", "Add budget")}
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
        {t(
          "تقدير العلف مبنٍ على متوسطات استهلاك المادة الجافة كنسبة من وزن الحيوان، وليس حساباً مرجعياً كاحتياج المحاصيل المائي. اعتمده كنقطة بداية وعدّله على واقع قطيعك.",
          "The feed estimate is based on average dry-matter intake as a share of the animal's body weight; it is not a reference calculation like crop water requirements. Use it as a starting point and adjust it to your own herd.",
        )}
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
                {s.stage_order}.{" "}
                {(en ? HERD_STAGE_LABEL_EN : HERD_STAGE_LABEL)[s.stage_key]}
              </h2>
              <span
                className={`text-sm ${s.completed ? "text-primary" : "text-muted"}`}
              >
                {s.completed ? t("منجزة", "Done") : t("مفتوحة", "Open")}
              </span>
            </div>

            {/*
              وكانت هذه السطورُ ثلاثةَ أرقامٍ بلا أسماء: «١٬٠٩٠ كجم علف · ٠».
              الصفرُ الأخير ميزانيّةٌ لا يقول شيءٌ إنّها ميزانيّة، والمدّةُ
              مطويّةٌ في تاريخين على القارئ أن يطرحهما. فصار لكلّ رقمٍ اسمُه.
            */}
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">{t("من", "From")}</dt>
                <dd>{s.planned_start ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("إلى", "To")}</dt>
                <dd>{s.planned_end ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("المدّة", "Duration")}</dt>
                <dd>
                  {days(s.planned_start, s.planned_end) != null
                    ? `${days(s.planned_start, s.planned_end)} ${t("يوماً", "days")}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  {t("العلف التقديري", "Estimated feed")}
                </dt>
                <dd>
                  {s.planned_feed_kg != null
                    ? `${n0(Number(s.planned_feed_kg))} ${t("كجم", "kg")}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  {t("حصّتها من الميزانية", "Share of budget")}
                </dt>
                <dd>
                  {Number(s.budget ?? 0) > 0
                    ? n0(Number(s.budget))
                    : t("لم تُدخَل", "Not entered")}
                </dd>
              </div>
              {totalFeed > 0 && s.planned_feed_kg != null && (
                <div>
                  <dt className="text-xs text-muted">
                    {t("من علف الدورة", "Of the cycle's feed")}
                  </dt>
                  <dd>
                    {Math.round(
                      (Number(s.planned_feed_kg) / totalFeed) * 100,
                    )}
                    {en ? "%" : "٪"}
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
                  {t("اعتمد المرحلة", "Sign off stage")}
                </button>
              </form>
            )}
          </li>
        ))}
      </ol>

      {exportable && (
        <HerdReadiness
          herdId={herd.id}
          headCount={herd.head_count}
          active={herd.status === "active"}
          records={(recordRows ?? []) as HealthRecord[]}
          tags={(tagRows ?? []) as HerdTag[]}
          locale={locale}
          error={rerror}
        >
          <HerdExportChecklist herdId={herd.id} destination={destination} lines={checklist} locale={locale} />
        </HerdReadiness>
      )}
    </div>
  );
}
