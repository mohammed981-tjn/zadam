/**
 * مسكُ الدفاتر اليوميّ (البندان ١٨٧ و١٩١): يُنادي الدوالّ الثلاث، ولا يرمي أبداً.
 *
 *   npx tsx scripts/verify-bookkeeping.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBookkeeping } from "../src/lib/bookkeeping";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

type Reply = { data?: unknown; error?: unknown } | "throw";
const fake = (replies: Record<string, Reply>) => {
  const called: string[] = [];
  const client = {
    rpc: async (name: string) => {
      called.push(name);
      const r = replies[name];
      if (r === "throw") throw new Error("network");
      return { data: r?.data ?? null, error: r?.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { client, called };
};

async function main() {
  console.log("\nأ) يسير كلُّ شيءٍ على ما يرام");
  {
    const { client, called } = fake({
      farm_book_sync: { data: 2 },
      farm_book_reconcile: { data: [] },
      oversight_snapshot: { data: 4 },
    });
    eq(await runBookkeeping(client), { synced: 2, mismatched: 0, snapshot: 4 }, "الأعداد الثلاثة");
    eq(called, ["farm_book_sync", "farm_book_reconcile", "oversight_snapshot"], "بهذا الترتيب: الترحيل ثم المطابقة ثم الإحصاء");
  }

  console.log("\nب) فرقٌ بين الدفترين يُعدّ ويُسجَّل");
  {
    const logged: unknown[][] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void logged.push(a);
    const { client } = fake({
      farm_book_sync: { data: 0 },
      farm_book_reconcile: { data: [{ season_id: "s1" }, { season_id: "s2" }] },
      oversight_snapshot: { data: 0 },
    });
    const run = await runBookkeeping(client);
    console.error = orig;
    eq(run.mismatched, 2, "موسمان مختلفان");
    eq(logged.length, 1, "ويُسجَّل الفرق في السجلّ مرّةً");
  }

  console.log("\nج) خطوةٌ تفشل لا توقف التي بعدها، ولا شيء يرمي");
  {
    const orig = console.error;
    console.error = () => {};
    const a = fake({ farm_book_sync: "throw", farm_book_reconcile: { data: [] }, oversight_snapshot: { data: 3 } });
    const ra = await runBookkeeping(a.client);
    const b = fake({ farm_book_sync: { error: { message: "denied" } }, farm_book_reconcile: "throw", oversight_snapshot: { error: { message: "x" } } });
    const rb = await runBookkeeping(b.client);
    const c = fake({ farm_book_sync: { data: "not a number" }, farm_book_reconcile: { data: "not rows" }, oversight_snapshot: { data: null } });
    const rc = await runBookkeeping(c.client);
    console.error = orig;
    eq(ra, { synced: null, mismatched: 0, snapshot: 3 }, "رمى الترحيل: تعمل المطابقة والإحصاء");
    eq(a.called.length, 3, "والثلاث نُوديت");
    eq(rb, { synced: null, mismatched: null, snapshot: null }, "وكلّها فشلت: أصفارٌ فارغة لا استثناء");
    eq(rc, { synced: null, mismatched: null, snapshot: null }, "وردودٌ غريبة لا تُعدّ أعداداً");
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("OK");
}

main();
