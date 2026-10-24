import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { ledgerToday } from "@/lib/ledger/today";
import { loadReport, pickBook } from "@/lib/ledger/load";
import ActionNotice from "@/components/ActionNotice";
import LinksPanel from "@/components/books/LinksPanel";
import type { LinkRow } from "@/lib/ledgerLinks";
import { PAGE_SIZE, parseReportParams, reportHref, type ReportKey, type ReportParams } from "@/lib/ledger/reportParams";
import { money } from "@/lib/ledger/reports";
import type { ChartRow, ReportData } from "@/lib/ledger/reportData";

type SP = Record<string, string | undefined>;

const TABS: { key: ReportKey; ar: string; en: string }[] = [
  { key: "trial", ar: "ميزان المراجعة", en: "Trial balance" },
  { key: "income", ar: "قائمة الدخل", en: "Income statement" },
  { key: "balance", ar: "الميزانيّة", en: "Balance sheet" },
  { key: "cash", ar: "التدفّقات النقديّة", en: "Cash flow" },
  { key: "seasons", ar: "ربحيّة المواسم", en: "Season profit" },
  { key: "journal", ar: "اليوميّة", en: "Journal" },
  { key: "chart", ar: "شجرة الحسابات", en: "Chart of accounts" },
  { key: "links", ar: "اقتراحات الشريك", en: "Partner proposals" },
];

const TYPE: Record<string, { ar: string; en: string }> = {
  asset: { ar: "أصل", en: "Asset" },
  liability: { ar: "التزام", en: "Liability" },
  equity: { ar: "ملكيّة", en: "Equity" },
  revenue: { ar: "إيراد", en: "Revenue" },
  expense: { ar: "مصروف", en: "Expense" },
};

