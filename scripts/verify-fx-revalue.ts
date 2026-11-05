/**
 * The pound items still on credit, valued at today's rate (backlog 190).
 *
 *   npx tsx scripts/verify-fx-revalue.ts
 */
import { readFileSync } from "node:fs";
import { revalueOpenPounds } from "../src/lib/fxRevalue";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// A cost of 1,000,000 pounds booked at 5,000 a dollar ($200); the pound has fallen to 10,000.
const cost = { pounds: 1_000_000, bookedUsd: 200, receivable: false };
const r1 = revalueOpenPounds([cost], 10_000)!;
ok(near(r1.payableToday, 100) && near(r1.difference, 100), "owing pounds when the pound falls: $200 booked is $100 today, $100 in the farmer's favour");

// A sale of 2,000,000 pounds booked at 5,000 ($400), still to be received.
const sale = { pounds: 2_000_000, bookedUsd: 400, receivable: true };
const r2 = revalueOpenPounds([sale], 10_000)!;
ok(near(r2.receivableToday, 200) && near(r2.difference, -200), "being owed pounds when the pound falls: $400 booked is $200 today, $200 against him");

const both = revalueOpenPounds([cost, sale], 10_000)!;
ok(both.items === 2 && near(both.difference, -100), "the two together: +100 and −200 make −100");

const firmer = revalueOpenPounds([cost], 4_000)!;
ok(near(firmer.difference, -50), "and the other way: a firmer pound makes a pound debt dearer ($250 for $200 booked)");

ok(revalueOpenPounds([cost], 0) === null && revalueOpenPounds([cost], Number.NaN) === null, "no rate, no valuation");
ok(revalueOpenPounds([], 10_000) === null, "nothing open in pounds, nothing shown");
ok(revalueOpenPounds([{ pounds: Number.NaN, bookedUsd: 1, receivable: false }, { pounds: 0, bookedUsd: 1, receivable: false }], 10_000) === null,
   "an unreadable or empty amount is not valued");

const page = readFileSync("src/app/seasons/[id]/page.tsx", "utf8");
ok(/!settledOn\.get\(l\.id\) && l\.currency === "SDG"/.test(page), "the season page values only what is unsettled and in pounds");
ok(!/from\("ledger_entries"\)\s*\.(insert|update)/.test(page), "and the page writes nothing in the ledger");

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
