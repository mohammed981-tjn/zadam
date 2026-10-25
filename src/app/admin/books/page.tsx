import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActionNotice from "@/components/ActionNotice";
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
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

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
  const amount = (minor: number | bigint, cur: string) => (isCurrency(cur) ? formatMoney(BigInt(minor), cur) : String(minor));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">← الإدارة</Link>
      <h1 className="mt-3 text-2xl font-bold">دفتر المنصّة وتكامل الدفاتر</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        المنصّة طرفٌ له دفتره: رسومه ومصروفاته، يكتب فيه المدير وحده. ولا تكتب في دفتر أحد: الرسم يُقيَّد في دفتر دافعه حين يؤكّده هو.
      </p>
      <p className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/books?book=platform" className="font-bold text-primary underline">تقارير دفتر المنصّة</Link>
        <Link href="/books/reconcile?book=platform" className="text-primary underline">مطابقة نقد المنصّة بكشف البنك</Link>
        <Link href="/admin/oversight" className="text-primary underline">الرقابة الماليّة</Link>
      </p>

      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">١ · تكامل الدفاتر</h2>
        {intRes.error ? (
          <p className="text-sm text-danger" role="alert">تعذّر الفحص الآن؛ أعد المحاولة بعد قليل.</p>
        ) : (
          <>
            {platform && (
              <p className={`${card} text-sm`}>
                <span className="font-bold">دفتر المنصّة: </span>
                {platform.ok ? <span className="text-primary">سليم</span> : <span className="text-danger">معطوب</span>}
                {" · "}
                {platform.entries} قيداً · المدين <span className="figure">{money(platform.debit_total ?? 0)}</span> · الدائن{" "}
                <span className="figure">{money(platform.credit_total ?? 0)}</span>
              </p>
            )}
            {damaged.length === 0 ? (
              <p className="mt-3 text-sm">دفاتر الناس كلّها متوازنة: كلّ قيدٍ مدينه يساوي دائنه، ولا قيد بسطرٍ واحد.</p>
            ) : (
              <>
                <p className="mt-3 text-sm text-danger">
                  {damaged.length} دفتراً معطوباً. لا تظهر مبالغها ولا أعداد قيودها؛ افتح فحصاً بسببٍ مكتوب لتقرأ الدفتر، ويُخطَر صاحبه.
                </p>
                <div className={`${box} mt-2`}>
                  <table className="w-full text-sm">
                    <thead className="bg-card">
                      <tr>
                        <th className={th}>الدفتر</th>
                        <th className={th}>قيودٌ غير متوازنة</th>
                        <th className={th}>قيودٌ بسطرٍ واحد</th>
                        <th className={th}>فحص</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damaged.map((d) => (
                        <tr key={d.book_id} className="border-t border-border">
                          <td className={td}>{d.kind === "farm" ? "مزرعة" : "مستثمر"} · <span className="font-mono text-xs">{d.book_id.slice(0, 8)}</span></td>
                          <td className={num}>{d.unbalanced_entries}</td>
                          <td className={num}>{d.entries_under_two_lines}</td>
                          <td className={td}>
                            <form action={inspectBook} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="book_id" value={d.book_id} />
                              <input name="reason" required minLength={10} maxLength={500} placeholder="السبب (١٠ أحرفٍ فأكثر)" className={`${field} py-1 text-xs`} />
                              <button type="submit" className="text-xs text-primary underline">افتح فحصاً</button>
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
        <h2 className="mb-3 text-lg font-bold">٢ · رسوم المنصّة</h2>
        <p className="text-sm leading-7 text-muted">
          سجّل رسماً قبضته المنصّة خارجها (نقداً أو تحويلاً). يصل الدافعَ إشعار، ولا يُقيَّد في دفتر المنصّة ولا دفتره حتى يؤكّده ويختار من أين دفع؛ وإن
          اعترض بقي كما هو وظهر سببه هنا.
        </p>
        {confirmedByCurrency.size > 0 && (
          <p className="mt-2 text-sm">
            المقيَّد من الرسوم:{" "}
            {[...confirmedByCurrency.entries()].map(([cur, v], i) => (
              <span key={cur} className="figure font-bold">{i > 0 && " + "}{amount(v, cur)}</span>
            ))}
          </p>
        )}

        <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
          <label className={`${label} flex-1`}>
            ابحث عن الدافع (الاسم أو الجوّال أو البريد)
            <input name="q" defaultValue={q} className={field} />
          </label>
          <button type="submit" className={button}>ابحث</button>
        </form>
        {q && people.length === 0 && <p className="mt-2 text-sm text-muted">لا أحد بهذا الوصف.</p>}
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
              الدافع: <span className="font-bold">{(sp.pname ?? "—").slice(0, 80)}</span>
            </p>
            <label className={label}>
              دفتر الدافع
              <select name="payer_kind" className={field} defaultValue="investor">
                <option value="investor">دفتر المستثمر</option>
                <option value="farm">دفتر المزرعة</option>
              </select>
            </label>
            <label className={label}>
              نوع الرسم
              <select name="kind" className={field} defaultValue="inspection">
                {FEE_KINDS.map((k) => (
                  <option key={k} value={k}>{FEE_LABEL[k].ar}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              المبلغ
              <input name="amount" required inputMode="decimal" className={field} />
            </label>
            <label className={label}>
              العملة
              <select name="currency" className={field} defaultValue="SDG">
                <option value="SDG">جنيه</option>
                <option value="USD">دولار</option>
              </select>
            </label>
            <label className={label}>
              يوم الدفع
              <input name="date" type="date" required defaultValue={today} max={today} className={field} />
            </label>
            <label className={label}>
              سعر الصرف (للجنيه، اختياريّ: يُؤخذ المنشور إن تُرك)
              <input name="rate" inputMode="decimal" className={field} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              ملاحظة (يراها الدافع)
              <input name="memo" maxLength={200} className={field} />
            </label>
            <button type="submit" className={`${button} self-start`}>سجّل الرسم وأخطِر الدافع</button>
          </form>
        )}

        <div className={`${box} mt-6`}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>الدافع</th>
                <th className={th}>الرسم</th>
                <th className={th}>المبلغ</th>
                <th className={th}>اليوم</th>
                <th className={th}>الحال</th>
              </tr>
            </thead>
            <tbody>
              {fees.length === 0 && (
                <tr><td className={td} colSpan={5}>لا رسوم بعد.</td></tr>
              )}
              {fees.map((f) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className={td}><bdi>{f.payer_name ?? "—"}</bdi> <span className="text-xs text-muted">· {f.payer_kind === "farm" ? "مزرعة" : "مستثمر"}</span></td>
                  <td className={td}>{FEE_LABEL[f.kind]?.ar ?? f.kind}{f.memo && <span className="block text-xs text-muted"><bdi>{f.memo}</bdi></span>}</td>
                  <td className={num}>{amount(f.amount_minor, f.currency)}</td>
                  <td className={`${td} whitespace-nowrap`}>{f.entry_date}</td>
                  <td className={td}>
                    {FEE_STATUS[f.status]?.ar ?? f.status}
                    {f.reject_reason && <span className="block text-xs text-danger"><bdi>{f.reject_reason}</bdi></span>}
                    {f.status === "pending" && (
                      <form action={cancelFee}>
                        <input type="hidden" name="fee_id" value={f.id} />
                        <button type="submit" className="text-xs text-danger underline">ألغِ</button>
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
