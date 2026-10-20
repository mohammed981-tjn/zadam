/**
 * قائمة تحضير الماشية للتصدير: كلّ سطرٍ بمصدره، والسجلّ يجيب حيث يستطيع،
 * ولا كلمةَ «جاهز للتصدير» ولا «سليم».
 */
import type { HealthRecord, HerdTag } from "../src/lib/herdHealth";
import { addMonths, buildChecklist, checklistVerdict, type ChecklistInput } from "../src/lib/livestockExportChecklist";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const today = "2026-10-20";
const rec = (kind: HealthRecord["kind"], item: string, done: string, heads = 50, product: string | null = null, withdrawn = false): HealthRecord => ({
  id: `${item}-${done}`, kind, item_key: item, done_on: done, heads, result: null, product, batch: null, vet_name: null, note: null,
  withdrawn_at: withdrawn ? "2026-10-10T00:00:00Z" : null, withdrawn_note: withdrawn ? "خطأ" : null, created_at: `${done}T08:00:00Z`,
});
const tags = (n: number): HerdTag[] => Array.from({ length: n }, (_, i) => ({ tag: `SD-${i + 1}`, status: "present", added_on: today }));
const base = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  species: "sheep", headCount: 50, records: [], tags: [], stateDiseases: null, today, ...over,
});
const line = (lines: ReturnType<typeof buildChecklist>, id: string) => lines.find((l) => l.id === id)!;

// ── السعوديّة ──
let L = buildChecklist("sa", base());
ok(["females", "state_certificate", "exporter", "tags", "rvf", "ppr", "sheep_goat_pox", "spray", "region", "quarantine", "weight"].every((id) => L.some((l) => l.id === id)),
  "sheep to Saudi Arabia: Sudan's three rules and the Saudi lines are all there");
ok(L.every((l) => l.source.url.startsWith("https://") && l.source.label.length > 0 && l.source.date.length > 0), "every line carries a source link, a name and a date");
ok(line(L, "tags").status === "missing" && line(L, "rvf").status === "missing" && line(L, "spray").status === "missing", "an empty record: tags, RVF and spraying are missing");
ok(!checklistVerdict(L).met, "and the verdict is not met");

L = buildChecklist("sa", base({
  tags: tags(50),
  records: [
    rec("vaccination", "rvf", "2026-10-01", 50, "Smith Burn (Onderstepoort)"),
    rec("vaccination", "ppr", "2026-09-20"),
    rec("vaccination", "sheep_goat_pox", "2026-09-25"),
    rec("treatment", "external_parasites", "2026-10-05"),
  ],
  stateDiseases: [],
}));
ok(checklistVerdict(L).met, "a complete record meets the preparation checklist");
ok(line(L, "region").status === "ok", "no event in the state: the region line passes");

L = buildChecklist("sa", base({ tags: tags(30), records: [rec("vaccination", "rvf", "2026-10-01", 50, "لقاح الوادي")] }));
ok(line(L, "tags").status === "warn" && line(L, "tags").detailAr.includes("30 من 50"), "30 of 50 tagged: a warning that says how many");
ok(line(L, "rvf").status === "warn" && line(L, "rvf").detailAr.includes("Smith Burn"), "an RVF entry without Smith Burn named: a warning that names it");

L = buildChecklist("sa", base({ records: [rec("vaccination", "rvf", "2026-10-01", 50, "Smith Burn", true)] }));
ok(line(L, "rvf").status === "missing", "a withdrawn RVF entry does not count");

L = buildChecklist("sa", base({ stateDiseases: ["طاعون المجترّات الصغيرة"] }));
ok(line(L, "region").status === "warn" && line(L, "region").detailAr.includes("طاعون المجترّات الصغيرة"), "a disease in the state: a warning naming it");

L = buildChecklist("sa", base({ species: "camel", headCount: 10 }));
ok(!L.some((l) => l.id === "ppr" || l.id === "sheep_goat_pox"), "camels: no small-ruminant vaccinations asked");
ok(line(L, "weight").ar.includes("200"), "camels: the 200 kg standard weight");

// ── مصر ──
L = buildChecklist("eg", base({ species: "cattle", headCount: 20 }));
ok(L.some((l) => l.id === "slaughter_only") && !L.some((l) => l.id === "rvf"), "cattle to Egypt: slaughter only, and no Saudi lines");
ok(line(L, "eg_vaccine_window").status === "missing", "no FMD/CBPP/anthrax vaccination: missing");
L = buildChecklist("eg", base({ species: "cattle", headCount: 20, records: [rec("vaccination", "fmd", "2026-09-01", 20)] }));
ok(line(L, "eg_vaccine_window").status === "ok", "vaccinated 49 days ago: inside 21 days to 3 months");
L = buildChecklist("eg", base({ species: "cattle", headCount: 20, records: [rec("vaccination", "fmd", "2026-10-10", 20)] }));
ok(line(L, "eg_vaccine_window").status === "warn", "vaccinated 10 days ago: too recent, a warning");
L = buildChecklist("eg", base({ species: "cattle", headCount: 20, records: [rec("vaccination", "anthrax", "2026-06-01", 20)] }));
ok(line(L, "eg_vaccine_window").status === "missing", "vaccinated in June: older than 3 months, missing");
L = buildChecklist("eg", base({ species: "camel", headCount: 10 }));
ok(L.some((l) => l.id === "eg_camels") && !L.some((l) => l.id === "eg_vaccine_window"), "camels to Egypt: the camel line, not the slaughter-cattle window");

// ── الكلمات ──
const all = [...buildChecklist("sa", base()), ...buildChecklist("eg", base({ species: "cattle" }))];
const text = all.map((l) => `${l.ar} ${l.detailAr}`).join(" ");
ok(!/جاهز للتصدير|سليمٌ|خالٍ من الأمراض|معتمد للتصدير/.test(text), "no line says ready for export, healthy, disease-free or approved");
ok(addMonths("2026-07-20", 3) === "2026-10-20" && addMonths("2026-01-31", 1) === "2026-03-03", "calendar months");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\nlivestock checklist: all checks passed");
