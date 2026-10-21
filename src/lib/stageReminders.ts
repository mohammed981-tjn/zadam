import { STAGE_TEMPLATES, type StageKey } from "@/lib/season";
import { HERD_STAGE_LABEL } from "@/lib/livestock";
import { daysBetween } from "@/lib/herdHealth";
import type { FieldAlert } from "@/lib/fieldAlerts";
import type { HerdStageKey } from "@/types/database";

/**
 * «حان موعد المرحلة» (البند ١١٩) — a reminder when a season's or a herd's next
 * stage is due, written to the owner's notifications by the daily job.
 *
 * The plan is already in the database: every season and herd has its stages
 * with planned dates, and the farmer signs each one off. What was missing is
 * the nudge: nothing told them the planting window opens on Thursday unless
 * they opened the page. Reminder calls and messages are the one feature
 * every evaluated advisory service in Africa and India shares (the sources
 * are in docs/studies/what-sudagri-lacks-ar.md).
 *
 * One reminder per stage, keyed on the stage id, so it never repeats; it goes
 * REMIND_DAYS_BEFORE days before the planned start and, if the stage is still
 * open after its planned start, once more as overdue (a second key). Only
 * the first open stage of a running cycle is considered: the one the farmer
 * can act on.
 */

export const REMIND_DAYS_BEFORE = 3;
/** Past this many days after the planned start, a reminder is noise, not help. */
export const OVERDUE_GRACE_DAYS = 30;

export interface PlannedStage {
  id: string;
  key: string;
  order: number;
  plannedStart: string | null;
  completed: boolean;
}

export interface PlannedCycle {
  id: string;
  ownerId: string;
  name: string;
  kind: "season" | "herd";
  stages: PlannedStage[];
}

export const stageKey = (stageId: string, overdue: boolean) => `stage:${stageId}${overdue ? ":overdue" : ""}`;

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${AR_MONTHS[m - 1]} ${y}`;
};

function stageName(kind: PlannedCycle["kind"], key: string): string {
  if (kind === "season") return STAGE_TEMPLATES[key as StageKey]?.name ?? key;
  return HERD_STAGE_LABEL[key as HerdStageKey] ?? key;
}

function activities(kind: PlannedCycle["kind"], key: string): string[] {
  return kind === "season" ? (STAGE_TEMPLATES[key as StageKey]?.activities ?? []) : [];
}

/** The first open stage, in plan order — the one that can be acted on. */
export function nextOpenStage(stages: PlannedStage[]): PlannedStage | null {
  return [...stages].sort((a, b) => a.order - b.order).find((s) => !s.completed) ?? null;
}

export function stageReminders(cycles: PlannedCycle[], sent: Set<string>, today: string): FieldAlert[] {
  const out: FieldAlert[] = [];
  for (const c of cycles) {
    const s = nextOpenStage(c.stages);
    if (!s || !s.plannedStart) continue;
    const until = daysBetween(today, s.plannedStart);
    const name = stageName(c.kind, s.key);
    const link = c.kind === "season" ? `/seasons/${c.id}` : `/herds/${c.id}`;
    const what = c.kind === "season" ? "موسم" : "قطيع";
    const todo = activities(c.kind, s.key);
    const todoLine = todo.length ? ` ما يُعمل فيها: ${todo.join("، ")}.` : "";

    if (until > REMIND_DAYS_BEFORE) continue;

    if (until >= 0) {
      const key = stageKey(s.id, false);
      if (sent.has(`${c.ownerId}|${key}`)) continue;
      out.push({
        recipient: c.ownerId,
        kind: "stage_due",
        keys: [key],
        title: until === 0 ? `اليوم موعد مرحلة «${name}» في ${what} «${c.name}»` : `بعد ${until} ${until === 1 ? "يوم" : "أيام"}: مرحلة «${name}» في ${what} «${c.name}»`,
        body: `موعدها المخطّط ${day(s.plannedStart)}.${todoLine} وحين تنتهي اعتمدها في صفحة ال${what} لتنتقل إلى ما بعدها.`,
        link,
      });
      continue;
    }

    const late = -until;
    if (late > OVERDUE_GRACE_DAYS) continue;
    const key = stageKey(s.id, true);
    if (sent.has(`${c.ownerId}|${key}`)) continue;
    out.push({
      recipient: c.ownerId,
      kind: "stage_due",
      keys: [key],
      title: `مرحلة «${name}» في ${what} «${c.name}» تأخّرت ${late} ${late === 1 ? "يوماً" : "يوماً"} عن موعدها`,
      body: `كان موعدها ${day(s.plannedStart)}.${todoLine} إن كنت أنجزتها فاعتمدها في صفحة ال${what}، وإن تغيّر الموعد فلا بأس — هذا تذكيرٌ لا أكثر.`,
      link,
    });
  }
  return out;
}
