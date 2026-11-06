import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { HERD_STAGE_LABEL, PURPOSE_LABEL, SPECIES_LABEL } from "@/lib/livestock";
import { HEALTH_ITEMS, KIND_LABEL, TAG_STATUS_LABEL, healthItemName, tagCounts } from "@/lib/herdHealth";
import {
  DESTINATION_NAME,
  EXPORT_DESTINATIONS,
  SOURCE_KIND_LABEL,
  checklistVerdict,
  type ExportDestination,
} from "@/lib/livestockExportChecklist";
import {
  addHerdHealthRecord,
  addHerdTagRange,
  completeHerdStageStep,
  loadHerdReadiness,
  setHerdBudgetStep,
} from "@/lib/herdSteps";
import type { Herd, HerdStage } from "@/types/database";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

const SESSION_OVER = { error: "انتهت جلستك. ادخل من جديد." };
const notYours = (locale: Locale) => ({ error: tr(locale, "الدورة غير موجودة أو ليست لك.", "This cycle does not exist or is not yours.") });

/**
 * One production cycle in the app (backlog 203), as the website's /herds/[id] shows it: its stages with dates, feed
 * and budget, and — for cattle, sheep, goats and camels — its export readiness: the health record, the ear tags, and
 * the preparation checklist for Saudi Arabia or Egypt (`?to=sa|eg`), each line with its source.
 *
 * Read as the signed-in person, through row-level security, and only the caller's own herd.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const locale = appLocale(req);
  const NOT_YOURS = notYours(locale);
  const { supabase, user } = auth;
  const { id } = await params;
  const to = new URL(req.url).searchParams.get("to");
  const destination: ExportDestination = EXPORT_DESTINATIONS.includes(to as ExportDestination) ? (to as ExportDestination) : "sa";

  const { data: herdRow } = await supabase.from("herds").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!herdRow) return NextResponse.json(NOT_YOURS, { status: 404 });
  const herd = herdRow as Herd;

  const [{ data: stageRows }, readiness] = await Promise.all([
    supabase.from("herd_stages").select("*").eq("herd_id", id).order("stage_order"),
    loadHerdReadiness(supabase, herd, destination, locale),
  ]);
  const stages = (stageRows ?? []) as HerdStage[];
  const totalFeed = stages.reduce((s, x) => s + Number(x.planned_feed_kg ?? 0), 0);
  const totalBudget = stages.reduce((s, x) => s + Number(x.budget ?? 0), 0);
  const nextOpen = stages.find((s) => !s.completed);
  const days = (from: string | null, until: string | null) =>
    from && until ? Math.round((new Date(until).getTime() - new Date(from).getTime()) / 86_400_000) + 1 : null;

  const counts = tagCounts(readiness.tags);
  const verdict = checklistVerdict(readiness.checklist);

  return NextResponse.json(
    {
      herd: {
        id: herd.id,
        name: herd.name,
        species: herd.species,
        species_label: SPECIES_LABEL[herd.species] ?? herd.species,
        purpose_label: PURPOSE_LABEL[herd.purpose] ?? herd.purpose,
        breed: herd.breed,
        head_count: herd.head_count,
        status: herd.status,
        start_date: herd.start_date,
        end_date: herd.end_date,
      },
      totals: {
        done: stages.filter((s) => s.completed).length,
        stages: stages.length,
        feed_kg: Math.round(totalFeed),
        budget: Math.round(totalBudget),
        per_head: herd.head_count > 0 ? Math.round(totalBudget / herd.head_count) : 0,
      },
      stages: stages.map((s) => ({
        id: s.id,
        order: s.stage_order,
        name: HERD_STAGE_LABEL[s.stage_key] ?? s.stage_key,
        completed: s.completed,
        planned_start: s.planned_start,
        planned_end: s.planned_end,
        days: days(s.planned_start, s.planned_end),
        feed_kg: s.planned_feed_kg === null ? null : Math.round(Number(s.planned_feed_kg)),
        budget: Number(s.budget ?? 0),
        feed_share: totalFeed > 0 && s.planned_feed_kg != null ? Math.round((Number(s.planned_feed_kg) / totalFeed) * 100) : null,
        // The next open stage is the only one that can be closed, as on the website.
        can_complete: nextOpen?.id === s.id,
      })),
      readiness: readiness.exportable
        ? {
            destination,
            destinations: EXPORT_DESTINATIONS.map((d) => ({ key: d, label: DESTINATION_NAME[d][locale] })),
            verdict: verdict.met
              ? tr(locale, "مستوفٍ لقائمة التحضير فيما يسجّله القطيع. والقرار للمحجر وبلد الوصول.", "Meets the preparation checklist as far as the herd's record goes. The quarantine and the destination decide.")
              : tr(locale, `ينقص سجلَّ القطيع ${verdict.missing} وفي ${verdict.warn} تنبيه — راجعها قبل البيع للمصدّر.`, `The herd record lacks ${verdict.missing} and has ${verdict.warn} warnings — review them before selling to the exporter.`),
            met: verdict.met,
            lines: readiness.checklist.map((l) => ({
              id: l.id,
              status: l.status,
              title: l[locale],
              detail: l.detailAr,
              source: l.source.label,
              source_url: l.source.url,
              source_meta: [
                SOURCE_KIND_LABEL[l.source.kind][locale],
                l.source.date !== "undated" ? l.source.date : tr(locale, "بلا تاريخ", "Undated"),
                !l.source.current && tr(locale, "قديم، تحقّق منه", "Old, check it"),
              ]
                .filter(Boolean)
                .join(" · "),
            })),
            tags: {
              present: counts.present,
              others: (["sold", "dead", "exported"] as const)
                .filter((s) => counts[s] > 0)
                .map((s) => `${TAG_STATUS_LABEL[s][locale]}: ${counts[s]}`),
              sample: readiness.tags
                .filter((x) => x.status === "present")
                .map((x) => x.tag)
                .slice(0, 12),
            },
            records: readiness.records.map((r) => ({
              id: r.id,
              kind: KIND_LABEL[r.kind]?.[locale] ?? r.kind,
              item: healthItemName(r.item_key, false),
              done_on: r.done_on,
              heads: r.heads,
              result: r.result === "negative" ? tr(locale, "سلبيّ", "negative") : r.result === "positive" ? tr(locale, "إيجابيّ", "Positive") : null,
              vet: r.vet_name,
              withdrawn: r.withdrawn_at !== null,
            })),
            items: HEALTH_ITEMS.map((i) => ({ choice: `${i.kind}:${i.key}`, kind: i.kind, label: i[locale] })),
            note: tr(locale, "هذه قائمة تحضير، لا شهادة: لا تقول إنّ الحيوان سليم ولا إنّه مقبول. الفحص والشهادة للمحجر البيطريّ، والقبول لبلد الوصول عند ميناءه — ويرفض الإرساليّة كلّها إن وجد مرضاً في رأسٍ واحد.", "This is a preparation checklist, not a certificate: it does not say an animal is healthy or will be accepted. Inspection and the certificate are the veterinary quarantine's; acceptance is the destination's, at its port — and it rejects a whole consignment for disease in one head."),
          }
        : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * The owner's steps on a cycle, each through the website's own step (src/lib/herdSteps.ts):
 *
 *   {action: "complete_stage", stage_id}
 *   {action: "budget", budget_per_head}
 *   {action: "health", choice, done_on, heads, result?, product?, batch?, vet_name?, note?}
 *   {action: "tags", prefix?, from, to?}
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const locale = appLocale(req);
  const NOT_YOURS = notYours(locale);
  const { supabase, user } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const text = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const { data: mine } = await supabase.from("herds").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!mine) return NextResponse.json(NOT_YOURS, { status: 404 });

  let error: string | null;
  let done: string;
  switch (body.action) {
    case "complete_stage": {
      // The stage must be one of this herd's: the database's own order check then decides.
      const { data: stage } = await supabase.from("herd_stages").select("id").eq("id", text("stage_id")).eq("herd_id", id).maybeSingle();
      error = stage ? await completeHerdStageStep(supabase, stage.id as string, locale) : tr(locale, "المرحلة ليست من هذه الدورة.", "The stage is not part of this cycle.");
      done = tr(locale, "اعتُمدت المرحلة.", "The stage was signed off.");
      break;
    }
    case "budget":
      error = await setHerdBudgetStep(supabase, id, Number(body.budget_per_head), locale);
      done = tr(locale, "حُدّثت الميزانية وقُسّمت على المراحل بنسبة العلف.", "The budget was updated and split across the stages in proportion to feed.");
      break;
    case "health":
      error = await addHerdHealthRecord(
        supabase,
        {
          herdId: id,
          choice: text("choice"),
          doneOn: text("done_on"),
          heads: Number(body.heads),
          result: text("result"),
          product: text("product"),
          batch: text("batch"),
          vet: text("vet_name"),
          note: text("note"),
        },
        locale,
      );
      done = tr(locale, "سُجّل في سجلّ صحّة القطيع.", "Recorded in the herd's health record.");
      break;
    case "tags":
      error = await addHerdTagRange(
        supabase,
        {
          herdId: id,
          prefix: text("prefix"),
          from: Number(body.from),
          to: body.to === undefined || body.to === null || body.to === "" ? null : Number(body.to),
        },
        locale,
      );
      done = tr(locale, "أُضيفت أرقام الآذان.", "The ear tags were added.");
      break;
    default:
      return NextResponse.json({ error: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") }, { status: 400 });
  }

  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true, message: done });
}
