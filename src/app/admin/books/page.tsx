import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import ActionNotice from "@/components/ActionNotice";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { ledgerToday } from "@/lib/ledger/today";
import { money } from "@/lib/ledger/reports";
import { formatMoney, isCurrency } from "@/lib/ledger/money";
import { FEE_KINDS, FEE_LABEL, FEE_STATUS, type FeeKind } from "@/lib/ledger/platformBook";
import { button, card, field, label } from "@/lib/ui";
import { cancelFee, inspectBook, proposeFee } from "./actions";

/**
 * دفتر المنصّة وتكامل الدفاتر (البند ١٨٩، المرحلة ٤ من ١٨٦). Three things on one page, all for the administrators:
 * whether every book still balances (the platform's in full, of everyone else's only a damaged one and how it is
 * damaged — never a total); the fees the platform was paid, each booked in both books only when its payer confirms;
 * and the way into the platform's own book, its reports and its cash statement.
 */

type SP = { ok?: string; error?: string; q?: string; payer?: string; pname?: string };
type Integrity = {
  book_id: string;
  kind: string;
  entries: number | null;
  lines: number | null;
  debit_total: number | null;
  credit_total: number | null;
  unbalanced_entries: number;
  entries_under_two_lines: number;
  ok: boolean;
};
type Fee = {
  id: string;
  kind: FeeKind;
  status: string;
  payer_name: string | null;
  payer_kind: string;
  amount_minor: number;
  currency: string;
  entry_date: string;
  memo: string;
  reject_reason: string | null;
};
type Person = { id: string; full_name: string; phone: string | null; email: string | null };

