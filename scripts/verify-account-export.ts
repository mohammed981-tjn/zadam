/**
 * «نزّل بياناتي» يحمل كلّ صفٍّ للحساب، لا أوّل ١٠٠٠ (البند ١٩٨ ج١١). القاعدة هنا مزيّفة تطبّق حدّ الـAPI نفسه (١٠٠٠
 * صفّ للطلب مهما طُلب)، فقراءةٌ تكتفي بطلبٍ واحد تسقط، وجدولٌ تعذّرت قراءته يوقف الملفّ بدل أن يصل ناقصاً.
 *
 *   npx tsx scripts/verify-account-export.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAccountFile, readAll } from "../src/lib/accountExport";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, broken: string[] = []) {
  const query = (table: string) => {
    let out = tables[table] ?? [];
    const orders: string[] = [];
    let lo = 0;
    let hi = Infinity;
    let single = false;
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), b),
      in: (c: string, vs: unknown[]) => {
        const set = new Set(vs);
        out = out.filter((r) => set.has(r[c]));
        return b;
      },
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => p.split(".eq."));
        out = out.filter((r) => parts.some(([c, v]) => r[c] === v));
        return b;
      },
      order: (c: string) => (orders.push(c), b),
      range: (a: number, z: number) => ((lo = a), (hi = z), b),
      maybeSingle: () => ((single = true), b),
      then: (res: (v: unknown) => unknown) => {
        if (broken.includes(table)) return Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
        const sorted = [...out].sort((x, y) => {
          for (const c of orders) {
            if (String(x[c]) < String(y[c])) return -1;
            if (String(x[c]) > String(y[c])) return 1;
          }
          return 0;
        });
        const rows = sorted.slice(lo, Math.min(hi + 1, lo + MAX_ROWS));
        return Promise.resolve(single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }).then(res);
      },
    };
    return b;
  };
  // An RPC answers with the row a table of its name holds for the caller, or null.
  const rpc = (name: string) =>
    Promise.resolve(
      broken.includes(name) ? { data: null, error: { message: "boom" } } : { data: tables[name]?.[0] ?? null, error: null },
    );
  return { from: (t: string) => query(t), rpc } as unknown as SupabaseClient;
}

const ME = "user-me";
const OTHER = "user-other";
const many = (n: number, f: (i: number) => Row) => Array.from({ length: n }, (_, i) => f(i));
const id = (p: string, i: number) => `${p}-${String(i).padStart(6, "0")}`;

async function main() {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: ME, full_name: "أنا", phone: "0912", country: "SD", created_at: "2026-01-01" }],
    ledger_books: [{ id: "book-1", owner_id: ME }, { id: "book-x", owner_id: OTHER }],
    journal_entries: many(2500, (i) => ({ id: id("e", i), book_id: "book-1" })).concat([{ id: "e-x", book_id: "book-x" }]),
    journal_lines: many(5003, (i) => ({ id: id("l", i), book_id: "book-1" })).concat([{ id: "l-x", book_id: "book-x" }]),
    ledger_accounts: many(80, (i) => ({ id: id("a", i), book_id: "book-1" })),
    seasons: many(3, (i) => ({ id: id("s", i), owner_id: ME })),
    ledger_entries: many(1200, (i) => ({ id: id("le", i), season_id: id("s", i % 3) })),
    lands: many(1001, (i) => ({ id: id("land", i), owner_id: ME })),
    ledger_links: many(1500, (i) => ({ id: id("k", i), proposer_owner: i % 2 ? ME : OTHER, counter_owner: i % 2 ? OTHER : ME })),
    partnership_agreements: many(2, (i) => ({ id: id("g", i), owner_id: ME, investor_id: OTHER })),
    partnership_signatures: many(2, (i) => ({ id: id("sig", i), signer_id: ME })),
    investments: many(1000, (i) => ({ id: id("inv", i), investor_id: ME })),
    agent_mandates: [{ id: "m-1", farmer_id: ME }, { id: "m-x", farmer_id: OTHER }],
    agent_actions: many(1001, (i) => ({ id: id("act", i), farmer_id: ME })).concat([{ id: "act-x", farmer_id: OTHER }]),
  };

  console.log("\nأ) ما زاد على ١٠٠٠ صفّ يصل كلّه");
  const f = await buildAccountFile(fakeDb(tables), { id: ME, email: "me@x" });
  ok(f.ledger.entries.length === 2500, "القيود: ٢٬٥٠٠");
  ok(f.ledger.lines.length === 5003, "وسطورها: ٥٬٠٠٣");
  ok(f.lands.length === 1001, "والأراضي: ١٬٠٠١ (صفٌّ بعد الألف)");
  ok(f.ledger.links.length === 1500, "والقيود المتقابلة من الطرفين: ١٬٥٠٠");
  ok(f.investments.length === 1000, "والاستثمارات: ألفٌ بالتمام (صفحةٌ ممتلئة ثمّ فارغة)");
  ok(f.season_entries.length === 1200 && f.seasons.length === 3, "ودفتر المواسم: ١٬٢٠٠ سطر في ثلاثة مواسم");
  ok(new Set((f.ledger.lines as Row[]).map((r) => r.id)).size === 5003, "بلا تكرار");
  ok(!(f.ledger.lines as Row[]).some((r) => r.book_id === "book-x"), "ولا شيء من دفتر غيره");
  ok(f.account.full_name === "أنا" && f.account.email === "me@x", "وبيانات الحساب");
  ok(f.agents.mandates.length === 1 && f.agents.actions.length === 1001, "وأذونات الوكلاء وسجلّ ما كتبوه باسمه، كلّه وله وحده");

  ok(f.managed_registration === null, "ومن فتح حسابه بنفسه: لا سجلّ تسجيلٍ من جمعيّة");
  const managed = await buildAccountFile(
    fakeDb({ ...tables, managed_farmer_mine: [{ full_name: "حاج أحمد", national_id: "1990-12345", registered_by: "جمعيّة" }] }),
    { id: ME },
  );
  ok(managed.managed_registration?.national_id === "1990-12345", "والمزارع الذي سجّلته جمعيّته يجد سجلّ تسجيله (البند ١٦٩)");

  console.log("\nب) جدولٌ تعذّرت قراءته يوقف الملفّ");
  let threw = false;
  try {
    await buildAccountFile(fakeDb(tables, ["journal_lines"]), { id: ME });
  } catch (e) {
    threw = e instanceof Error && e.message.includes("journal_lines");
  }
  ok(threw, "لا ملفّ ناقصٌ بصمت: يتوقّف ويقول أيّ جدول");
  let rpcThrew = false;
  try {
    await buildAccountFile(fakeDb(tables, ["managed_farmer_mine"]), { id: ME });
  } catch (e) {
    rpcThrew = e instanceof Error && e.message.includes("managed_farmer_mine");
  }
  ok(rpcThrew, "ولا يُسقط سجلَّ التسجيل بصمت إن تعذّرت قراءته");

  console.log("\nج) readAll وحده");
  const rows = await readAll<Row>("t", (a, z) => fakeDb({ t: many(3000, (i) => ({ id: id("t", i) })) }).from("t").select("*").order("id").range(a, z));
  ok(rows.length === 3000, "٣٬٠٠٠ صفّ في ثلاث صفحات");

  if (failed > 0) {
    console.error(`\n${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("\nOK");
}

main();
