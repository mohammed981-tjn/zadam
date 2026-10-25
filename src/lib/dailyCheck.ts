/**
 * ترتيبُ الفحص اليوميّ ومهلةُ كلّ خطوة (البند ١٩٨ ج٨).
 *
 * `/api/health` يعيش دقيقةً واحدة (maxDuration). وكانت خطواته تجري بالترتيب الذي كُتبت به: قراءة الأسعار من خمسة
 * مصادر بطيئة أوّلاً، ثمّ مزامنة الفاو، ثمّ فحص النظام آخراً — فيومٌ تبطؤ فيه المصادر يقطع الدالّة قبل أن تصل إلى
 * الخطوتين اللتين وُجد الفحص من أجلهما (إيقاظ القاعدة وتسجيل حالتها، ومزامنة الفاو). الآن:
 *  - الخطوات الأساسيّة أوّلاً (فحص النظام ومزامنة الفاو ومسك الدفاتر)، والبطيئة التي تعتمد على الخارج آخراً.
 *  - لكلّ خطوةٍ مهلة، ولا تتجاوز ما بقي من الدقيقة؛ فإن انتهت المهلة سُجّلت الخطوة «لم تكتمل» ومضى الفحص، ولا تمنع
 *    خطوةٌ متعثّرة ما بعدها ولا تُسقط الدالّة كلّها.
 */

export interface Step {
  name: string;
  run: () => Promise<unknown>;
  /** The most this step may take, in milliseconds; never more than what is left of the deadline. */
  budgetMs: number;
}

export interface StepResult {
  name: string;
  status: "ok" | "failed" | "timed_out" | "skipped";
  ms: number;
  value?: unknown;
  error?: string;
}

const TIMED_OUT = Symbol("timed out");

/**
 * Runs the steps in order, each within its budget and within what is left of `deadlineMs` (from the start), keeping
 * `reserveMs` back for answering. A step that throws or overruns is recorded and the next one runs.
 */
export async function runSteps(
  steps: Step[],
  deadlineMs: number,
  reserveMs = 0,
  now: () => number = Date.now,
): Promise<StepResult[]> {
  const start = now();
  const out: StepResult[] = [];
  for (const step of steps) {
    const left = deadlineMs - reserveMs - (now() - start);
    const budget = Math.min(step.budgetMs, left);
    if (budget <= 0) {
      out.push({ name: step.name, status: "skipped", ms: 0 });
      continue;
    }
    const t0 = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        step.run(),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), budget);
        }),
      ]);
      out.push(
        value === TIMED_OUT
          ? { name: step.name, status: "timed_out", ms: now() - t0 }
          : { name: step.name, status: "ok", ms: now() - t0, value },
      );
    } catch (e) {
      out.push({ name: step.name, status: "failed", ms: now() - t0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return out;
}

/** What each step of the daily check does; the route supplies them, the order and the budgets are fixed here. */
export interface DailyJobs {
  prune: () => Promise<unknown>;
  systemCheck: () => Promise<unknown>;
  faostat: () => Promise<unknown>;
  bookkeeping: () => Promise<unknown>;
  prices: () => Promise<unknown>;
  priceAlerts: () => Promise<unknown>;
}

/**
 * The order: what the check exists for first (prune, the system check that keeps the database awake and records its
 * state, the FAOSTAT sync, the books), and the run that waits on outside news sites last, with whatever time is left.
 * The price alerts follow the prices they read.
 */
export function dailySteps(jobs: DailyJobs): Step[] {
  return [
    { name: "prune", run: jobs.prune, budgetMs: 5_000 },
    { name: "system_check", run: jobs.systemCheck, budgetMs: 10_000 },
    { name: "faostat", run: jobs.faostat, budgetMs: 25_000 },
    { name: "bookkeeping", run: jobs.bookkeeping, budgetMs: 10_000 },
    { name: "prices", run: jobs.prices, budgetMs: 45_000 },
    { name: "price_alerts", run: jobs.priceAlerts, budgetMs: 10_000 },
  ];
}

/** The function's own limit (maxDuration 60 s), less a margin for the answer. */
export const DAILY_DEADLINE_MS = 57_000;
export const DAILY_RESERVE_MS = 2_000;