const th = "px-3 py-2 text-start font-medium";
const td = "px-3 py-2";
const num = "px-3 py-2 text-end tabular-nums";
const box = "overflow-x-auto rounded-xl border border-border";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminBooksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const payer = sp.payer && UUID.test(sp.payer) ? sp.payer : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const L = locale === "en" ? "en" : "ar";

  const [intRes, feeRes, peopleRes] = await Promise.all([
    supabase.rpc("ledger_integrity"),
    supabase.rpc("ledger_fees_list"),
    q ? supabase.rpc("admin_users_list", { p_limit: 10, p_offset: 0, p_q: q }) : Promise.resolve({ data: [] as Person[] }),
  ]);
  const integrity = (intRes.data ?? []) as Integrity[];
  const platform = integrity.find((r) => r.kind === "platform");
  const damaged = integrity.filter((r) => r.kind !== "platform");
  const fees = (feeRes.data ?? []) as Fee[];
  const people = (peopleRes.data ?? []) as Person[];
  const today = ledgerToday();
  const confirmedByCurrency = new Map<string, bigint>();
  for (const f of fees.filter((x) => x.status === "confirmed")) {
    confirmedByCurrency.set(f.currency, (confirmedByCurrency.get(f.currency) ?? BigInt(0)) + BigInt(f.amount_minor));
  }
  const amount = (minor: number | bigint, cur: string) =>
    isCurrency(cur)
      ? locale === "en"
        ? `${formatMoney(BigInt(minor), cur, false)} ${cur}`
        : formatMoney(BigInt(minor), cur)
      : String(minor);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">{t("← الإدارة", "← Administration")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("دفتر المنصّة وتكامل الدفاتر", "Platform book and book integrity")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "المنصّة طرفٌ له دفتره: رسومه ومصروفاته، يكتب فيه المدير وحده. ولا تكتب في دفتر أحد: الرسم يُقيَّد في دفتر دافعه حين يؤكّده هو.",
          "The platform is a party with its own book: its fees and expenses, written by the administrator alone. It writes in nobody else's book: a fee is booked in its payer's book when the payer confirms it.",
        )}
      </p>
      <p className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/books?book=platform" className="font-bold text-primary underline">{t("تقارير دفتر المنصّة", "Platform book reports")}</Link>
        <Link href="/books/reconcile?book=platform" className="text-primary underline">{t("مطابقة نقد المنصّة بكشف البنك", "Reconcile platform cash with the bank statement")}</Link>
        <Link href="/admin/oversight" className="text-primary underline">{t("الرقابة الماليّة", "Financial oversight")}</Link>
      </p>

      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("١ · تكامل الدفاتر", "1 · Book integrity")}</h2>
        {intRes.error ? (
          <p className="text-sm text-danger" role="alert">{t("تعذّر الفحص الآن؛ أعد المحاولة بعد قليل.", "The check could not run now; try again shortly.")}</p>
        ) : (
          <>
            {platform && (
              <p className={`${card} text-sm`}>
                <span className="font-bold">{t("دفتر المنصّة: ", "Platform book: ")}</span>
                {platform.ok ? <span className="text-primary">{t("سليم", "sound")}</span> : <span className="text-danger">{t("معطوب", "damaged")}</span>}
                {" · "}
                {platform.entries} {t("قيداً", "entries")} · {t("المدين", "Debit")} <span className="figure">{money(platform.debit_total ?? 0)}</span> · {t("الدائن", "Credit")}{" "}
                <span className="figure">{money(platform.credit_total ?? 0)}</span>
              </p>
            )}
            {damaged.length === 0 ? (
              <p className="mt-3 text-sm">{t("دفاتر الناس كلّها متوازنة: كلّ قيدٍ مدينه يساوي دائنه، ولا قيد بسطرٍ واحد.", "Everyone's books balance: every entry's debit equals its credit, and no entry has a single line.")}</p>
            ) : (
              <>
                <p className="mt-3 text-sm text-danger">
                  {damaged.length}{" "}
                  {t(
                    "دفتراً معطوباً. لا تظهر مبالغها ولا أعداد قيودها؛ افتح فحصاً بسببٍ مكتوب لتقرأ الدفتر، ويُخطَر صاحبه.",
                    "damaged book(s). Their amounts and entry counts are not shown; open an inspection with a written reason to read the book, and its owner is notified.",
                  )}
                </p>
                <div className={`${box} mt-2`}>
                  <table className="w-full text-sm">
                    <thead className="bg-card">
                      <tr>
                        <th className={th}>{t("الدفتر", "Book")}</th>
                        <th className={th}>{t("قيودٌ غير متوازنة", "Unbalanced entries")}</th>
                        <th className={th}>{t("قيودٌ بسطرٍ واحد", "Single-line entries")}</th>
                        <th className={th}>{t("فحص", "Inspect")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damaged.map((d) => (
                        <tr key={d.book_id} className="border-t border-border">
                          <td className={td}>{d.kind === "farm" ? t("مزرعة", "Farm") : t("مستثمر", "Investor")} · <span className="font-mono text-xs">{d.book_id.slice(0, 8)}</span></td>
                          <td className={num}>{d.unbalanced_entries}</td>
                          <td className={num}>{d.entries_under_two_lines}</td>
                          <td className={td}>
                            <form action={inspectBook} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="book_id" value={d.book_id} />
                              <input name="reason" required minLength={10} maxLength={500} placeholder={t("السبب (١٠ أحرفٍ فأكثر)", "Reason (10 characters or more)")} className={`${field} py-1 text-xs`} />
                              <button type="submit" className="text-xs text-primary underline">{t("افتح فحصاً", "Open an inspection")}</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">{t("٢ · رسوم المنصّة", "2 · Platform fees")}</h2>
        <p className="text-sm leading-7 text-muted">
          {t(
            "سجّل رسماً قبضته المنصّة خارجها (نقداً أو تحويلاً). يصل الدافعَ إشعار، ولا يُقيَّد في دفتر المنصّة ولا دفتره حتى يؤكّده ويختار من أين دفع؛ وإن اعترض بقي كما هو وظهر سببه هنا.",
            "Record a fee the platform received outside it (cash or transfer). The payer is notified, and it is not booked in the platform's book or theirs until they confirm it and choose where they paid from; if they dispute it, it stays as it is and their reason shows here.",
          )}
        </p>
        {confirmedByCurrency.size > 0 && (
          <p className="mt-2 text-sm">
            {t("المقيَّد من الرسوم:", "Fees booked:")}{" "}
            {[...confirmedByCurrency.entries()].map(([cur, v], i) => (
              <span key={cur} className="figure font-bold">{i > 0 && " + "}{amount(v, cur)}</span>
            ))}
          </p>
        )}

        <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
          <label className={`${label} flex-1`}>
            {t("ابحث عن الدافع (الاسم أو الجوّال أو البريد)", "Find the payer (name, phone or email)")}
            <input name="q" defaultValue={q} className={field} />
          </label>
          <button type="submit" className={button}>{t("ابحث", "Search")}</button>
        </form>
        {q && people.length === 0 && <p className="mt-2 text-sm text-muted">{t("لا أحد بهذا الوصف.", "No one matches.")}</p>}
        {people.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {people.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/books?${new URLSearchParams({ payer: p.id, pname: p.full_name || "—" }).toString()}`}
                  className={`inline-block rounded-full border px-3 py-1 ${payer === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}
                >
                  {p.full_name || "—"} <span className="opacity-70">· {p.phone ?? p.email ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {payer && (
          <form action={proposeFee} className={`${card} mt-4 grid gap-3 sm:grid-cols-2`}>
            <input type="hidden" name="payer" value={payer} />
            <input type="hidden" name="idem_key" value={randomUUID()} />
            <p className="text-sm sm:col-span-2">
              {t("الدافع:", "Payer:")} <span className="font-bold">{(sp.pname ?? "—").slice(0, 80)}</span>
            </p>
            <label className={label}>
              {t("دفتر الدافع", "Payer's book")}
              <select name="payer_kind" className={field} defaultValue="investor">
                <option value="investor">{t("دفتر المستثمر", "Investor book")}</option>
                <option value="farm">{t("دفتر المزرعة", "Farm book")}</option>
              </select>
            </label>
            <label className={label}>
              {t("نوع الرسم", "Fee type")}
              <select name="kind" className={field} defaultValue="inspection">
                {FEE_KINDS.map((k) => (
                  <option key={k} value={k}>{FEE_LABEL[k][L]}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t("المبلغ", "Amount")}
              <input name="amount" required inputMode="decimal" className={field} />
            </label>
            <label className={label}>
              {t("العملة", "Currency")}
              <select name="currency" className={field} defaultValue="SDG">
                <option value="SDG">{t("جنيه", "SDG (pound)")}</option>
                <option value="USD">{t("دولار", "USD (dollar)")}</option>
              </select>
            </label>
            <label className={label}>
              {t("يوم الدفع", "Payment date")}
              <input name="date" type="date" required defaultValue={today} max={today} className={field} />
            </label>
            <label className={label}>
              {t("سعر الصرف (للجنيه، اختياريّ: يُؤخذ المنشور إن تُرك)", "Exchange rate (for SDG, optional: the published rate is used if left blank)")}
              <input name="rate" inputMode="decimal" className={field} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {t("ملاحظة (يراها الدافع)", "Note (the payer sees it)")}
              <input name="memo" maxLength={200} className={field} />
            </label>
            <button type="submit" className={`${button} self-start`}>{t("سجّل الرسم وأخطِر الدافع", "Record the fee and notify the payer")}</button>
          </form>
        )}

        <div className={`${box} mt-6`}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("الدافع", "Payer")}</th>
                <th className={th}>{t("الرسم", "Fee")}</th>
                <th className={th}>{t("المبلغ", "Amount")}</th>
                <th className={th}>{t("اليوم", "Date")}</th>
                <th className={th}>{t("الحال", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {fees.length === 0 && (
                <tr><td className={td} colSpan={5}>{t("لا رسوم بعد.", "No fees yet.")}</td></tr>
              )}
              {fees.map((f) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className={td}><bdi>{f.payer_name ?? "—"}</bdi> <span className="text-xs text-muted">· {f.payer_kind === "farm" ? t("مزرعة", "Farm") : t("مستثمر", "Investor")}</span></td>
                  <td className={td}>{FEE_LABEL[f.kind]?.[L] ?? f.kind}{f.memo && <span className="block text-xs text-muted"><bdi>{f.memo}</bdi></span>}</td>
                  <td className={num}>{amount(f.amount_minor, f.currency)}</td>
                  <td className={`${td} whitespace-nowrap`}>{f.entry_date}</td>
                  <td className={td}>
                    {FEE_STATUS[f.status]?.[L] ?? f.status}
                    {f.reject_reason && <span className="block text-xs text-danger"><bdi>{f.reject_reason}</bdi></span>}
                    {f.status === "pending" && (
                      <form action={cancelFee}>
                        <input type="hidden" name="fee_id" value={f.id} />
                        <button type="submit" className="text-xs text-danger underline">{t("ألغِ", "Cancel")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
