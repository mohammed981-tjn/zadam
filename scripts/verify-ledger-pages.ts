/**
 * صفحات الدفتر تقول الصحيح (البند ١٩٨، ب٢ وب٤–ب٨): الدفتر المفتوح هو الذي طُلب ويُقال لمن هو، وميزان المراجعة في
 * الملف يجمع ما فوق مجموعه، وربح السنة يُسمّى بسنته، و«اليوم» يوم الخرطوم، ونصوص الرقابة تقول القاعدة كاملة والعلاج الصحيح.
 *
 *   npx tsx scripts/verify-ledger-pages.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickBook } from "../src/lib/ledger/load";
import { bookHeading, parseReportParams, reportHref } from "../src/lib/ledger/reportParams";
import { currentIncomeLabel, reportToCsv } from "../src/lib/ledger/reportData";
import { buildBalanceSheet, buildTrialBalance, type TrialRow } from "../src/lib/ledger/reports";
import { agreementsWithheld, closedMonthEnd, lastClosedMonths, RECONCILE_REMEDY } from "../src/lib/oversightView";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

type Row = Record<string, unknown>;

/** The books an administrator's policy shows: his own farm book first, then the one his inspection opened. */
function fakeBooks(rows: Row[]) {
  const query = () => {
    let out = rows;
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), b),
      is: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), b),
      limit: (n: number) => ((out = out.slice(0, n)), b),
      maybeSingle: () => Promise.resolve({ data: out[0] ?? null, error: null }),
    };
    return b;
  };
  return { from: () => query() } as unknown as SupabaseClient;
}

const ADMIN = "ad000000-0000-0000-0000-0000000000ad";
const FARMER = "f1000000-0000-0000-0000-0000000000f1";
const OWN = "b0000000-0000-0000-0000-00000000000a";
const INSPECTED = "b0000000-0000-0000-0000-00000000000b";
const PLATFORM = "b0000000-0000-0000-0000-00000000000c";
const books: Row[] = [
  { id: OWN, kind: "farm", closed_through: null, owner_id: ADMIN },
  { id: INSPECTED, kind: "farm", closed_through: null, owner_id: FARMER },
  { id: PLATFORM, kind: "platform", closed_through: null, owner_id: null },
];

