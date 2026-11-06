import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { ledgerToday } from "@/lib/ledger/today";
import { pickBook } from "@/lib/ledger/load";
import { money } from "@/lib/ledger/reports";
import { parseStatementsParams, statementsQuery } from "@/lib/ledger/statementsParams";
import { loadStatements, seasonOptions } from "@/lib/ledger/statementsLoad";
import {
  BUCKETS,
  BUCKET_LABEL,
  fingerprintGroups,
  periodLabel,
  type AgeingSide,
  type Line,
  type Pair,
  type StatementsBundle,
  type Text,
} from "@/lib/ledger/statements";

/**
 * القوائم الماليّة (البند ٢٠٥، قرار المالك 6 نوفمبر): قائمة الدخل والميزانيّة والتدفّقات النقديّة مقارنةً بالفترة السابقة
 * (الشهر أو السنة أو الموسم)، وأعمار الذمم، والميزانيّة التقديريّة مقابل الفعليّ، وقائمة التغيّر في حقوق الملكيّة،
 * والإيضاحات — وحزمةٌ واحدة PDF بها كلّها، ببصمة أرقامها التي تظهر هنا أيضاً ليقارن بها من يحمل الورق.
 */

type SP = Record<string, string | undefined>;

const th = "px-3 py-2 text-start font-medium";
const td = "px-3 py-2";
const num = "px-3 py-2 text-end tabular-nums";
const box = "overflow-x-auto rounded-xl border border-border";
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const T = (s: Text) => tr(locale, s.ar, s.en);
  const today = ledgerToday();
  const p = parseStatementsParams(sp, today);
  const book = await pickBook(supabase, p.kind, user.id, p.bookId);

  const back = (
    <Link href={`/books${p.kind ? `?book=${p.kind}` : ""}`} className="text-sm text-primary underline print:hidden">
      ← {t("دفتر الحسابات", "Books")}
    </Link>
  );
  if (!book) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {back}
        <h1 className="mt-3 text-2xl font-bold">{t("القوائم الماليّة", "Financial statements")}</h1>
        <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm leading-7">
          {p.bookId
            ? t("هذا الدفتر ليس مفتوحاً لك: الفحص انتهت مدّته أو أُغلق، أو الرابط لدفترٍ آخر.", "This book is not open to you: the inspection has ended or been closed, or the link is to another book.")
            : t(
                "لا دفتر لك بعد. يُفتح دفتر مزرعتك وحده حين تسجّل أوّل مصروف أو إيراد في أحد مواسمك.",
                "You have no book yet. Your farm book opens by itself when you record the first cost or sale in one of your seasons.",
              )}
        </p>
      </div>
    );
  }

  const seasons = await seasonOptions(supabase, book);
  let b: StatementsBundle | null = null;
  try {
    b = await loadStatements(supabase, book, p, today, user.id);
  } catch (e) {
    console.error("statements failed", { basis: p.basis, e });
  }
  const query = statementsQuery(p, today);
  const compare = !!b?.previous;
  const years = Array.from({ length: Math.min(12, Number(today.slice(0, 4)) - 2023) }, (_, i) => Number(today.slice(0, 4)) - i);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:max-w-6xl">
      {back}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("القوائم الماليّة", "Financial statements")}</h1>
          <p className="mt-1 text-sm text-muted">
            {b ? T(b.book.heading) : ""}
            {b?.book.ownerName ? ` · ${b.book.ownerName}` : ""}
            {" · "}
            {t("كلّ المبالغ بالدولار", "all amounts in US dollars")}
          </p>
        </div>
        {b && (
          <a
            href={`/books/statements/pdf${query}`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 print:hidden"
          >
            {t("حمّل الحزمة PDF", "Download the PDF bundle")}
          </a>
        )}
      </div>

      <form method="get" action="/books/statements" className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 print:hidden">
        {p.kind && <input type="hidden" name="book" value={p.kind} />}
        {p.bookId && <input type="hidden" name="id" value={p.bookId} />}
        <label className="flex flex-col gap-1 text-xs">
          {t("الفترة", "Period")}
          <select name="basis" defaultValue={p.basis} className={field}>
            <option value="year">{t("سنة", "A year")}</option>
            <option value="month">{t("شهر", "A month")}</option>
            {seasons.length > 0 && <option value="season">{t("موسم", "A season")}</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("السنة", "Year")}
          <select name="y" defaultValue={String(p.year)} className={field}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("الشهر", "Month")}
          <input type="month" name="m" defaultValue={p.month} max={today.slice(0, 7)} className={field} />
        </label>
        {seasons.length > 0 && (
          <label className="flex flex-col gap-1 text-xs">
            {t("الموسم", "Season")}
            <select name="s" defaultValue={p.season ?? seasons[0].id} className={field}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.planting_date})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs">
          {t("المقارنة", "Comparison")}
          <select name="compare" defaultValue={p.compare ? "1" : "0"} className={field}>
            <option value="1">{t("بالفترة السابقة", "With the previous period")}</option>
            <option value="0">{t("بلا مقارنة", "None")}</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("اعرض", "Show")}
        </button>
      </form>

      <p className="mt-3 text-xs text-muted">
        {t(
          "الشهر والسنة تقابلهما الأيّام نفسها قبل شهرٍ أو سنة؛ والموسم يقابله الموسم الذي زُرع قبله. حساباتٌ إداريّة، لا قوائم قانونيّة مدقَّقة.",
          "A month or a year is compared with the same days a month or a year before; a season with the season planted before it. Management accounts, not audited statutory statements.",
        )}
      </p>

      {!b ? (
        <p className="mt-6 rounded-2xl border border-danger/40 bg-card p-4 text-sm text-danger" role="alert">
          {t("تعذّر تحميل القوائم الآن. أعد المحاولة بعد قليل.", "The statements could not be loaded just now. Please try again shortly.")}
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <p className="text-sm">
            <span className="font-medium">{T(periodLabel(b.current, b.basis))}</span>
            {b.previous && (
              <span className="text-muted">
                {" "}
                · {t("مقارنةً بـ", "compared with")} {T(periodLabel(b.previous, b.basis))}
              </span>
            )}
          </p>

          <Statement title={t("قائمة الدخل", "Income statement")} compare={compare} t={t}>
            <Head title={t("الإيراد", "Revenue")} compare={compare} />
            <Lines lines={b.income.revenue} compare={compare} T={T} />
            <Row label={t("مجموع الإيراد", "Total revenue")} v={b.income.totalRevenue} compare={compare} strong />
            <Head title={t("المصروف", "Expenses")} compare={compare} />
            <Lines lines={b.income.expense} compare={compare} T={T} />
            <Row label={t("مجموع المصروف", "Total expenses")} v={b.income.totalExpense} compare={compare} strong />
            <Row label={t("صافي الدخل", "Net income")} v={b.income.net} compare={compare} strong />
          </Statement>

          <Statement
            title={t("الميزانيّة", "Balance sheet")}
            sub={`${t("في", "At")} ${b.current.to}${b.previous ? ` · ${t("مقارنةً بـ", "against")} ${b.previous.to}` : ""}`}
            compare={compare}
            t={t}
            verdict={{ ok: b.balance.balanced, good: t("متوازنة: الأصول = الالتزامات + الملكيّة", "Balanced: assets equal liabilities plus equity"), bad: t("غير متوازنة — أبلغ الإدارة", "Not balanced — tell the administrators") }}
          >
            <Head title={t("الأصول", "Assets")} compare={compare} />
            <Lines lines={b.balance.assets} compare={compare} T={T} />
            <Row label={t("مجموع الأصول", "Total assets")} v={b.balance.totalAssets} compare={compare} strong />
            <Head title={t("الالتزامات", "Liabilities")} compare={compare} />
            <Lines lines={b.balance.liabilities} compare={compare} T={T} />
            <Row label={t("مجموع الالتزامات", "Total liabilities")} v={b.balance.totalLiabilities} compare={compare} strong />
            <Head title={t("حقوق الملكيّة", "Equity")} compare={compare} />
            <Lines lines={b.balance.equity} compare={compare} T={T} />
            <Row label={t("مجموع الملكيّة", "Total equity")} v={b.balance.totalEquity} compare={compare} strong />
          </Statement>

          <Statement
            title={t("التدفّقات النقديّة", "Cash flow")}
            compare={compare}
            t={t}
            verdict={{ ok: b.cash.ties, good: t("النقد أوّل الفترة + الحركة = النقد آخرها", "Opening cash plus the movement equals closing cash"), bad: t("لا يتطابق النقد — أبلغ الإدارة", "Cash does not tie — tell the administrators") }}
          >
            <Head title={t("تشغيليّة", "Operating")} compare={compare} />
            <Lines lines={b.cash.operating} compare={compare} T={T} />
            <Row label={t("صافي التشغيليّة", "Net operating")} v={b.cash.totalOperating} compare={compare} strong />
            <Head title={t("استثماريّة", "Investing")} compare={compare} />
            <Lines lines={b.cash.investing} compare={compare} T={T} />
            <Row label={t("صافي الاستثماريّة", "Net investing")} v={b.cash.totalInvesting} compare={compare} strong />
            <Head title={t("تمويليّة", "Financing")} compare={compare} />
            <Lines lines={b.cash.financing} compare={compare} T={T} />
            <Row label={t("صافي التمويليّة", "Net financing")} v={b.cash.totalFinancing} compare={compare} strong />
            <Row label={t("النقد أوّل الفترة", "Cash at the start")} v={b.cash.opening} compare={compare} />
            <Row label={t("النقد آخر الفترة", "Cash at the end")} v={b.cash.closing} compare={compare} strong />
          </Statement>

          <section>
            <h2 className="text-lg font-bold">{t("قائمة التغيّر في حقوق الملكيّة", "Statement of changes in equity")}</h2>
            <p className="mt-1 text-xs text-muted">
              {b.current.from} — {b.current.to}
            </p>
            <div className={`mt-2 ${box}`}>
              <table className="w-full text-sm">
                <tbody>
                  {b.equity.rows.map((r) => (
                    <tr key={r.line} className={`border-t border-border first:border-t-0 ${r.line === "opening" || r.line === "closing" ? "bg-card font-bold" : ""}`}>
                      <td className={td}>{T(r.name)}</td>
                      <td className={num}>{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Verdict ok={b.equity.closesToBalance} good={t("الملكيّة آخر الفترة = مجموع الملكيّة في الميزانيّة", "Closing equity equals the balance sheet's equity")} bad={t("لا تطابق الميزانيّة — أبلغ الإدارة", "Does not agree with the balance sheet — tell the administrators")} />
          </section>

          <section>
            <h2 className="text-lg font-bold">{t("أعمار الذمم", "Ageing of what is owed")}</h2>
            <p className="mt-1 text-xs leading-6 text-muted">
              {t(
                `في ${b.ageing.asOf}. العمر من يوم القيد (لا يحمل الدفتر تاريخ استحقاق)؛ سداد القيد الآجل يُطرح منه هو، وما سواه من الأقدم أوّلاً. المجموع رصيد الحساب في الميزانيّة.`,
                `At ${b.ageing.asOf}. Age from the day of the entry (the book holds no due date); a credit entry's own settlement comes off it, anything else off the oldest first. The total is the account's balance on the balance sheet.`,
              )}
            </p>
            <Ageing side={b.ageing.receivable} title={t("لك على غيرك (مدينون)", "Owed to you (receivables)")} T={T} t={t} />
            <Ageing side={b.ageing.payable} title={t("عليك لغيرك (دائنون)", "You owe (payables)")} T={T} t={t} />
          </section>

          {b.budget.length > 0 && (
            <section>
              <h2 className="text-lg font-bold">{t("الميزانيّة التقديريّة مقابل الفعليّ", "Budget against actual")}</h2>
              <p className="mt-1 text-xs text-muted">
                {t(
                  "لكلّ مرحلة خطّتها وما قُيِّد عليها في الدفتر بالدولار؛ وما لم يُنسب إلى مرحلةٍ سطرٌ وحده لا يُوزَّع بالتخمين.",
                  "For each stage its plan and what the book recorded against it in dollars; what was not put to a stage is a line of its own, not shared out by guess.",
                )}
              </p>
              {b.budget.map((s) => (
                <div key={s.seasonId} className={`mt-3 ${box}`}>
                  <table className="w-full text-sm">
                    <thead className="bg-card">
                      <tr>
                        <th className={th}>{s.name}</th>
                        <th className={`${th} text-end`}>{t("الخطّة", "Plan")}</th>
                        <th className={`${th} text-end`}>{t("الفعليّ", "Actual")}</th>
                        <th className={`${th} text-end`}>{t("الباقي أو التجاوز", "Left or over")}</th>
                        <th className={`${th} text-end`}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.stages, { stageKey: "_total", name: { ar: "مجموع الموسم", en: "Season total" }, budget: s.budget, actual: s.actual, variance: s.variance, usedPct: s.usedPct }].map((st) => (
                        <tr key={st.stageKey ?? "_none"} className={`border-t border-border ${st.stageKey === "_total" ? "bg-card font-bold" : ""}`}>
                          <td className={td}>{T(st.name)}</td>
                          <td className={num}>{money(st.budget)}</td>
                          <td className={num}>{money(st.actual)}</td>
                          <td className={`${num} ${st.variance < BigInt(0) ? "text-danger" : ""}`}>{money(st.variance)}</td>
                          <td className={`${num} text-muted`}>{st.usedPct === null ? "—" : `${st.usedPct.toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          )}

          <section>
            <h2 className="text-lg font-bold">{t("إيضاحات", "Notes")}</h2>
            <ol className="mt-2 list-decimal space-y-3 ps-6 text-sm leading-7">
              {b.notes.map((n) => (
                <li key={n.title.en}>
                  <span className="font-bold">{T(n.title)}.</span> {T(n.body)}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 text-sm">
            <h2 className="font-bold">{t("بصمة الأرقام", "Fingerprint of the figures")}</h2>
            <p className="mt-1 break-all font-mono text-xs" dir="ltr">
              SHA-256 {fingerprintGroups(b.fingerprint)}
            </p>
            <p className="mt-2 text-xs leading-6 text-muted">
              {t(
                "هي نفسها المطبوعة في كلّ صفحةٍ من الحزمة PDF لهذه الفترة. إن تطابقت فأرقام الورق هي أرقام الدفتر الآن؛ وإن اختلفت فقد تغيّر في الدفتر شيءٌ بعد طباعتها (قيدٌ جديد أو عكسٌ في الفترة).",
                "It is the same one printed on every page of this period's PDF bundle. If they match, the figures on paper are the book's figures now; if not, something in the book changed after it was printed (a new entry or a reversal in the period).",
              )}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Statement({
  title,
  sub,
  compare,
  t,
  verdict,
  children,
}: {
  title: string;
  sub?: string;
  compare: boolean;
  t: (ar: string, en: string) => string;
  verdict?: { ok: boolean; good: string; bad: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
      <div className={`mt-2 ${box}`}>
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr>
              <th className={th}>{t("البند", "Item")}</th>
              <th className={`${th} text-end`}>{compare ? t("هذه الفترة", "This period") : t("المبلغ", "Amount")}</th>
              {compare && (
                <>
                  <th className={`${th} text-end`}>{t("السابقة", "Previous")}</th>
                  <th className={`${th} text-end`}>{t("التغيّر", "Change")}</th>
                  <th className={`${th} text-end`}>%</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {verdict && <Verdict {...verdict} />}
    </section>
  );
}

function Head({ title, compare }: { title: string; compare: boolean }) {
  return (
    <tr className="border-t border-border bg-card/60">
      <td className="px-3 py-2 font-bold" colSpan={compare ? 5 : 2}>
        {title}
      </td>
    </tr>
  );
}

function Lines({ lines, compare, T }: { lines: Line[]; compare: boolean; T: (s: Text) => string }) {
  return (
    <>
      {lines.map((l) => (
        <Row key={`${l.code}-${l.name.ar}`} label={T(l.name)} code={l.code} v={l.v} compare={compare} />
      ))}
    </>
  );
}

function Row({ label, code, v, compare, strong }: { label: string; code?: string; v: Pair; compare: boolean; strong?: boolean }) {
  const sign = (x: bigint | null) => (x === null ? "—" : `${x > BigInt(0) ? "+" : ""}${money(x)}`);
  return (
    <tr className={`border-t border-border ${strong ? "bg-card font-bold" : ""}`}>
      <td className={td}>
        {code && !code.startsWith("_") && !code.startsWith("399") && <span className="me-2 text-xs text-muted tabular-nums">{code}</span>}
        {label}
      </td>
      <td className={num}>{money(v.current)}</td>
      {compare && (
        <>
          <td className={num}>{v.previous === null ? "—" : money(v.previous)}</td>
          <td className={num}>{sign(v.change)}</td>
          <td className={`${num} text-muted`}>{v.pct === null ? "—" : `${v.pct > 0 ? "+" : ""}${v.pct.toFixed(1)}%`}</td>
        </>
      )}
    </tr>
  );
}

function Ageing({ side, title, T, t }: { side: AgeingSide; title: string; T: (s: Text) => string; t: (ar: string, en: string) => string }) {
  const keys = BUCKETS.filter((k) => k !== "advance" || side.buckets.advance !== BigInt(0));
  return (
    <div className={`mt-3 ${box}`}>
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr>
            <th className={th}>{title}</th>
            {keys.map((k) => (
              <th key={k} className={`${th} text-end`}>
                {T(BUCKET_LABEL[k])}
              </th>
            ))}
            <th className={`${th} text-end`}>{t("المجموع", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {side.accounts.length === 0 ? (
            <tr className="border-t border-border">
              <td className={`${td} text-muted`} colSpan={keys.length + 2}>
                {t("لا شيء.", "Nothing.")}
              </td>
            </tr>
          ) : (
            [...side.accounts.map((a) => ({ key: a.code, label: `${T(a.name)} (${a.code})`, buckets: a.buckets, total: a.total, strong: false })), { key: "_t", label: t("المجموع", "Total"), buckets: side.buckets, total: side.total, strong: true }].map((r) => (
              <tr key={r.key} className={`border-t border-border ${r.strong ? "bg-card font-bold" : ""}`}>
                <td className={td}>{r.label}</td>
                {keys.map((k) => (
                  <td key={k} className={`${num} ${k === "90_plus" && r.buckets[k] > BigInt(0) ? "text-danger" : ""}`}>
                    {money(r.buckets[k])}
                  </td>
                ))}
                <td className={num}>{money(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Verdict({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <p className={`mt-2 rounded-xl border px-3 py-2 text-sm ${ok ? "border-primary/40 text-primary" : "border-danger/40 text-danger"}`} role={ok ? "status" : "alert"}>
      {ok ? "✓ " : "⚠ "}
      {ok ? good : bad}
    </p>
  );
}
