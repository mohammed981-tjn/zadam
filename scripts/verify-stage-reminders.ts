/**
 * «حان موعد المرحلة»: يُذكَّر صاحب الموسم أو القطيع قبل الموعد بثلاثة أيّام، ومرّةً
 * واحدة لكلّ مرحلة، والمرحلة الأولى المفتوحة وحدها، ولا تذكير بعد شهرٍ من التأخّر.
 */
import { OVERDUE_GRACE_DAYS, REMIND_DAYS_BEFORE, nextOpenStage, stageKey, stageReminders, type PlannedCycle } from "../src/lib/stageReminders";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const today = "2026-10-21";
const A = "a1000000-0000-0000-0000-0000000000a1";
const season = (stages: [string, string | null, boolean][]): PlannedCycle => ({
  id: "s1",
  ownerId: A,
  name: "ذرة الخريف",
  kind: "season",
  stages: stages.map(([key, start, completed], i) => ({ id: `${key}-id`, key, order: i + 1, plannedStart: start, completed })),
});

ok(REMIND_DAYS_BEFORE === 3 && OVERDUE_GRACE_DAYS === 30, "three days before, and up to thirty days late");

let r = stageReminders([season([["land_prep", "2026-10-01", true], ["planting", "2026-10-23", false], ["establishment", "2026-11-05", false]])], new Set(), today);
ok(r.length === 1 && r[0].kind === "stage_due" && r[0].keys[0] === stageKey("planting-id", false), "planting in two days: one reminder, keyed on the stage");
ok(r[0].title.includes("بعد 2 أيام") && r[0].title.includes("«الزراعة»") && r[0].title.includes("«ذرة الخريف»"), "the title says when, which stage and which season");
ok(r[0].body.includes("شراء البذور المعتمدة") && r[0].link === "/seasons/s1", "the body lists the stage's tasks and links to the season");

r = stageReminders([season([["land_prep", "2026-10-01", true], ["planting", "2026-10-21", false]])], new Set(), today);
ok(r[0].title.startsWith("اليوم موعد"), "due today: «اليوم موعد»");

r = stageReminders([season([["land_prep", "2026-10-01", true], ["planting", "2026-10-28", false]])], new Set(), today);
ok(r.length === 0, "seven days away: nothing yet");

r = stageReminders([season([["land_prep", "2026-10-01", false], ["planting", "2026-10-22", false]])], new Set(), today);
ok(r.length === 1 && r[0].keys[0] === stageKey("land_prep-id", true) && r[0].title.includes("تأخّرت 20"), "the first open stage only: land prep, 20 days overdue, not the planting behind it");

r = stageReminders([season([["land_prep", "2026-08-01", false]])], new Set(), today);
ok(r.length === 0, "81 days overdue: past the grace period, no reminder");

const sentBoth = new Set([`${A}|${stageKey("planting-id", false)}`]);
r = stageReminders([season([["planting", "2026-10-22", false]])], sentBoth, today);
ok(r.length === 0, "already reminded: nothing more before the date");
r = stageReminders([season([["planting", "2026-10-19", false]])], sentBoth, today);
ok(r.length === 1 && r[0].keys[0] === stageKey("planting-id", true) && r[0].title.includes("تأخّرت 2"), "but once overdue, one more, under its own key");

const herd: PlannedCycle = {
  id: "h1", ownerId: A, name: "ضأن", kind: "herd",
  stages: [{ id: "q", key: "quarantine", order: 1, plannedStart: "2026-10-23", completed: false }],
};
r = stageReminders([herd], new Set(), today);
ok(r.length === 1 && r[0].title.includes("«الحجر الصحي»") && r[0].title.includes("قطيع") && r[0].link === "/herds/h1" && !r[0].body.includes("ما يُعمل"), "a herd stage: the herd's own label, its link, and no crop task list");

ok(stageReminders([season([["planting", null, false]])], new Set(), today).length === 0, "a stage without a planned date is skipped");
ok(nextOpenStage([{ id: "b", key: "x", order: 2, plannedStart: null, completed: false }, { id: "a", key: "y", order: 1, plannedStart: null, completed: true }])?.id === "b", "the next open stage follows plan order, not array order");
ok(stageReminders([season([["harvest", "2026-10-01", true]])], new Set(), today).length === 0, "all stages done: nothing");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\nstage reminders: all checks passed");
