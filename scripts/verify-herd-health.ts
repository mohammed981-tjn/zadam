/**
 * سجلّ صحّة القطيع: القيد المسحوب لا يُحسب، والأحدث يغلب، والاختيار من القائمة وحدها.
 */
import { HEALTH_ITEMS, daysBetween, healthItemName, latestByItem, parseHealthChoice, tagCounts, type HealthRecord } from "../src/lib/herdHealth";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const rec = (id: string, item: string, done: string, withdrawn = false, created = "2026-10-01T00:00:00Z"): HealthRecord => ({
  id, kind: "vaccination", item_key: item, done_on: done, heads: 10, result: null, product: null, batch: null,
  vet_name: null, note: null, withdrawn_at: withdrawn ? "2026-10-02T00:00:00Z" : null, withdrawn_note: withdrawn ? "خطأ" : null, created_at: created,
});

const latest = latestByItem([
  rec("a", "ppr", "2026-06-01"),
  rec("b", "ppr", "2026-09-01"),
  rec("c", "ppr", "2026-10-01", true),
  rec("d", "rvf", "2026-08-01", true),
]);
ok(latest.get("ppr")?.id === "b", "the newest standing record wins; a withdrawn one never counts, however recent");
ok(!latest.has("rvf"), "an item whose only record was withdrawn has no record");
ok(latestByItem([rec("x", "fmd", "2026-09-01", false, "2026-09-01T08:00:00Z"), rec("y", "fmd", "2026-09-01", false, "2026-09-01T09:00:00Z")]).get("fmd")?.id === "y",
  "same day: the later entry wins");

ok(parseHealthChoice("vaccination:ppr")?.key === "ppr", "a choice from the list is read");
ok(parseHealthChoice("test:ppr") === null, "a key under the wrong kind is refused");
ok(parseHealthChoice("vaccination:made_up") === null && parseHealthChoice("") === null, "a key not in the list is refused");

ok(new Set(HEALTH_ITEMS.map((i) => i.key)).size === HEALTH_ITEMS.length, "keys are unique");
ok(HEALTH_ITEMS.every((i) => /^[a-z_]{2,40}$/.test(i.key)), "every key fits the column's rule");
ok(healthItemName("old_key", false) === "old_key", "a key the list no longer knows keeps its own spelling");

const c = tagCounts([
  { tag: "SD-1", status: "present", added_on: "2026-10-01" },
  { tag: "SD-2", status: "dead", added_on: "2026-10-01" },
  { tag: "SD-3", status: "present", added_on: "2026-10-01" },
]);
ok(c.present === 2 && c.dead === 1 && c.sold === 0, "tags are counted by status");
ok(daysBetween("2026-10-01", "2026-10-21") === 20 && daysBetween("2026-03-01", "2026-02-28") === -1, "days between two dates");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\nherd health: all checks passed");
