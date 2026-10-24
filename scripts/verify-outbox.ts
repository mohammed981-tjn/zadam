/**
 * صندوقُ الصادر (البند ١٦٧): ما يُحفظ وما لا يُحفظ، ولمن، ولكم من الوقت.
 *
 *   npx tsx scripts/verify-outbox.ts
 */
import {
  DUPLICATE_WINDOW_MS,
  MAX_AGE_MS,
  MAX_ITEMS,
  MAX_VALUE_CHARS,
  OUTBOX_STORAGE_KEY,
  enqueue,
  isNetworkError,
  load,
  localDay,
  newItemId,
  pendingFor,
  remove,
  snapshotFields,
  toFormData,
  type OutboxItem,
  type StorageLike,
} from "../src/lib/outbox";
import { ledgerEntryDate } from "../src/lib/entryDate";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: "i1", key: "ledger:s1", path: "/seasons/s1", label: "قيد", userId: "u1", createdAt: NOW,
  fields: [["season_id", "s1"], ["amount", "500"]], ...over,
});

console.log("What counts as the network being down");
eq(isNetworkError(new TypeError("Failed to fetch")), true, "Chrome: Failed to fetch");
eq(isNetworkError(new TypeError("NetworkError when attempting to fetch resource.")), true, "Firefox");
eq(isNetworkError(new TypeError("Load failed")), true, "Safari");
eq(isNetworkError(new Error("An error occurred in the Server Components render.")), false, "a server error is not an outage");
eq(isNetworkError(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.')), false, "a stale deployment is not an outage");
eq(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')")), false, "a bug in the code is not an outage");
eq(isNetworkError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/lands;307;" })), false, "a redirect is an answer");
eq(isNetworkError(null), false, "nothing is not an outage");

console.log("\nWhat is taken from a form");
eq(snapshotFields([["a", "1"], ["b", "نص"]]), [["a", "1"], ["b", "نص"]], "text fields, in order");
eq(snapshotFields([["a", "1"], ["password", "hunter2"], ["new_password", "x"]]), [["a", "1"]], "a password is never kept");
eq(snapshotFields([["a", "1"], ["$ACTION_ID_abc", ""]]), [["a", "1"]], "Next's own markers are left out");
eq(snapshotFields([["a", "1"], ["photo", { size: 0, name: "" }]]), [["a", "1"]], "an empty file input is no file");
eq(snapshotFields([["a", "1"], ["photo", { size: 2048, name: "x.jpg" }]]), null, "a real file means the form cannot be kept");
eq(snapshotFields([["note", "x".repeat(MAX_VALUE_CHARS + 1)]]), null, "a value too long to be typed is refused");
eq(snapshotFields([["note", "x".repeat(MAX_VALUE_CHARS)]])?.length, 1, "and one at the limit is kept");

console.log("\nKeeping and reading");
const s = memory();
eq(enqueue(s, item(), NOW), "kept", "an item is kept");
eq(load(s, NOW).length, 1, "and read back");
eq(enqueue(s, item({ id: "i2" }), NOW + 5_000), "duplicate", "the same form a moment later is a double tap");
eq(enqueue(s, item({ id: "i3", fields: [["season_id", "s1"], ["amount", "600"]] }), NOW + 5_000), "kept", "a different amount is another entry");
eq(enqueue(s, item({ id: "i4" }), NOW + DUPLICATE_WINDOW_MS + 1), "kept", "the same entry a minute later is allowed (two real purchases)");
eq(load(s, NOW).length, 3, "three kept");
remove(s, "i3", NOW);
eq(load(s, NOW).map((i) => i.id), ["i1", "i4"], "one removed");
remove(s, "i1", NOW);
remove(s, "i4", NOW);
eq(s.data.has(OUTBOX_STORAGE_KEY), false, "an empty box leaves nothing in storage");

console.log("\nWhose it is");
const all = [item({ id: "a", userId: "u1" }), item({ id: "b", userId: "u2" }), item({ id: "c", userId: "u1", key: "land-test:l1" })];
eq(pendingFor(all, "u1").map((i) => i.id), ["a", "c"], "an account is offered its own items");
eq(pendingFor(all, "u2").map((i) => i.id), ["b"], "and another account only its own");
eq(pendingFor(all, "u1", "land-test:l1").map((i) => i.id), ["c"], "of one form when asked");
eq(pendingFor(all, null), [], "nobody signed in, nothing offered");

console.log("\nHow long, and how many");
const old = memory();
old.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([item({ id: "old", createdAt: NOW - MAX_AGE_MS - 1 }), item({ id: "fresh", createdAt: NOW - MAX_AGE_MS + 60_000 })]));
eq(load(old, NOW).map((i) => i.id), ["fresh"], "an item past seven days is gone");
const future = memory();
future.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([item({ id: "f", createdAt: NOW + 3_600_000 })]));
eq(load(future, NOW), [], "an item dated in the future (a wrong clock) is not trusted");
const full = memory();
for (let i = 0; i < MAX_ITEMS; i++) enqueue(full, item({ id: `x${i}`, fields: [["n", String(i)]] }), NOW);
eq(load(full, NOW).length, MAX_ITEMS, "twenty are kept");
eq(enqueue(full, item({ id: "x-over", fields: [["n", "over"]] }), NOW), "full", "the twenty-first is refused, not silently dropped");

console.log("\nBad storage never breaks the page");
const broken: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } };
eq(load(broken, NOW), [], "an unreadable store is an empty box");
eq(enqueue(broken, item(), NOW), "unavailable", "an unwritable store says so");
const junk = memory();
junk.setItem(OUTBOX_STORAGE_KEY, "{not json");
eq(load(junk, NOW), [], "corrupt JSON is an empty box");
junk.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([{ id: 1 }, item({ id: "ok" }), item({ id: "evil", path: "//evil.example/x" }), item({ id: "evil2", path: "https://evil.example" })]));
eq(load(junk, NOW).map((i) => i.id), ["ok"], "malformed items and off-site paths are dropped");

console.log("\nReplaying");
const fd = toFormData(item({ fields: [["a", "1"], ["a", "2"], ["b", "x"]] }));
eq([...fd.entries()], [["a", "1"], ["a", "2"], ["b", "x"]], "the form is rebuilt field by field, repeats kept");
eq(newItemId(NOW, () => 0.5) === newItemId(NOW, () => 0.5), true, "ids come from the clock and a random");
eq(localDay(new Date(2026, 9, 24, 23, 30).getTime()), "2026-10-24", "the day is the phone's own");

console.log("\nThe day a late cost keeps (ledger entry date)");
eq(ledgerEntryDate("2026-10-21", "2026-10-24"), "2026-10-21", "three days ago is accepted");
eq(ledgerEntryDate("2026-10-24", "2026-10-24"), "2026-10-24", "today is accepted");
eq(ledgerEntryDate("2026-10-25", "2026-10-24"), "2026-10-25", "tomorrow is accepted (the phone's day may be ahead)");
eq(ledgerEntryDate("2026-10-26", "2026-10-24"), null, "two days ahead is not");
eq(ledgerEntryDate("2026-10-10", "2026-10-24"), "2026-10-10", "two weeks back is accepted");
eq(ledgerEntryDate("2026-10-09", "2026-10-24"), null, "more than two weeks back is not");
eq(ledgerEntryDate("2026-02-31", "2026-10-24"), null, "a day that does not exist is not");
eq(ledgerEntryDate("21/10/2026", "2026-10-24"), null, "another format is not");
eq(ledgerEntryDate("", "2026-10-24"), null, "nothing is not (the entry gets today)");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
