/**
 * مسكُ الدفاتر اليوميّ (البنود ١٨٧ و١٩١ و١٨٩ و١٩٠): يُنادي الدوالّ الخمس، ولا يرمي أبداً.
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
      agreement_memo_sync: { data: [{ posted: 2, skipped: 1, without_amount: 3 }] },
      ledger_depreciate_all: { data: 5 },
    });
    eq(
      await runBookkeeping(client),
      { synced: 2, mismatched: 0, snapshot: 4, agreements: { posted: 2, skipped: 1, withoutAmount: 3 }, depreciation: 5 },
      "الأعداد الخمسة",
    );
    eq(
      called,
      ["farm_book_sync", "farm_book_reconcile", "oversight_snapshot", "agreement_memo_sync", "ledger_depreciate_all"],
      "بهذا الترتيب: الترحيل ثم المطابقة ثم الإحصاء ثم العقود القائمة ثم الإهلاك",
    );
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
    eq(ra, { synced: null, mismatched: 0, snapshot: 3, agreements: null, depreciation: null }, "رمى الترحيل: تعمل المطابقة والإحصاء");
    eq(a.called.length, 5, "والخمس نُوديت");
    eq(rb, { synced: null, mismatched: null, snapshot: null, agreements: null, depreciation: null }, "وكلّها فشلت: أصفارٌ فارغة لا استثناء");
    eq(rc, { synced: null, mismatched: null, snapshot: null, agreements: null, depreciation: null }, "وردودٌ غريبة لا تُعدّ أعداداً");
    const d = fake({ agreement_memo_sync: "throw" });
    const e = fake({ agreement_memo_sync: { data: [{ posted: "x", skipped: 0, without_amount: 0 }] } });
    eq((await runBookkeeping(d.client)).agreements, null, "ورمى قيد العقود: لا شيء يرمي");
    eq((await runBookkeeping(e.client)).agreements, null, "وصفٌّ غريب منه لا يُعدّ");
    console.error = orig;
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("OK");
}

main();