const th = "px-3 py-2 text-start font-medium";
const td = "px-3 py-2";
const num = "px-3 py-2 text-end tabular-nums";
const box = "overflow-x-auto rounded-xl border border-border";
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export default async function BooksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const today = ledgerToday();
  const p = parseReportParams(sp, today);
  const name = (r: { name_ar: string; name_en: string }) => (locale === "en" && r.name_en ? r.name_en : r.name_ar);
  const arText = (r: { name_en: string }) => (locale === "en" && !r.name_en ? ({ lang: "ar", dir: "rtl" } as const) : {});

  const book = await pickBook(supabase, p.kind);

  // What the partners in my agreements proposed to book in both books. It belongs to the person, not to a book:
  // a proposal can wait for someone whose book is not yet opened.
  const { data: linkRows } = await supabase.rpc("ledger_links_list");
  const links = (linkRows ?? []) as LinkRow[];
  const waitingForMe = links.filter((l) => l.status === "pending" && !l.mine).length;

  if (!book && p.report !== "links") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t("دفتر الحسابات", "Books")}</h1>
        <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm leading-7">
          {t(
            "لا دفتر لك بعد. يُفتح دفتر مزرعتك وحده حين تسجّل أوّل مصروف أو إيراد في أحد مواسمك.",
            "You have no book yet. Your farm book opens by itself when you record the first cost or sale in one of your seasons.",
          )}
        </p>
        <Link href="/seasons" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("مواسمي", "My seasons")}
        </Link>
      </div>
    );
  }

  let data: ReportData | null = null;
  if (book && p.report !== "links") {
    try {
      data = await loadReport(supabase, book, { ...p, report: p.report });
    } catch (e) {
      console.error("books report failed", { report: p.report, e });
    }
  }
  // `loadReport` falls back to the chart when an account is not found; the page follows what it got.
  const shown: ReportKey = p.report === "links" ? "links" : (data?.kind ?? p.report);

  const link = (patch: Partial<ReportParams> & { report: ReportKey }) =>
    reportHref("/books", { kind: p.kind, from: p.from, to: p.to, asOf: p.asOf, ...patch }, today);
  const exportLink = reportHref("/books/export", { ...p, report: shown, page: 1 }, today);
  const usesPeriod = ["income", "cash", "seasons", "journal", "account"].includes(shown);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("دفتر الحسابات", "Books")}</h1>
          <p className="mt-1 text-sm text-muted">
            {!book
              ? t("لم يُفتح لك دفتر بعد", "No book opened for you yet")
              : book.kind === "platform"
                ? t("دفتر المنصّة", "The platform's book")
                : book.kind === "investor"
                  ? t("دفتر المستثمر", "Investor book")
                  : t("دفتر مزرعتك", "Your farm book")}
            {" · "}
            {t("كلّ المبالغ بالدولار", "all amounts in US dollars")}
            {book?.closed_through && ` · ${t("مقفل حتى", "closed through")} ${book.closed_through}`}
          </p>
        </div>
        {data && (
          <a href={exportLink} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-card">
            {t("تصدير CSV", "Export CSV")}
          </a>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        {t(
          "حسابات إداريّة تساعدك على المتابعة، وليست قوائم قانونيّة مدقَّقة.",
          "Management accounts to help you keep track — not audited statutory statements.",
        )}
      </p>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label={t("التقارير", "Reports")}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={link({ report: tab.key, page: 1 })}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
              shown === tab.key || (shown === "account" && tab.key === "chart")
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-card"
            }`}
          >
            {t(tab.ar, tab.en)}
            {tab.key === "links" && waitingForMe > 0 && (
              <span className="ms-1.5 rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white">{waitingForMe}</span>
            )}
          </Link>
        ))}
      </nav>

      {shown !== "links" && (
      <form method="get" action="/books" className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <input type="hidden" name="r" value={shown} />
        {p.kind && <input type="hidden" name="book" value={p.kind} />}
        {p.account && shown === "account" && <input type="hidden" name="a" value={p.account} />}
        {usesPeriod ? (
          <>
            <label className="flex flex-col gap-1 text-xs">
              {t("من", "From")}
              <input type="date" name="from" defaultValue={p.from} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t("إلى", "To")}
              <input type="date" name="to" defaultValue={p.to} className={field} />
            </label>
          </>
        ) : shown === "chart" ? null : (
          <label className="flex flex-col gap-1 text-xs">
            {t("حتى يوم", "As of")}
            <input type="date" name="as_of" defaultValue={p.asOf} className={field} />
          </label>
        )}
        {shown !== "chart" && (
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {t("اعرض", "Show")}
          </button>
        )}
      </form>
      )}

      <div className="mt-4">
        <ActionNotice ok={sp.ok} error={sp.error} />
      </div>

      {shown === "links" ? (
        <div className="mt-2">
          <LinksPanel rows={links} locale={locale} returnTo="/books?r=links" />
        </div>
      ) : !data ? (
        <p className="mt-6 rounded-2xl border border-danger/40 bg-card p-4 text-sm text-danger" role="alert">
          {t("تعذّر تحميل التقرير الآن. أعد المحاولة بعد قليل.", "The report could not be loaded just now. Please try again shortly.")}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {data.kind === "trial" && (
            <>
              <Verdict ok={data.trial.balanced} good={t("الميزان متوازن: المدين = الدائن", "Balanced: debits equal credits")} bad={t("الميزان غير متوازن — أبلغ الإدارة", "Not balanced — tell the administrators")} />
              <div className={box}>
                <table className="w-full text-sm">
                  <thead className="bg-card">
                    <tr>
                      <th className={th}>{t("الرمز", "Code")}</th>
                      <th className={th}>{t("الحساب", "Account")}</th>
                      <th className={th}>{t("مدين", "Debit")}</th>
                      <th className={th}>{t("دائن", "Credit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trial.rows.map((r) => (
                      <tr key={r.code} className="border-t border-border">
                        <td className={td}>{r.code}</td>
                        <td className={td} {...arText(r)}>{name(r)}</td>
                        <td className={num}>{r.debit_balance ? money(r.debit_balance) : ""}</td>
                        <td className={num}>{r.credit_balance ? money(r.credit_balance) : ""}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border bg-card font-bold">
                      <td className={td} colSpan={2}>{t("المجموع", "Total")}</td>
                      <td className={num}>{money(data.trial.totalDebit)}</td>
                      <td className={num}>{money(data.trial.totalCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {data.trial.memo.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-bold">{t("حسابات إحصائيّة (خارج الميزانيّة)", "Statistical accounts (off balance sheet)")}</h2>
                  <div className={box}>
                    <table className="w-full text-sm">
                      <tbody>
                        {data.trial.memo.map((r) => (
                          <tr key={r.code} className="border-t border-border first:border-t-0">
                            <td className={td}>{r.code}</td>
                            <td className={td} {...arText(r)}>{name(r)}</td>
                            <td className={num}>{r.debit_balance ? money(r.debit_balance) : ""}</td>
                            <td className={num}>{r.credit_balance ? money(r.credit_balance) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {data.kind === "income" && (
            <div className={box}>
              <table className="w-full text-sm">
                <tbody>
                  <Section title={t("الإيرادات", "Revenue")} />
                  {data.statement.revenue.map((r) => (
                    <tr key={r.code} className="border-t border-border">
                      <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                      <td className={num}>{money(r.amount)}</td>
                    </tr>
                  ))}
                  <Total label={t("مجموع الإيراد", "Total revenue")} value={money(data.statement.totalRevenue)} />
                  <Section title={t("التكاليف والمصروفات", "Costs and expenses")} />
                  {data.statement.expense.map((r) => (
                    <tr key={r.code} className="border-t border-border">
                      <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                      <td className={num}>{money(r.amount)}</td>
                    </tr>
                  ))}
                  <Total label={t("مجموع المصروف", "Total expense")} value={money(data.statement.totalExpense)} />
                  <Total label={t("صافي الدخل", "Net income")} value={money(data.statement.netIncome)} strong />
                </tbody>
              </table>
              <p className="border-t border-border px-3 py-2 text-xs text-muted">
                {t(
                  "تكلفة المواسم الجارية تُرسمل (حساب ٥٩٠٠ سالب) فلا تظهر مصروفاً حتى يُقفل الموسم وتصير «تكلفة المحصول المباع».",
                  "The cost of seasons still running is capitalised (account 5900, negative), so it shows as an expense only once the season closes and becomes the cost of the crop sold.",
                )}
              </p>
            </div>
          )}

          {data.kind === "balance" && (
            <>
              <Verdict ok={data.sheet.balanced} good={t("الميزانيّة متوازنة: الأصول = الالتزامات + الملكيّة", "Balanced: assets equal liabilities plus equity")} bad={t("الميزانيّة غير متوازنة — أبلغ الإدارة", "Not balanced — tell the administrators")} />
              <div className={box}>
                <table className="w-full text-sm">
                  <tbody>
                    <Section title={t("الأصول", "Assets")} />
                    {data.sheet.assets.map((r) => (
                      <tr key={r.code} className="border-t border-border">
                        <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                        <td className={num}>{money(r.balance)}</td>
                      </tr>
                    ))}
                    <Total label={t("مجموع الأصول", "Total assets")} value={money(data.sheet.totalAssets)} strong />
                    <Section title={t("الالتزامات", "Liabilities")} />
                    {data.sheet.liabilities.map((r) => (
                      <tr key={r.code} className="border-t border-border">
                        <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                        <td className={num}>{money(r.balance)}</td>
                      </tr>
                    ))}
                    <Total label={t("مجموع الالتزامات", "Total liabilities")} value={money(data.sheet.totalLiabilities)} />
                    <Section title={t("الملكيّة", "Equity")} />
                    {data.sheet.equity.map((r) => (
                      <tr key={r.code} className="border-t border-border">
                        <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                        <td className={num}>{money(r.balance)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                      <td className={td}>{t("صافي الدخل حتى هذا اليوم (لم يُقفل)", "Net income to date (not yet closed)")}</td>
                      <td className={num}>{money(data.sheet.netIncome)}</td>
                    </tr>
                    <Total label={t("مجموع الملكيّة", "Total equity")} value={money(data.sheet.totalEquityWithIncome)} />
                    <Total label={t("الالتزامات + الملكيّة", "Liabilities + equity")} value={money(data.sheet.totalLiabilities + data.sheet.totalEquityWithIncome)} strong />
                  </tbody>
                </table>
              </div>
            </>
          )}

          {data.kind === "cash" && (
            <>
              <Verdict ok={data.flow.ties} good={t("الحركة تطابق رصيد النقد: أوّل الفترة + الحركة = آخرها", "The movement matches the cash balance: opening + movement = closing")} bad={t("الحركة لا تطابق رصيد النقد — أبلغ الإدارة", "The movement does not match the cash balance — tell the administrators")} />
              <div className={box}>
                <table className="w-full text-sm">
                  <tbody>
                    <Total label={t("رصيد النقد أوّل الفترة", "Cash at the start")} value={money(data.flow.opening)} />
                    {(
                      [
                        ["operating", t("أنشطة التشغيل", "Operating"), data.flow.operating, data.flow.totalOperating],
                        ["investing", t("أنشطة الاستثمار", "Investing"), data.flow.investing, data.flow.totalInvesting],
                        ["financing", t("أنشطة التمويل", "Financing"), data.flow.financing, data.flow.totalFinancing],
                      ] as const
                    ).map(([key, title, rows, total]) => (
                      <FlowSection key={key} title={title} total={money(total)} totalLabel={t("الصافي", "Net")}>
                        {rows.map((r) => (
                          <tr key={r.code} className="border-t border-border">
                            <td className={td} {...arText(r)}>{r.code} · {name(r)}</td>
                            <td className={num}>{money(r.amount)}</td>
                          </tr>
                        ))}
                      </FlowSection>
                    ))}
                    <Total label={t("صافي حركة النقد", "Net movement")} value={money(data.flow.net)} />
                    <Total label={t("رصيد النقد آخر الفترة", "Cash at the end")} value={money(data.flow.closing)} strong />
                  </tbody>
                </table>
              </div>
            </>
          )}

          {data.kind === "seasons" && (
            <div className={box}>
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className={th}>{t("الموسم", "Season")}</th>
                    <th className={th}>{t("الإيراد", "Revenue")}</th>
                    <th className={th}>{t("المصروف", "Expense")}</th>
                    <th className={th}>{t("الربح", "Profit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td className={td} colSpan={4}>{t("لا حركة في هذه الفترة.", "No activity in this period.")}</td>
                    </tr>
                  )}
                  {data.rows.map((r) => (
                    <tr key={r.season_id ?? "none"} className="border-t border-border">
                      <td className={td}>{r.season_id ? <Link className="text-primary hover:underline" href={`/seasons/${r.season_id}`}>{r.name}</Link> : r.name}</td>
                      <td className={num}>{money(r.revenue)}</td>
                      <td className={num}>{money(r.expense)}</td>
                      <td className={`${num} font-bold`}>{money(BigInt(Math.round(r.revenue)) - BigInt(Math.round(r.expense)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-3 py-2 text-xs text-muted">
                {t(
                  "الموسم الجاري لا يُظهر مصروفاً لأنّ تكلفته مرسملة؛ يظهر ربحه الحقيقيّ حين يُقفل.",
                  "A running season shows no expense because its cost is capitalised; its real profit shows once it is closed.",
                )}
              </p>
            </div>
          )}

          {data.kind === "journal" && (
            <>
              {data.entries.length === 0 && <p className="text-sm text-muted">{t("لا قيود في هذه الفترة.", "No entries in this period.")}</p>}
              {data.entries.map((e) => (
                <article key={e.id} className="rounded-2xl border border-border bg-card p-3">
                  <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold">
                      #{e.entry_no} · {e.entry_date}
                      {e.reversal_of && <span className="ms-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{t("قيد عاكس", "Reversal")}</span>}
                    </span>
                    <span className="text-muted">{e.memo}</span>
                  </header>
                  <div className={`${box} mt-2`}>
                    <table className="w-full text-sm">
                      <tbody>
                        {e.lines.map((l) => (
                          <tr key={l.line_no} className="border-t border-border first:border-t-0">
                            <td className={td}>{l.code} · {l.account}</td>
                            <td className={num}>{l.side === "D" ? money(l.base_minor) : ""}</td>
                            <td className={num}>{l.side === "C" ? money(l.base_minor) : ""}</td>
                            <td className="px-3 py-2 text-end text-xs text-muted tabular-nums">
                              {l.currency !== "USD" ? `${money(l.amount_minor)} ${l.currency}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
              <div className="flex justify-between text-sm">
                {p.page > 1 ? (
                  <Link className="text-primary hover:underline" href={link({ report: "journal", page: p.page - 1 })}>{t("→ الأحدث", "← Newer")}</Link>
                ) : <span />}
                {data.hasMore && (
                  <Link className="text-primary hover:underline" href={link({ report: "journal", page: p.page + 1 })}>{t("الأقدم ←", "Older →")}</Link>
                )}
              </div>
              <p className="text-xs text-muted">{t(`${PAGE_SIZE} قيداً في الصفحة، من الأحدث.`, `${PAGE_SIZE} entries a page, newest first.`)}</p>
            </>
          )}

          {data.kind === "chart" && (
            <div className={box}>
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className={th}>{t("الرمز", "Code")}</th>
                    <th className={th}>{t("الحساب", "Account")}</th>
                    <th className={th}>{t("النوع", "Type")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <ChartLine key={a.id} a={a} nameText={name(a)} typeText={t(TYPE[a.type]?.ar ?? a.type, TYPE[a.type]?.en ?? a.type)} href={link({ report: "account", account: a.id, page: 1 })} inactive={t("موقوف", "inactive")} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.kind === "account" && (
            <>
              <h2 className="text-lg font-bold" {...arText(data.account)}>{data.account.code} · {name(data.account)}</h2>
              <div className={box}>
                <table className="w-full text-sm">
                  <thead className="bg-card">
                    <tr>
                      <th className={th}>{t("التاريخ", "Date")}</th>
                      <th className={th}>{t("البيان", "Memo")}</th>
                      <th className={th}>{t("الحركة", "Movement")}</th>
                      <th className={th}>{t("الرصيد", "Balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className={td}>{r.entry_date}{r.entry_no ? ` · #${r.entry_no}` : ""}</td>
                        <td className={td}>{r.memo}</td>
                        <td className={num}>{r.row_type === "line" ? money(r.signed_base) : ""}</td>
                        <td className={`${num} font-bold`}>{money(r.running_base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link className="text-sm text-primary hover:underline" href={link({ report: "chart" })}>{t("← شجرة الحسابات", "← Chart of accounts")}</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Verdict({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <p className={`rounded-xl border px-3 py-2 text-sm ${ok ? "border-primary/40 text-primary" : "border-danger/40 text-danger"}`} role={ok ? "status" : "alert"}>
      {ok ? "✓ " : "⚠ "}
      {ok ? good : bad}
    </p>
  );
}

function Section({ title }: { title: string }) {
  return (
    <tr className="bg-card">
      <td className="px-3 py-2 font-bold" colSpan={2}>{title}</td>
    </tr>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={`border-t border-border ${strong ? "bg-card font-bold" : "font-medium"}`}>
      <td className={td}>{label}</td>
      <td className={num}>{value}</td>
    </tr>
  );
}

function FlowSection({ title, total, totalLabel, children }: { title: string; total: string; totalLabel: string; children: React.ReactNode }) {
  return (
    <>
      <Section title={title} />
      {children}
      <Total label={totalLabel} value={total} />
    </>
  );
}

function ChartLine({ a, nameText, typeText, href, inactive }: { a: ChartRow; nameText: string; typeText: string; href: string; inactive: string }) {
  const depth = Math.max(0, a.code.length - 1);
  return (
    <tr className={`border-t border-border ${a.postable ? "" : "bg-card font-medium"}`}>
      <td className={td}>{a.code}</td>
      <td className={td} style={{ paddingInlineStart: `${0.75 + Math.min(depth, 4) * 0.75}rem` }}>
        {a.postable ? <Link className="text-primary hover:underline" href={href}>{nameText}</Link> : nameText}
        {!a.active && <span className="ms-2 text-xs text-muted">({inactive})</span>}
      </td>
      <td className={td}>{typeText}</td>
    </tr>
  );
}
