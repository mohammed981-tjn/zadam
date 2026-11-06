/**
 * القوائم الماليّة الكاملة وحزمتها PDF (البند ٢٠٥): ترتيب ما تعيده القاعدة، والمقارنة ونسبتها بالأعداد الصحيحة، وأعمار
 * الذمم، والميزانيّة مقابل الفعليّ، والإيضاحات من الأرقام، والبصمة ثابتةٌ لأرقامٍ ثابتة وتتغيّر بسنت، والعنوان، والترتيب
 * البصريّ للعربيّ المختلط بالأرقام، والحزمة PDF تُبنى وتُقرأ وتحمل بصمتها، وملفّاتها مذكورةٌ لمسارَي الحزمة.
 *
 * The figures are the SQL gate's (`verify-ledger-statements.sql`, the year 2026 to 31 October against 2025), so the two
 * layers agree. With LEDGER_PDF_OUT=/path/file.pdf the sample bundle is also written there, to be looked at.
 *
 *   npx tsx scripts/verify-ledger-bundle.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildAgeing,
  buildBalanceCompare,
  buildBudget,
  buildCashCompare,
  buildEquity,
  buildIncomeCompare,
  buildNotes,
  bundleToWire,
  fingerprintGroups,
  fingerprintOf,
  fingerprintText,
  pair,
  type AgeingDbRow,
  type BudgetDbRow,
  type CompareDbRow,
  type EquityDbRow,
  type Facts,
  type StatementsBundle,
} from "../src/lib/ledger/statements";
import { monthEnd, parseStatementsParams, periodOf, statementsQuery } from "../src/lib/ledger/statementsParams";
import { statementsForApp } from "../src/lib/ledger/statementsApp";
import { ltr, plain, visualRuns } from "../src/lib/ledger/pdfText";
import { buildStatementsPdf, isolateFigures, khartoumStamp, PDF_ASSET_FILES, statementsFileName } from "../src/lib/ledger/statementsPdf";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const B = (n: number) => BigInt(n);

console.log("\nأ) المقارنة ونسبتها");
ok(JSON.stringify(bundleToWire({ x: pair(B(47000), B(40000)) } as never)) === '{"x":{"current":47000,"previous":40000,"change":7000,"pct":17.5}}', "٤٧٠ مقابل ٤٠٠: +٧٠ و١٧٫٥٪ (كما في القاعدة)");
ok(pair(B(15000), B(10000)).pct === 50, "١٥٠ مقابل ١٠٠: ٥٠٪");
ok(pair(B(-5000), B(-2000)).pct === -150, "سحبٌ زاد من ٢٠ إلى ٥٠: −١٥٠٪ (إلى القيمة المطلقة للسابق)");
ok(pair(B(100), B(0)).pct === null && pair(B(100), B(0)).change === B(100), "ولا نسبة لما كان صفراً، والتغيّر يُذكر");
ok(pair(B(100), null).change === null && pair(B(100), null).pct === null, "وبلا سابقٍ: لا تغيّر ولا نسبة");
ok(pair(B(1), B(3)).pct === -66.7 && pair(B(2), B(3)).pct === -33.3, "والتقريب إلى عُشر كما يقرّب round() في القاعدة");

// The SQL gate's book, the year 2026 to 31 October against 2025 to 31 October.
const r = (code: string, type: string, cur: number, prev: number | null, key = code): CompareDbRow => ({ code, name_ar: `ح${code}`, name_en: `A${code}`, type, system_key: key, current_minor: cur, previous_minor: prev });
const income = buildIncomeCompare(
  [
    r("4110", "revenue", 47000, 40000, "sales_crops"),
    r("5110", "expense", 15000, 10000, "cost_seeds"),
    r("5120", "expense", 6000, 0, "cost_fertiliser"),
    r("5140", "expense", 8000, 0, "cost_labour"),
    r("5900", "expense", -29000, -10000, "costs_capitalised"),
  ],
  true,
);
console.log("\nب) قائمة الدخل المقارنة");
ok(income.totalRevenue.current === B(47000) && income.totalRevenue.previous === B(40000), "مجموع الإيراد في العمودين");
ok(income.totalExpense.current === B(0) && income.totalExpense.previous === B(0), "والمصروف صفرٌ في العمودين: التكلفة مرسملة على المحصول القائم");
ok(income.net.current === B(47000) && income.net.pct === 17.5, "وصافي الدخل ٤٧٠$ بزيادة ١٧٫٥٪");

console.log("\nج) الميزانيّة المقارنة");
const balRows: CompareDbRow[] = [
  r("1110", "asset", 4000, 30000, "cash_on_hand"),
  r("1120", "asset", 120000, 100000, "bank"),
  r("1210", "asset", 44000, 0, "receivable_buyers"),
  r("1410", "asset", 29000, 10000, "crops_in_progress"),
  r("2110", "liability", 6000, 0, "payables_suppliers"),
  r("3110", "equity", 120000, 100000, "owner_capital"),
  r("3130", "equity", -5000, 0, "owner_drawings"),
  r("3210", "equity", -1000, 0, "retained_earnings"),
  r("3990", "equity", 40000, 0, "_income_prior"),
  r("3991", "equity", 47000, 40000, "_income_current"),
];
const balance = buildBalanceCompare(balRows, true);
ok(balance.totalAssets.current === B(197000) && balance.totalAssets.previous === B(140000), "مجموع الأصول في العمودين");
ok(balance.totalEquity.current === B(201000), "والملكيّة بربحها غير المقفل ٢٠١٠$");
ok(balance.balanced === false, "وهذه الأرقام لا تتوازن (١٩٧٠ ≠ ٦٠ + ٢٠١٠) فتقول القائمة ذلك");
const balanced = buildBalanceCompare(balRows.map((x) => (x.code === "1120" ? { ...x, current_minor: 130000 } : x)), true);
ok(balanced.balanced, "ومتى توازنت في العمودين قالت ذلك");
ok(buildBalanceCompare([r("3990", "equity", 0, 0, "_income_prior"), r("1110", "asset", 0, 0)], true).equity.length === 0, "وسطر الربح المحسوب صفراً في العمودين لا يُعرض");

console.log("\nد) التدفّقات والملكيّة");
const cash = buildCashCompare(
  [
    { ...r("4110", "", 40000, 40000), section: "operating" },
    { ...r("5110", "", -15000, -10000), section: "operating" },
    { ...r("3110", "", 20000, 100000), section: "financing" },
    { ...r("3130", "", -5000, 0), section: "financing" },
    { ...r("3210", "", -1000, 0), section: "financing" },
    { ...r("_opening", "", 130000, 0), section: "cash" },
    { ...r("_closing", "", 169000, 130000), section: "cash" },
  ],
  true,
);
ok(cash.net.current === B(39000) && cash.ties, "نقد أوّل الفترة + الحركة = آخرها، هذه الفترة");
ok(cash.net.previous === B(130000) && cash.opening.previous === B(0), "والسابقة");
const eqRows: EquityDbRow[] = [
  { ord: 1, line: "opening", name_ar: "أوّل", name_en: "open", amount: 140000 },
  { ord: 2, line: "contributions", name_ar: "مساهمات", name_en: "c", amount: 20000 },
  { ord: 3, line: "drawings", name_ar: "سحوبات", name_en: "d", amount: -5000 },
  { ord: 4, line: "profit", name_ar: "ربح", name_en: "p", amount: 47000 },
  { ord: 5, line: "other", name_ar: "أخرى", name_en: "o", amount: -1000 },
  { ord: 6, line: "closing", name_ar: "آخر", name_en: "close", amount: 201000 },
];
ok(buildEquity(eqRows, B(201000)).closesToBalance, "الملكيّة آخر الفترة = ملكيّة الميزانيّة");
ok(!buildEquity(eqRows, B(201001)).closesToBalance, "وتقول إن اختلفتا بسنت");

console.log("\nهـ) الأعمار والميزانيّة التقديريّة");
const ag: AgeingDbRow[] = [
  { side: "receivable", code: "1210", name_ar: "مشترو المحصول", name_en: "Crop buyers", bucket: "0_30", items: 1, amount_minor: 12000 },
  { side: "receivable", code: "1210", name_ar: "مشترو المحصول", name_en: "Crop buyers", bucket: "90_plus", items: 2, amount_minor: 32000 },
  { side: "payable", code: "2110", name_ar: "موردون", name_en: "Suppliers", bucket: "61_90", items: 1, amount_minor: 6000 },
  { side: "payable", code: "2120", name_ar: "أجور مستحقة", name_en: "Accrued wages", bucket: "advance", items: 1, amount_minor: -500 },
];
const ageing = buildAgeing(ag);
ok(ageing.receivable.total === B(44000) && ageing.receivable.buckets["90_plus"] === B(32000), "المدينون ٤٤٠$، منها ٣٢٠$ فوق ٩٠ يوماً");
ok(ageing.receivable.accounts[0].items === 3, "في ثلاثة بنود");
ok(ageing.payable.total === B(5500) && ageing.payable.buckets.advance === B(-500), "والمدفوع مقدّماً سالبٌ في عموده ويُطرح من المجموع");
const bud: BudgetDbRow[] = [
  { season_id: "s1", season_name: "ذرة ٢٠٢٦", stage_id: "a", stage_key: "land_prep", stage_order: 1, budget_minor: 30000, actual_minor: 15000 },
  { season_id: "s1", season_name: "ذرة ٢٠٢٦", stage_id: "b", stage_key: "planting", stage_order: 2, budget_minor: 20000, actual_minor: 8000 },
  { season_id: "s1", season_name: "ذرة ٢٠٢٦", stage_id: null, stage_key: null, stage_order: 99, budget_minor: 0, actual_minor: 6000 },
];
const budget = buildBudget(bud);
ok(budget.length === 1 && budget[0].budget === B(50000) && budget[0].actual === B(29000) && budget[0].variance === B(21000), "الموسم: خطّة ٥٠٠$، وصُرف ٢٩٠$، وبقي ٢١٠$");
ok(budget[0].usedPct === 58 && budget[0].stages[0].usedPct === 50, "والمستخدم ٥٨٪، وتحضير الأرض ٥٠٪");
ok(budget[0].stages[2].name.ar === "بلا مرحلة" && budget[0].stages[2].usedPct === null, "وما بلا مرحلة سطرٌ وحده بلا نسبة");
ok(budget[0].stages[0].name.ar === "تحضير الأرض" && budget[0].stages[0].name.en === "Land preparation", "وأسماء المراحل بالعربيّة والإنجليزيّة");

console.log("\nو) البصمة والإيضاحات");
const facts: Facts = {
  kind: "farm",
  owner_name: "المزارع",
  closed_through: null,
  entries: 14,
  reversals: 1,
  manual: 5,
  first_entry: "2025-01-05",
  currencies: [
    { currency: "SDG", lines: 4, native_minor: 1200000, base_minor: 2000 },
    { currency: "USD", lines: 30, native_minor: 200000, base_minor: 200000 },
  ],
  fx: { entries: 2, min_rate: 590, max_rate: 610.5, parallel: 1, bank: 0, user: 1 },
  fx_result: -150,
  fixed_assets: { count: 1, cost_minor: 300000, salvage_minor: 30000, min_life: 60, max_life: 60 },
  depreciation_minor: 4500,
  growing_crops_minor: 29000,
  open_credit_rows: 3,
};
const base: Omit<StatementsBundle, "fingerprint" | "notes" | "generatedAt"> = {
  book: { id: "b0000000-0000-0000-0000-0000000000b0", kind: "farm", heading: { ar: "دفتر مزرعتك", en: "Your farm book" }, ownerName: "المزارع", closedThrough: null },
  basis: "year",
  current: { from: "2026-01-01", to: "2026-10-31", season: null },
  previous: { from: "2025-01-01", to: "2025-10-31", season: null },
  income,
  balance: balanced,
  cash,
  equity: buildEquity(eqRows, balanced.totalEquity.current),
  ageing: { asOf: "2026-10-31", ...ageing },
  budget,
};
const text = fingerprintText(base);
const fp = fingerprintOf(text);
ok(/^[0-9a-f]{64}$/.test(fp), "البصمة SHA-256 بستّين حرفاً وأربعة");
ok(fingerprintOf(fingerprintText(structuredClone(base))) === fp, "والأرقام نفسها تعطي البصمة نفسها");
const moved = { ...base, ageing: { ...base.ageing, receivable: { ...base.ageing.receivable, accounts: base.ageing.receivable.accounts.map((a) => ({ ...a, buckets: { ...a.buckets, "0_30": a.buckets["0_30"] + B(1) } })) } } };
ok(fingerprintOf(fingerprintText(moved)) !== fp, "وسنتٌ واحد في عمر دينٍ يغيّرها");
const renamed = { ...base, income: { ...income, revenue: income.revenue.map((l) => ({ ...l, name: { ar: "اسمٌ آخر", en: "other" } })) } };
ok(fingerprintOf(fingerprintText(renamed)) === fp, "وتسمية حسابٍ باسمٍ آخر لا تغيّرها (البصمة للأرقام)");
ok(fingerprintGroups(fp).split(" ").length === 8, "وتُكتب ثماني مجموعات تُقرأ بالعين");
const notes = buildNotes(base, facts);
const all = notes.map((n) => n.body.ar).join(" ");
ok(notes.length === 5, "خمسة إيضاحات: الأساس، والعملة، والأصول، والبنود، والمقارنة");
ok(all.includes("4 سطراً") && all.includes("590") && all.includes("610.5") && all.includes("خسارةٌ 1.50 $"), "العملة: أسطر الجنيه ومدى السعر وصافي فرق الصرف من الأرقام");
ok(all.includes("بالقسط الثابت") && all.includes("(60 شهراً)") && all.includes("45.00 $"), "والإهلاك: الطريقة والعمر وإهلاك الفترة");
ok(all.includes("أكبر الإيراد") && all.includes("320.00 $"), "والبنود: أكبر الإيراد، وما مضى عليه أكثر من ٩٠ يوماً");
ok(notes[4].body.ar.includes("2025-01-01") && notes[4].body.en.includes("the same days of the year before"), "والمقارنة تقول بماذا قورنت");
const usdOnly = buildNotes(base, { ...facts, currencies: [facts.currencies[1]], fixed_assets: { count: 0, cost_minor: 0, salvage_minor: 0, min_life: null, max_life: null } });
ok(usdOnly[1].body.ar.includes("كلّ قيود الفترة بالدولار") && usdOnly[2].body.ar.startsWith("لا أصول ثابتة"), "ودفترٌ بلا جنيهٍ ولا أصولٍ يقول ذلك ولا يصف قاعدةً لم تُستعمل");
ok(buildNotes({ ...base, balance }, facts)[3].body.ar.includes("تنبيه") && !notes[3].body.ar.includes("تنبيه"), "وقائمةٌ لا تتوازن يُنبَّه إليها في الإيضاحات، والمتوازنة لا");

console.log("\nز) العنوان والفترة");
const today = "2026-11-06";
const p0 = parseStatementsParams({}, today);
ok(p0.basis === "year" && p0.year === 2026 && p0.compare, "بلا شيء: هذه السنة مقارنةً بالسابقة");
ok(JSON.stringify(periodOf(p0, today)) === '{"from":"2026-01-01","to":"2026-11-06"}', "والسنة الجارية حتى اليوم");
ok(JSON.stringify(periodOf(parseStatementsParams({ basis: "month", m: "2026-02" }, today), today)) === '{"from":"2026-02-01","to":"2026-02-28"}', "وفبراير كاملاً");
ok(parseStatementsParams({ basis: "month", m: "2026-12" }, today).month === "2026-11", "وشهرٌ لم يأتِ بعد يصير هذا الشهر");
ok(parseStatementsParams({ y: "2031" }, today).year === 2026 && parseStatementsParams({ y: "1999" }, today).year === 2026, "وسنةٌ لم تأتِ أو قبل الدفاتر تصير هذه السنة");
ok(parseStatementsParams({ basis: "season" }, today).basis === "year", "وموسمٌ بلا موسمٍ يصير السنة");
ok(parseStatementsParams({ basis: "season", s: "not-a-uuid" }, today).season === null, "ومعرّف موسمٍ ليس معرّفاً لا يُقرأ");
ok(parseStatementsParams({ compare: "0" }, today).compare === false, "و«بلا مقارنة» عمودٌ واحد");
ok(monthEnd("2028-02") === "2028-02-29" && monthEnd("2026-09") === "2026-09-30", "وآخر الشهر يومه الصحيح");
const q = statementsQuery({ ...p0, basis: "season", season: "5b000000-0000-0000-0000-00000000005b", compare: false, kind: "farm" }, today);
ok(q === "?book=farm&basis=season&s=5b000000-0000-0000-0000-00000000005b&compare=0", "والعنوان يحمل ما يخالف الافتراضيّ وحده");
ok(JSON.stringify(parseStatementsParams(Object.fromEntries(new URLSearchParams(q.slice(1))), today)) === JSON.stringify({ ...p0, kind: "farm", basis: "season", season: "5b000000-0000-0000-0000-00000000005b", compare: false }), "ويُقرأ كما كُتب");

console.log("\nح) العربيّ المختلط بالأرقام في PDF");
ok(JSON.stringify(visualRuns("قائمة الدخل", "rtl")) === JSON.stringify(["قائمة الدخل"]), "العربيّ وحده سطرٌ واحد للمحرّك يشكّله ويقلبه");
ok(JSON.stringify(visualRuns("ربح سنة 2026", "rtl")) === JSON.stringify(["2026", "ربح سنة "]), "والرقم في آخر الجملة العربيّة يُرسم على يسارها وبترتيبه");
ok(visualRuns(`الفترة ${ltr("2026-11-06")}`, "rtl").includes("2026-11-06"), "والتاريخ معزولاً يبقى 2026-11-06 لا 06-11-2026");
ok(!visualRuns("الفترة 2026-11-06", "rtl").includes("2026-11-06"), "(وبلا عزلٍ يقلبه الخوارزم كما يقلبه المتصفّح — لذلك يُعزل)");
ok(visualRuns("البند (4110)", "rtl").join("").includes("4110") && visualRuns("البند (4110)", "rtl").some((s) => s.includes(")") || s.includes("(")), "والأقواس حول الرمز تُعكس في الاتّجاه العربيّ");
ok(JSON.stringify(visualRuns("Net income 1,234.50", "ltr")) === JSON.stringify(["Net income 1,234.50"]), "والإنجليزيّ سطرٌ واحد كما هو");
ok(plain(ltr("x")) === "x", "وعلامات العزل لا تُرسم");
// End to end through the font engine itself: the characters as the glyphs come out, left to right on the page.
const tajawal = fontkit.create(new Uint8Array(readFileSync("assets/fonts/Tajawal-Regular.ttf")));
const seen = (text: string, dir: "rtl" | "ltr" = "rtl") =>
  visualRuns(text, dir)
    .map((run) => tajawal.layout(run).glyphs.map((g) => String.fromCodePoint(...g.codePoints)).join(""))
    .join("");
const rev = (s: string) => [...s].reverse().join("");
ok(seen("ذرة ٢٠٢٦") === `٢٠٢٦ ${rev("ذرة")}`, "والأرقام الهنديّة تخرج من الخطّ بترتيبها (٢٠٢٦ لا ٦٢٠٢)");
ok(seen(`الفترة ${ltr("2026-11-06")}`) === `2026-11-06 ${rev("الفترة")}`, "والتاريخ المعزول يخرج من الخطّ كما يُقرأ");
ok(seen("مشترو المحصول (1210)") === `(1210) ${rev("مشترو المحصول")}`, "والرمز بين قوسين في مكانه وقوساه في اتّجاههما");
ok(seen(isolateFigures("لك على غيرك 440.00 $ يوم 2026-10-31.")) === `.2026-10-31 ${rev("يوم")} 440.00 $ ${rev("لك على غيرك")}`, "والمبلغ بعلامة الدولار والتاريخ في نصّ الإيضاح");
ok(seen("Net income 1,234.50", "ltr") === "Net income 1,234.50", "والإنجليزيّ كما هو");

console.log("\nط) الحزمة PDF");
const bundle: StatementsBundle = { ...base, notes, fingerprint: fp, generatedAt: "2026-11-06T07:30:00.000Z" };
ok(khartoumStamp(bundle.generatedAt) === "2026-11-06 09:30", "وقت الإعداد بتوقيت الخرطوم");
ok(statementsFileName(bundle) === "sudagri-statements-2026-01-01-2026-10-31.pdf", "واسم الملفّ بالفترة");
(async () => {
  const bytes = await buildStatementsPdf(bundle, { locale: "ar" });
  ok(Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-", "تُبنى ملفّ PDF");
  const doc = await PDFDocument.load(bytes);
  ok(doc.getPageCount() >= 2, `بصفحاتٍ عدّة (${doc.getPageCount()})`);
  ok(doc.getKeywords()?.includes(fp) === true && doc.getSubject() === `SHA-256 ${fp}`, "وبصمتها في خصائص الملفّ");
  ok(doc.getTitle()?.includes("المزارع") === true && doc.getAuthor() === "Sudagri", "واسم صاحب الدفتر في عنوانه");
  ok(bytes.length < 400_000, `وحجمه معقول (${Math.round(bytes.length / 1024)} ك.ب): الخطّ مقتطَعٌ لما استُعمل منه`);
  const again = await buildStatementsPdf(bundle, { locale: "ar" });
  ok(Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0, "والحزمة نفسها تُبنى بايتاً ببايت مرّتين");
  const en = await buildStatementsPdf(bundle, { locale: "en" });
  ok((await PDFDocument.load(en)).getPageCount() >= 2, "وبالإنجليزيّة من اليسار");
  const single = await buildStatementsPdf({ ...bundle, previous: null }, { locale: "ar" });
  ok((await PDFDocument.load(single)).getPageCount() >= 1, "وبلا مقارنةٍ عمودٌ واحد");
  if (process.env.LEDGER_PDF_OUT) {
    writeFileSync(process.env.LEDGER_PDF_OUT, bytes);
    writeFileSync(process.env.LEDGER_PDF_OUT.replace(/\.pdf$/, "-en.pdf"), en);
    console.log(`  (كُتبت العيّنة في ${process.env.LEDGER_PDF_OUT})`);
  }

  console.log("\nك) ما يرسله المسار إلى التطبيق هو ما تقرؤه اختباراته");
  // The Dart tests (mobile/test/statements_test.dart) read this fixture; it is the route's own JSON for the sample
  // bundle. WRITE_FIXTURE=1 rewrites it after a deliberate change of shape.
  const fixturePath = "mobile/test/fixtures/statements_route.json";
  const route =
    JSON.stringify(
      statementsForApp(bundle, parseStatementsParams({ y: "2026" }, today), [{ id: "5b000000-0000-0000-0000-00000000005b", name: "ذرة ٢٠٢٦", planting_date: "2026-06-01" }], today),
      null,
      2,
    ) + "\n";
  if (process.env.WRITE_FIXTURE) writeFileSync(fixturePath, route);
  ok(readFileSync(fixturePath, "utf8") === route, `${fixturePath} هو ردّ المسار نفسه (WRITE_FIXTURE=1 يعيد كتابته بعد تغييرٍ مقصود)`);

  console.log("\nي) ملفّات الحزمة تُحمل مع مسارَيها");
  const config = readFileSync("next.config.ts", "utf8");
  for (const route of ["/books/statements/pdf", "/api/app/books/statements/pdf"]) {
    const at = config.indexOf(`"${route}"`);
    const listed = at >= 0 && PDF_ASSET_FILES.every((f) => config.slice(at, at + 400).includes(`./${f}`));
    ok(listed, `next.config.ts يذكر الخطّين والشعار لـ ${route}`);
  }
  for (const f of PDF_ASSET_FILES) ok(readFileSync(f).length > 1000, `${f} في المستودع`);
  ok(readFileSync("assets/fonts/OFL-Tajawal.txt", "utf8").includes("SIL Open Font License"), "ورخصة الخطّ معه");

  console.log(failed ? `\n${failed} فشل` : "\nOK");
  process.exit(failed ? 1 : 0);
})();
