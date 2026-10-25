/**
 * ملفّ اليوميّة يحمل الفترة كلّها، لا آخر ٢٥ قيداً (البند ١٩٨ ب١). القاعدة لا تعطي في الطلب الواحد أكثر من ١٠٠٠ صفّ
 * مهما طُلب، فالتصدير يقرأ صفحةً صفحة حتى النهاية — القيود وسطورها وكشف الحساب — وما زاد على حدّ الملف يقول إنّه ناقص.
 * القاعدة هنا مزيّفة تطبّق الحدّ نفسه، فقراءةٌ تكتفي بطلبٍ واحد تسقط.
 *
 *   npx tsx scripts/verify-ledger-export.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPORT_MAX_ENTRIES, loadReport, type BookRef, type BookReportParams } from "../src/lib/ledger/load";
import { reportToCsv } from "../src/lib/ledger/reportData";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

/** Just enough of the client: filters, orders, a range, and the API's own cap on every answer. */
function fakeDb(tables: Record<string, Row[]>, rpcs: Record<string, Row[]>) {
  let requests = 0;
  const query = (rows: Row[]) => {
    let out = rows;
    const orders: { col: string; asc: boolean }[] = [];
    let lo = 0;
    let hi = Infinity;
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), b),
      gte: (c: string, v: string) => ((out = out.filter((r) => String(r[c]) >= v)), b),
      lte: (c: string, v: string) => ((out = out.filter((r) => String(r[c]) <= v)), b),
      in: (c: string, vs: unknown[]) => {
        const set = new Set(vs);
        out = out.filter((r) => set.has(r[c]));
        return b;
      },
      order: (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), b),
      range: (a: number, z: number) => ((lo = a), (hi = z), b),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => {
        requests++;
        const sorted = [...out].sort((x, y) => {
          for (const o of orders) {
            const a = x[o.col] as string | number;
            const c = y[o.col] as string | number;
            if (a < c) return o.asc ? -1 : 1;
            if (a > c) return o.asc ? 1 : -1;
          }
          return 0;
        });
        const end = Math.min(hi + 1, lo + MAX_ROWS);
        return Promise.resolve({ data: sorted.slice(lo, end), error: null }).then(res);
      },
    };
    return b;
  };
  const client = {
    from: (t: string) => query(tables[t] ?? []),
    rpc: (fn: string) => query(rpcs[fn] ?? []),
  };
  return { client: client as unknown as SupabaseClient, count: () => requests };
}

const book: BookRef = { id: "book-1", kind: "farm", closed_through: null };
const accounts: Row[] = [
  { id: "acc-cash", book_id: "book-1", code: "1110", parent_code: "11", name_ar: "النقد", name_en: "Cash", type: "asset", postable: true, active: true },
  { id: "acc-seeds", book_id: "book-1", code: "5110", parent_code: "51", name_ar: "بذور", name_en: "Seeds", type: "expense", postable: true, active: true },
];

