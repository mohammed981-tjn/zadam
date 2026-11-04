/**
 * الفحص اليوميّ لا تقطعه المصادر البطيئة قبل مزامنة الفاو وفحص النظام (البند ١٩٨ ج٨). الخطوات هنا مزيّفة: الأسعار
 * لا تنتهي أبداً، أو تأخذ أكثر من مهلتها، أو ترمي — وفي كلّ حالٍ تجري مزامنة الفاو وفحص النظام، وينتهي الفحص قبل حدّه.
 *
 *   npx tsx scripts/verify-daily-check.ts
 */
import { dailySteps, runSteps, type DailyJobs } from "../src/lib/dailyCheck";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const never = () => new Promise<never>(() => {});
const after = (ms: number, v: unknown = true) => new Promise((r) => setTimeout(() => r(v), ms));

function jobs(over: Partial<DailyJobs>, ran: string[]): DailyJobs {
  const mark = (name: string, f: () => Promise<unknown>) => () => {
    ran.push(name);
    return f();
  };
  const base: DailyJobs = {
    prune: () => after(5),
    systemCheck: () => after(5, { ok: true }),
    faostat: () => after(5, { skipped: true }),
    bookkeeping: () => after(5),
    prices: () => after(5),
    priceAlerts: () => after(5),
    researchSweep: () => after(5),
    ...over,
  };
  return {
    prune: mark("prune", base.prune),
    systemCheck: mark("system_check", base.systemCheck),
    faostat: mark("faostat", base.faostat),
    bookkeeping: mark("bookkeeping", base.bookkeeping),
    prices: mark("prices", base.prices),
    priceAlerts: mark("price_alerts", base.priceAlerts),
    researchSweep: mark("research_sweep", base.researchSweep),
  };
}

// The real budgets are seconds; the checks scale the deadline down so the whole file runs in about a second.
const scaled = (j: DailyJobs, k: number) => dailySteps(j).map((s) => ({ ...s, budgetMs: Math.ceil(s.budgetMs / k) }));

async function main() {
  console.log("\nأ) الترتيب: ما وُجد الفحص له أوّلاً، والمصادر الخارجيّة آخراً");
  const order = dailySteps(jobs({}, [])).map((s) => s.name);
  ok(order.indexOf("system_check") < order.indexOf("prices"), "فحص النظام قبل الأسعار");
  ok(order.indexOf("faostat") < order.indexOf("prices"), "ومزامنة الفاو قبل الأسعار");
  ok(order.indexOf("prices") < order.indexOf("price_alerts"), "والتنبيهات بعد الأسعار التي تقرؤها");
  ok(dailySteps(jobs({}, [])).reduce((a, s) => a + s.budgetMs, 0) >= 57_000, "والمهل معاً لا تقلّ عن الدقيقة (لا تُقطع خطوةٌ بلا داعٍ)");

  console.log("\nب) أسعارٌ لا تنتهي أبداً");
  {
    const ran: string[] = [];
    const t0 = Date.now();
    // A deadline shorter than the prices' own budget: what is left of it, not the budget, bounds the step.
    const r = await runSteps(scaled(jobs({ prices: never }, ran), 100), 300, 20);
    const ms = Date.now() - t0;
    ok(ran.includes("faostat") && ran.includes("system_check"), "مزامنة الفاو وفحص النظام جرتا");
    ok(r.find((x) => x.name === "system_check")?.status === "ok", "وفحص النظام نجح");
    ok(r.find((x) => x.name === "prices")?.status === "timed_out", "والأسعار سُجّلت «لم تكتمل»");
    ok(ms < 300, `والفحص انتهى قبل حدّه (${ms} من ٣٠٠ م.ث)`);
  }

  console.log("\nج) خطوةٌ ترمي لا تمنع ما بعدها");
  {
    const ran: string[] = [];
    const r = await runSteps(
      scaled(jobs({ prune: () => Promise.reject(new Error("boom")), bookkeeping: () => Promise.reject(new Error("bad")) }, ran), 100),
      570,
      20,
    );
    ok(r.find((x) => x.name === "prune")?.status === "failed" && r.find((x) => x.name === "prune")?.error === "boom", "الكنس فشل وسُجّل سببه");
    ok(r.filter((x) => x.status === "ok").map((x) => x.name).join(",") === "system_check,faostat,research_sweep,prices,price_alerts", "والباقي جرى كلّه");
  }

  console.log("\nد) مزامنة فاو بطيئة لا تأخذ وقت فحص النظام");
  {
    const ran: string[] = [];
    const r = await runSteps(scaled(jobs({ faostat: never }, ran), 100), 570, 20);
    ok(r.find((x) => x.name === "system_check")?.status === "ok", "فحص النظام جرى قبلها");
    ok(r.find((x) => x.name === "faostat")?.status === "timed_out", "والمزامنة توقّفت عند مهلتها");
    ok(r.find((x) => x.name === "bookkeeping")?.status === "ok", "ومسك الدفاتر جرى بعدها");
  }

  console.log("\nهـ) لا وقت باقٍ: الخطوة تُتخطّى ولا تبدأ");
  {
    const r = await runSteps([{ name: "x", run: never, budgetMs: 100 }], 10, 10);
    ok(r[0].status === "skipped", "تُسجَّل «تُخطّيت»");
  }

  if (failed > 0) {
    console.error(`\n${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("\nOK");
  process.exit(0);
}

const guard = setTimeout(() => {
  console.error("FAIL  الفحص لم ينتهِ: خطوةٌ بلا مهلة");
  process.exit(1);
}, 5000);
main().finally(() => clearTimeout(guard));