async function main() {
  console.log("\nأ) الدفتر المفتوح هو الذي طُلب (ب٢)");
  {
    const db = fakeBooks(books);
    const inspected = await pickBook(db, "farm", ADMIN, INSPECTED);
    ok(inspected?.id === INSPECTED, "رابط الفحص يفتح الدفتر المفحوص بعينه");
    const own = await pickBook(db, "farm", ADMIN);
    ok(own?.id === OWN, "وبلا رقم: دفتر القارئ نفسه، لا أوّل دفترٍ تُظهره السياسة");
    const reversed = await pickBook(fakeBooks([books[1], books[0], books[2]]), "farm", ADMIN);
    ok(reversed?.id === OWN, "ولو جاء الدفتر المفحوص أوّلاً");
    ok((await pickBook(db, "platform", ADMIN))?.id === PLATFORM, "ودفتر المنصّة بلا مالك");
    ok((await pickBook(db, "farm", "someone-else")) === null, "ومن لا دفتر له لا يُعطى دفتر غيره");
    ok((await pickBook(db, "farm", ADMIN, "b0000000-0000-0000-0000-0000000000ff")) === null, "ورقمٌ لا تُظهره السياسة: لا دفتر");

    ok(bookHeading({ kind: "farm", owner_id: ADMIN }, ADMIN).ar === "دفتر مزرعتك", "دفترك: «دفتر مزرعتك»");
    const h = bookHeading({ kind: "farm", owner_id: FARMER }, ADMIN).ar;
    ok(!h.includes("مزرعتك") && h.includes("تحت الفحص") && h.includes("قراءة فقط"), `ودفتر غيرك: «${h}»`);
    ok(bookHeading({ kind: "investor", owner_id: FARMER }, ADMIN).ar.includes("تحت الفحص"), "وكذلك دفتر المستثمر");
    ok(bookHeading({ kind: "platform", owner_id: null }, ADMIN).ar === "دفتر المنصّة", "ودفتر المنصّة باسمه");

    const p = parseReportParams({ book: "farm", id: INSPECTED.toUpperCase(), r: "journal" }, "2026-10-25");
    ok(p.bookId === INSPECTED, "رقم الدفتر يُقرأ من العنوان");
    ok(parseReportParams({ id: "1; drop" }, "2026-10-25").bookId === null, "ورقمٌ ليس uuid يُهمل");
    ok(reportHref("/books", { ...p, report: "trial" }, "2026-10-25").includes(`id=${INSPECTED}`), "وتبقى الروابط بين التقارير على الدفتر نفسه");
    const oversight = readFileSync(join(__dirname, "../src/app/admin/oversight/page.tsx"), "utf8");
    ok(oversight.includes("&id=${i.book_id}"), "ورابط «اقرأ الدفتر» في الرقابة يحمل رقم الدفتر");
  }

  console.log("\nب) ميزان المراجعة في الملف: المجموع لما فوقه (ب٧)");
  {
    const trial = buildTrialBalance([
      { code: "1120", name_ar: "البنك", name_en: "", type: "asset", debit_balance: 10000, credit_balance: 0 },
      { code: "4110", name_ar: "المبيعات", name_en: "", type: "revenue", debit_balance: 0, credit_balance: 10000 },
      { code: "9210", name_ar: "إحصائي", name_en: "", type: "equity", debit_balance: 0, credit_balance: 55000 },
      { code: "9120", name_ar: "مقابل", name_en: "", type: "equity", debit_balance: 55000, credit_balance: 0 },
    ] as TrialRow[]);
    const lines = reportToCsv({ kind: "trial", trial }).replace(/^﻿/, "").split("\r\n").filter(Boolean).map((l) => l.split(","));
    const totalAt = lines.findIndex((l) => l[1] === "المجموع");
    const above = lines.slice(1, totalAt);
    const sumD = above.reduce((a, l) => a + Number(l[3] || 0), 0);
    const sumC = above.reduce((a, l) => a + Number(l[4] || 0), 0);
    ok(sumD === Number(lines[totalAt][3]) && sumC === Number(lines[totalAt][4]), `المجموع (${lines[totalAt][3]}) يساوي جمع السطور فوقه (${sumD})`);
    ok(above.every((l) => !l[0].startsWith("9")), "ولا حساب إحصائيّ فوق المجموع");
    const after = lines.slice(totalAt + 1);
    ok(after.length === 3 && after[0][1].includes("لا تدخل المجموع") && after[1][0] === "9210", "والإحصائيّة بعده تحت عنوانها، كما على الشاشة");
  }

  console.log("\nج) ربح السنة يُسمّى بسنته (ب٨)");
  {
    ok(currentIncomeLabel("2026-10-25", "2026-10-25").ar === "ربح هذه السنة حتى اليوم", "ميزانيّة اليوم: «ربح هذه السنة حتى اليوم»");
    const old = currentIncomeLabel("2025-06-30", "2026-10-25").ar;
    ok(old.includes("2025") && old.includes("2025-06-30") && !old.includes("هذه السنة"), `وميزانيّة يونيو الماضي: «${old}»`);
    const sheet = buildBalanceSheet([], BigInt(0), BigInt(0));
    const csv = reportToCsv({ kind: "balance", sheet, asOf: "2025-06-30" });
    ok(csv.includes("ربح سنة 2025 حتى 2025-06-30") && !csv.includes("ربح هذه السنة"), "وفي الملف كذلك");
  }

  console.log("\nد) «اليوم» يوم الخرطوم في صفحة الموسم (ب٦)");
  {
    const root = join(__dirname, "../src/app/seasons");
    // The entry's insert and the stage's sign-off live in lib/seasonWrites since backlog 203 (the app's routes call
    // them too); the page's actions call them, so the three files are held together.
    const files = ["[id]/page.tsx", "actions.ts"].map((f) => readFileSync(join(root, f), "utf8"));
    const writes = readFileSync(join(__dirname, "../src/lib/seasonWrites.ts"), "utf8");
    ok([...files, writes].every((s) => !s.includes("new Date().toISOString().slice(0, 10)")), "لا يومٌ بتوقيت غرينتش في الصفحة ولا في أفعالها");
    ok([...files, writes].every((s) => s.includes("ledgerToday()")), "ويومهما ledgerToday()");
    ok(
      files[1].includes("recordLedgerEntry(") && writes.includes("entry_date: entryDate ?? today"),
      "والسطر بلا تاريخ يأخذ يوم الخرطوم صراحةً، لا افتراض القاعدة",
    );
  }

  console.log("\nهـ) نصوص الرقابة (ب٤، ب٥)");
  {
    ok(agreementsWithheld("٥").includes("أقلّ من ٥ عقود") && agreementsWithheld("٥").includes("يغلب عليه عقدٌ واحد"), "الحجب يُقال بشطريه: القلّة والغلبة");
    ok(!/يُصلحه طلب إلغاء|ويُصلحه طلب/.test(RECONCILE_REMEDY) && RECONCILE_REMEDY.includes("لا يصلحه") && RECONCILE_REMEDY.includes("صاحب الدفتر"),
       "فرق الذمّتين: لا يُقترح طلب الإلغاء علاجاً، والعلاج عند صاحب الدفتر");
    const m = lastClosedMonths("2026-10-25", 12);
    ok(m.length === 12 && m[11] === "2026-09-01" && m[0] === "2025-10-01", "الأشهر المعروضة: الاثنا عشر المنتهية (حتى سبتمبر)");
    ok(lastClosedMonths("2026-01-05", 1)[0] === "2025-12-01", "وفي يناير: ديسمبر الماضي");
    ok(closedMonthEnd("2026-10-25") === "2026-09-30" && closedMonthEnd("2026-03-01") === "2026-02-28", "والمطابقة حتى نهاية آخر شهرٍ انتهى");
    const page = readFileSync(join(__dirname, "../src/app/admin/oversight/page.tsx"), "utf8");
    ok(!page.includes("محجوب (أقلّ من {floorWord} عقود)") && !page.includes("ويُصلحه طلب إلغاءٍ"), "والصفحة تأخذ النصّين، لا القديمين");
  }

  if (failed > 0) {
    console.error(`\n${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("\nOK");
}

main();
