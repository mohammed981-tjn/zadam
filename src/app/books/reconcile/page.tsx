import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import { ledgerToday } from "@/lib/ledger/today";
import { pickBook } from "@/lib/ledger/load";
import { BOOK_KINDS, isIsoDate, type BookKind } from "@/lib/ledger/reportParams";
import { formatMoney, isCurrency } from "@/lib/ledger/money";
import { candidatesFor, PROVIDERS, providerLabel, summarise, type ReconRow } from "@/lib/ledger/platformBook";
import { button, card, field, label } from "@/lib/ui";
import { deleteStatement, importStatement, matchLine, setProvider, unmatchLine } from "./actions";

/**
 * مطابقة الحساب النقديّ بكشف مزوّده (البند ١٨٩). The person picks one of his cash accounts, names its provider, uploads
 * the provider's CSV, and sees three lists: what is in both, what the statement has that the book does not (a movement
 * not yet recorded, or a fee the bank took), and what the book has that the statement does not. Nothing here writes in
 * the book: an unexplained line is fixed by recording it the usual way, in the season book.
 */

type SP = Record<string, string | undefined>;
type Account = { id: string; code: string; name_ar: string; name_en: string; system_key: string | null; provider: string | null; currency: string | null };
type Statement = { id: string; file_name: string; currency: string; rows_count: number; imported_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const th = "px-3 py-2 text-start font-medium";
const td = "px-3 py-2";
const num = "px-3 py-2 text-end tabular-nums";
const box = "overflow-x-auto rounded-xl border border-border";

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const today = ledgerToday();
  const kind = (BOOK_KINDS as readonly string[]).includes(sp.book ?? "") ? (sp.book as BookKind) : null;
  const book = await pickBook(supabase, kind, user.id, null);
  const mine = book && (book.kind === "platform" || book.owner_id === user.id);

  if (!book || !mine) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/books" className="text-sm text-primary underline">← {t("دفتر الحسابات", "Books")}</Link>
        <h1 className="mt-3 text-2xl font-bold">{t("مطابقة الكشف", "Match a statement")}</h1>
        <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm leading-7">
          {t("لا دفتر لك بعد. يُفتح دفتر مزرعتك حين تسجّل أوّل مصروفٍ أو إيراد في أحد مواسمك.", "You have no book yet. Your farm book opens when you record the first cost or sale in one of your seasons.")}
        </p>
      </div>
    );
  }

  const { data: accountRows } = await supabase
    .from("ledger_accounts")
    .select("id, code, name_ar, name_en, system_key, provider, currency")
    .eq("book_id", book.id)
    .eq("type", "asset")
    .eq("postable", true)
    .order("code");
  const accounts = ((accountRows ?? []) as Account[]).filter(
    (a) => a.provider !== null || ["cash_on_hand", "bank", "wallet"].includes(a.system_key ?? ""),
  );
  const chosen = accounts.find((a) => a.id === (sp.a && UUID.test(sp.a) ? sp.a.toLowerCase() : "")) ?? accounts.find((a) => a.system_key === "bank") ?? accounts[0];

  let from = isIsoDate(sp.from) ? sp.from : new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY).toISOString().slice(0, 10);
  let to = isIsoDate(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];

  const [{ data: reconData, error: reconError }, { data: stmtData }] = chosen
    ? await Promise.all([
        supabase.rpc("ledger_reconciliation", { p_account: chosen.id, p_from: from, p_to: to }),
        supabase.from("ledger_statements").select("id, file_name, currency, rows_count, imported_at").eq("account_id", chosen.id).order("imported_at", { ascending: false }).limit(20),
      ])
    : [{ data: [], error: null }, { data: [] }];
  const rows = (reconData ?? []) as ReconRow[];
  const statements = (stmtData ?? []) as Statement[];
  const sum = summarise(rows);
  const name = (a: Account) => (locale === "en" && a.name_en ? a.name_en : a.name_ar);
  const amount = (minor: number | bigint, cur: string) => (isCurrency(cur) ? formatMoney(BigInt(minor), cur) : String(minor));
  const hidden = (
    <>
      {kind && <input type="hidden" name="book" value={kind} />}
      {chosen && <input type="hidden" name="account" value={chosen.id} />}
    </>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/books${kind ? `?book=${kind}` : ""}`} className="text-sm text-primary underline">← {t("دفتر الحسابات", "Books")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("مطابقة الكشف", "Match a statement")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "ارفع كشف حسابك من مزوّده (بنكك أو MTN أو البنك) ملفَّ CSV، فتُطابَق سطوره بما سجّلته في دفترك. الكشف لا يكتب في دفترك شيئاً: ما تجده في الكشف وحده تسجّله أنت كالعادة في دفتر الموسم.",
          "Upload your account's statement from its provider (Bankak, MTN or the bank) as a CSV file, and its lines are matched with what you recorded in your book. The statement writes nothing in your book: what you find only in the statement, you record yourself as usual in the season book.",
        )}
      </p>

      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>

      {accounts.length === 0 ? (
        <p className={`${card} mt-4 text-sm`}>{t("لا حساب نقديّ في دفترك.", "There is no cash account in your book.")}</p>
      ) : (
        <>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label={t("الحسابات النقديّة", "Cash accounts")}>
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/books/reconcile?${new URLSearchParams({ ...(kind ? { book: kind } : {}), a: a.id }).toString()}`}
                className={`rounded-full border px-3 py-1.5 text-sm ${chosen?.id === a.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}
              >
                {a.code} · {name(a)}
                {a.provider && !["cash", "bank", "wallet"].includes(a.provider) && <span className="ms-1 opacity-80">({providerLabel(a.provider, locale)})</span>}
              </Link>
            ))}
          </nav>

          {chosen && (
            <section className="mt-5 grid gap-4 md:grid-cols-2">
              <form action={importStatement} className={`${card} flex flex-col gap-3`}>
                {hidden}
                <h2 className="font-bold">{t("ارفع كشفاً", "Upload a statement")}</h2>
                <label className={label}>
                  {t("ملفّ الكشف (CSV)", "Statement file (CSV)")}
                  <input type="file" name="file" accept=".csv,text/csv,text/plain" required className={field} />
                </label>
                <label className={label}>
                  {t("عملة الكشف", "Statement currency")}
                  <select name="currency" defaultValue={chosen.currency ?? "SDG"} className={field} disabled={!!chosen.currency}>
                    <option value="SDG">{t("جنيه سوداني", "Sudanese pound")}</option>
                    <option value="USD">{t("دولار", "US dollar")}</option>
                  </select>
                  {chosen.currency && <input type="hidden" name="currency" value={chosen.currency} />}
                </label>
                <p className="text-xs leading-6 text-muted">
                  {t(
                    "في السطر الأوّل أسماء الأعمدة: «التاريخ» و«المبلغ» (موجبٌ للداخل وسالبٌ للخارج)، أو «سحب» و«إيداع»؛ و«البيان» و«المرجع» إن وُجدا. ورفع الملفّ نفسه مرّةً ثانية لا يكرّر سطوره.",
                    "The first row names the columns: “Date” and “Amount” (positive in, negative out), or “Debit” and “Credit”; and “Description” and “Reference” if present. Uploading the same file again does not repeat its lines.",
                  )}
                </p>
                <button type="submit" className={`${button} self-start`}>{t("ارفع وطابق", "Upload and match")}</button>
              </form>

              <form action={setProvider} className={`${card} flex flex-col gap-3`}>
                {hidden}
                <h2 className="font-bold">{t("مزوّد هذا الحساب", "This account's provider")}</h2>
                <label className={label}>
                  {t("أين هذا الحساب؟", "Where is this account held?")}
                  <select name="provider" defaultValue={chosen.provider ?? ""} className={field}>
                    {PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>{locale === "en" ? p.en : p.ar}</option>
                    ))}
                  </select>
                </label>
                <p className="text-xs leading-6 text-muted">
                  {t(
                    "حسابك أنت عند مزوّده؛ المنصّة لا تمسك مالاً ولا تتّصل بالمزوّد. التسمية لتعرف أيّ كشفٍ تطابق بأيّ حساب.",
                    "Your own account with its provider; the platform holds no money and does not connect to the provider. The name is so you know which statement goes with which account.",
                  )}
                </p>
                <button type="submit" className={`${button} self-start`}>{t("احفظ", "Save")}</button>
              </form>
            </section>
          )}

          {chosen && (
            <form method="get" action="/books/reconcile" className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
              {kind && <input type="hidden" name="book" value={kind} />}
              <input type="hidden" name="a" value={chosen.id} />
              <label className="flex flex-col gap-1 text-xs">
                {t("من", "From")}
                <input type="date" name="from" defaultValue={from} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t("إلى", "To")}
                <input type="date" name="to" defaultValue={to} className={field} />
              </label>
              <button type="submit" className={button}>{t("اعرض", "Show")}</button>
            </form>
          )}

          {reconError ? (
            <p className="mt-6 rounded-2xl border border-danger/40 bg-card p-4 text-sm text-danger" role="alert">
              {t("تعذّر تحميل المطابقة الآن. أعد المحاولة بعد قليل.", "The match could not be loaded just now. Please try again shortly.")}
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label={t("في الاثنين", "In both")} value={sum.matched} />
                <Stat label={t("في الكشف وحده", "In the statement only")} value={sum.statementOnly} warn={sum.statementOnly > 0} />
                <Stat label={t("في الدفتر وحده", "In the book only")} value={sum.bookOnly} warn={sum.bookOnly > 0} />
              </div>
              {Object.entries(sum.totals).map(([cur, v]) => (
                <p key={cur} className="text-sm">
                  {t("الحركة في الفترة:", "Movement in the period:")} {t("الكشف", "statement")} <span className="figure font-bold">{amount(v.statement, cur)}</span>
                  {" · "}
                  {t("الدفتر", "book")} <span className="figure font-bold">{amount(v.book, cur)}</span>
                  {v.statement !== v.book && <span className="text-danger"> · {t("الفرق", "difference")} <span className="figure">{amount(v.statement - v.book, cur)}</span></span>}
                </p>
              ))}

              <ReconTable
                title={t("في الكشف وحده — حركةٌ لم تسجّلها، أو رسمٌ أخذه المزوّد", "In the statement only — a movement you have not recorded, or a charge the provider took")}
                rows={rows.filter((r) => r.status === "statement_only")}
                empty={t("لا شيء.", "Nothing.")}
                t={t}
                amount={amount}
                action={(r) => {
                  const options = candidatesFor(r, rows);
                  return options.length === 0 ? null : (
                    <form action={matchLine} className="flex flex-wrap items-center gap-2">
                      {hidden}
                      <input type="hidden" name="statement_line" value={r.statement_line ?? ""} />
                      <select name="journal_line" className={`${field} py-1 text-xs`}>
                        {options.map((o) => (
                          <option key={o.journal_line} value={o.journal_line ?? ""}>
                            #{o.entry_no} · {o.entry_date} · {o.memo}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs text-primary underline">{t("طابقه", "Match")}</button>
                    </form>
                  );
                }}
              />
              <ReconTable
                title={t("في الدفتر وحده — قيدٌ لم يظهر في الكشف بعد، أو سُجّل على حسابٍ آخر", "In the book only — an entry not in the statement yet, or recorded on another account")}
                rows={rows.filter((r) => r.status === "book_only")}
                empty={t("لا شيء.", "Nothing.")}
                t={t}
                amount={amount}
              />
              <ReconTable
                title={t("في الاثنين", "In both")}
                rows={rows.filter((r) => r.status === "matched")}
                empty={t("لا شيء بعد.", "Nothing yet.")}
                t={t}
                amount={amount}
                action={(r) => (
                  <form action={unmatchLine}>
                    {hidden}
                    <input type="hidden" name="statement_line" value={r.statement_line ?? ""} />
                    <button type="submit" className="text-xs text-muted underline">
                      {r.match_kind === "manual" ? t("يدويّاً · فكّ", "by hand · undo") : t("آليّاً · فكّ", "automatic · undo")}
                    </button>
                  </form>
                )}
              />

              {statements.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-bold">{t("الكشوف المرفوعة على هذا الحساب", "Statements uploaded to this account")}</h2>
                  <ul className="space-y-2 text-sm">
                    {statements.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                        <span>
                          <bdi>{s.file_name || "—"}</bdi> · {s.rows_count} {t("سطراً", "rows")} · {s.currency} · {s.imported_at.slice(0, 10)}
                        </span>
                        <form action={deleteStatement}>
                          {hidden}
                          <input type="hidden" name="statement_id" value={s.id} />
                          <button type="submit" className="text-xs text-danger underline">{t("احذف الكشف", "Remove statement")}</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label: l, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{l}</p>
      <p className={`figure mt-1 text-2xl font-bold ${warn ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

function ReconTable({
  title,
  rows,
  empty,
  t,
  amount,
  action,
}: {
  title: string;
  rows: ReconRow[];
  empty: string;
  t: (ar: string, en: string) => string;
  amount: (minor: number, cur: string) => string;
  action?: (r: ReconRow) => React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold">{title} <span className="font-normal text-muted">({rows.length})</span></h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("التاريخ", "Date")}</th>
                <th className={th}>{t("البيان", "Description")}</th>
                <th className={th}>{t("المبلغ", "Amount")}</th>
                <th className={th}>{t("القيد", "Entry")}</th>
                {action && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={(r.statement_line ?? "") + (r.journal_line ?? "")} className="border-t border-border">
                  <td className={`${td} whitespace-nowrap`}>{r.txn_date}</td>
                  <td className={td}>
                    <bdi>{r.description || "—"}</bdi>
                    {r.reference && <span className="ms-1 text-xs text-muted">· <bdi>{r.reference}</bdi></span>}
                  </td>
                  <td className={`${num} ${r.amount_minor < 0 ? "text-danger" : ""}`}>{amount(r.amount_minor, r.currency)}</td>
                  <td className={td}>{r.entry_no ? <>#{r.entry_no} · <bdi>{r.memo}</bdi></> : "—"}</td>
                  {action && <td className={td}>{action(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