function book_of(n: number) {
  const entries: Row[] = [];
  const lines: Row[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `e-${String(i).padStart(6, "0")}`;
    const day = `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
    entries.push({ id, book_id: "book-1", entry_no: i, entry_date: day, memo: `قيد ${i}`, reversal_of: null, fx_rate: null });
    lines.push({ entry_id: id, book_id: "book-1", line_no: 1, account_id: "acc-seeds", side: "D", currency: "USD", amount_minor: i, base_minor: i });
    lines.push({ entry_id: id, book_id: "book-1", line_no: 2, account_id: "acc-cash", side: "C", currency: "USD", amount_minor: i, base_minor: i });
  }
  return { entries, lines };
}

const params = (report: BookReportParams["report"]): BookReportParams =>
  ({ report, kind: "farm", from: "2026-01-01", to: "2026-12-31", asOf: "2026-12-31", page: 1, account: "acc-cash" }) as BookReportParams;

async function main() {
  console.log("\nأ) ٢٬٦٠٠ قيد بسطرين: الملف يحملها كلّها");
  {
    const { entries, lines } = book_of(2600);
    const db = fakeDb({ journal_entries: entries, journal_lines: lines, ledger_accounts: accounts }, {});
    const data = await loadReport(db.client, book, params("journal"), { whole: true });
    ok(data.kind === "journal" && data.entries.length === 2600, "القيود كلّها: ٢٬٦٠٠");
    ok(data.kind === "journal" && data.entries.reduce((n, e) => n + e.lines.length, 0) === 5200, "وسطورها كلّها: ٥٬٢٠٠");
    ok(data.kind === "journal" && !data.hasMore, "ولا يُقال إنّه ناقص");
    const sorted =
      data.kind === "journal" &&
      data.entries.every((e, i, a) => i === 0 || a[i - 1].entry_date > e.entry_date || (a[i - 1].entry_date === e.entry_date && a[i - 1].entry_no > e.entry_no));
    ok(sorted && data.kind === "journal" && data.entries.every((e) => e.lines.length === 2 && e.lines[0].line_no === 1), "مرتّبةً من الأحدث، وكلّ قيدٍ بسطريه بترتيبهما");
    const csv = reportToCsv(data);
    ok(csv.split("\n").length >= 5201, "والملف ٥٬٢٠٠ سطر قيدٍ وعنوان");
    ok(!csv.includes("الملف ناقص"), "بلا سطر «ناقص»");
  }

  console.log("\nب) الصفحة على الشاشة كما كانت: ٢٥");
  {
    const { entries, lines } = book_of(2600);
    const db = fakeDb({ journal_entries: entries, journal_lines: lines, ledger_accounts: accounts }, {});
    const data = await loadReport(db.client, book, params("journal"));
    ok(data.kind === "journal" && data.entries.length === 25 && data.hasMore, "خمسةٌ وعشرون، وبعدها صفحة");
  }

  console.log("\nج) ما زاد على حدّ الملف يُقطع ويقول ذلك");
  {
    const { entries, lines } = book_of(EXPORT_MAX_ENTRIES + 1500);
    const db = fakeDb({ journal_entries: entries, journal_lines: lines, ledger_accounts: accounts }, {});
    const data = await loadReport(db.client, book, params("journal"), { whole: true });
    ok(data.kind === "journal" && data.entries.length === EXPORT_MAX_ENTRIES, `يحمل ${EXPORT_MAX_ENTRIES} قيداً`);
    ok(data.kind === "journal" && data.hasMore, "ويعلم أنّ بعدها");
    ok(reportToCsv(data).includes("الملف ناقص"), "ويقول في آخره إنّه ناقص");
  }

  console.log("\nد) كشف حسابٍ بـ٢٬٥٠٠ سطر: كلّه في الملف");
  {
    const rows: Row[] = Array.from({ length: 2500 }, (_, i) => ({
      entry_date: "2026-03-01",
      entry_no: i + 1,
      memo: "م",
      side: "D",
      currency: "USD",
      signed_base: 1,
      running_base: i + 1,
    }));
    const db = fakeDb({ ledger_accounts: accounts }, { ledger_account_statement: rows });
    const whole = await loadReport(db.client, book, params("account"), { whole: true });
    ok(whole.kind === "account" && whole.rows.length === 2500, "السطور كلّها: ٢٬٥٠٠");
    const screen = await loadReport(db.client, book, params("account"));
    ok(screen.kind === "account" && screen.rows.length === 1000, "(والشاشة كما كانت: ما يعطيه طلبٌ واحد)");
  }

  console.log("\nهـ) قيودٌ بسطورٍ كثيرة (١٢ لكلّ قيد): السطور أيضاً تُقرأ إلى نهايتها");
  {
    const entries: Row[] = [];
    const lines: Row[] = [];
    for (let i = 1; i <= 300; i++) {
      const id = `m-${String(i).padStart(4, "0")}`;
      entries.push({ id, book_id: "book-1", entry_no: i, entry_date: "2026-05-05", memo: "قسمة", reversal_of: null, fx_rate: null });
      for (let k = 1; k <= 12; k++) {
        lines.push({ entry_id: id, book_id: "book-1", line_no: k, account_id: k % 2 ? "acc-seeds" : "acc-cash", side: k % 2 ? "D" : "C", currency: "USD", amount_minor: 1, base_minor: 1 });
      }
    }
    const db = fakeDb({ journal_entries: entries, journal_lines: lines, ledger_accounts: accounts }, {});
    const data = await loadReport(db.client, book, params("journal"), { whole: true });
    ok(data.kind === "journal" && data.entries.every((e) => e.lines.length === 12), "كلّ قيدٍ بسطوره الاثني عشر");
    ok(data.kind === "journal" && data.entries.reduce((n, e) => n + e.lines.length, 0) === 3600, "والسطور ٣٬٦٠٠");
  }

  if (failed > 0) {
    console.error(`\n${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("\nOK");
}

main();
