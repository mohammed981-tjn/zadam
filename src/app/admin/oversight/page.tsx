import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActionNotice from "@/components/ActionNotice";
import { ledgerToday } from "@/lib/ledger/today";
import { money } from "@/lib/ledger/reports";
import { inspectionState, lastMonths, pivotFlows, reconcileVerdict, STALE_LABEL, type FlowRow, type ReconcileRow, type StaleRow } from "@/lib/oversightView";
import { LINK_KIND_LABEL, LINK_STATUS_LABEL, type LinkKind, type LinkStatus } from "@/lib/ledgerLinks";
import { button, card, field, ghost, label } from "@/lib/ui";
import { closeInspection, openInspection } from "./actions";

/**
 * الرقابة الماليّة (البند ١٩١): كالبنك المركزيّ — تقرأ المنصّة الحركة كلّها ولا تكتب في دفتر أحد.
 *
 * Three levels, shown here in order: aggregate figures with no names, withheld whenever too few books fed them or
 * one of them dominated; the linked entries between partners, aggregated the same way; and the reading of one
 * person's book, which needs a written reason, lasts hours, and is told to its owner. Nothing here writes into a
 * book: the only things this page changes are the inspections themselves.
 */

type SP = { ok?: string; error?: string; q?: string };
type LinkAgg = { kind: LinkKind; status: LinkStatus; links: number | null; agreements: number | null; amount_usd_minor: number | null; suppressed: boolean };
type Mix = { period: string; currency: string; share_pct: number | null; suppressed: boolean };
type Insp = { id: string; book_id: string; book_kind: string; opened_by: string; reason: string; opened_at: string; expires_at: string; closed_at: string | null; active: boolean };
type Person = { id: string; full_name: string; phone: string | null; email: string | null; role: string | null };

const when = (iso: string) => new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Khartoum", dateStyle: "medium", timeStyle: "short" });
const th = "px-3 py-2 text-start font-medium";
const td = "px-3 py-2";
const num = "px-3 py-2 text-end tabular-nums";
const box = "overflow-x-auto rounded-xl border border-border";

export default async function OversightPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const today = ledgerToday();
  const months = lastMonths(today, 12);
  const from = months[0];

  const [settingsRes, flowsRes, mixRes, linksRes, staleRes, reconRes, inspRes, peopleRes] = await Promise.all([
    supabase.from("oversight_settings").select("min_books").maybeSingle(),
    supabase.rpc("oversight_flows", { p_from: from, p_to: today }),
    supabase.rpc("oversight_currency_mix", { p_from: months[months.length - 3], p_to: today }),
    supabase.rpc("oversight_links", { p_from: from, p_to: today }),
    supabase.rpc("oversight_stale", { p_days: 7 }),
    supabase.rpc("oversight_reconcile", { p_as_of: today }),
    supabase.rpc("ledger_inspections_list"),
    q ? supabase.rpc("admin_users_list", { p_limit: 10, p_offset: 0, p_q: q }) : Promise.resolve({ data: [] as Person[] }),
  ]);
  // The floor is the administration's setting (now five books); the words below follow it instead of repeating a number.
  const minBooks = Number((settingsRes.data as { min_books?: number } | null)?.min_books ?? 5);
  const floorWord = minBooks.toLocaleString("ar-EG");
  const flows = pivotFlows((flowsRes.data ?? []) as FlowRow[]);
  const mix = (mixRes.data ?? []) as Mix[];
  const linkAgg = (linksRes.data ?? []) as LinkAgg[];
  const stale = (staleRes.data ?? []) as StaleRow[];
  const verdict = reconcileVerdict(((reconRes.data ?? []) as ReconcileRow[])[0]);
  const inspections = (inspRes.data ?? []) as Insp[];
  const people = (peopleRes.data ?? []) as Person[];
  const now = new Date();
  const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC", month: "short", year: "2-digit" });
  const firstError = flowsRes.error ?? mixRes.error ?? linksRes.error ?? staleRes.error ?? reconRes.error ?? inspRes.error;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">← الإدارة</Link>
      <h1 className="mt-3 text-2xl font-bold">الرقابة الماليّة</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        تراقب المنصّة الحركة الماليّة في الشبكة كما يراقب البنك المركزيّ البنوك: ترى الأرقام المجمَّعة بلا أسماء، ولا تكتب في دفتر أحد ولا في ماله.
        وأيّ رقمٍ ساهم فيه أقلّ من {floorWord} دفاتر، أو غلب عليه دفترٌ واحد، يُحجب حتى لا يُعرف صاحبه.
        وقراءة دفترٍ بعينه لا تكون إلا بفحصٍ تكتب سببه، مدّته محدودة، ويصل صاحبَ الدفتر إشعارٌ عند فتحه وعند إغلاقه.
      </p>

      <p className="mt-3 text-sm">
        <Link href="/books?book=platform" className="font-bold text-primary underline">دفتر المنصّة</Link>
        <span className="text-muted"> — ميزانه، وفيه الحسابات الإحصائيّة التي تسجّل فيها المنصّة مجاميع الشبكة كلّ شهر (خارج الميزانيّة).</span>
      </p>

      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>
      {firstError && (
        <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">تعذّر تحميل بعض الأرقام الآن؛ أعد المحاولة بعد قليل.</p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">١ · الحركة الماليّة في الشبكة (بالدولار، آخر ١٢ شهراً)</h2>
        <p className="mb-3 text-sm text-muted">
          كلّ قيدٍ يُعدّ في الشهر الذي سُجّل فيه، والشهر الجاري يظهر حين ينتهي: فرقمُ الشهر المنتهي ثابتٌ لا يتغيّر بين قراءتين، فلا يُعرف منه قيد أحد.
        </p>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>البند</th>
                {months.map((m) => (
                  <th key={m} className={th}>{monthName(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flows.metrics.length === 0 && (
                <tr><td className={td} colSpan={months.length + 1}>لا حركة بعد.</td></tr>
              )}
              {flows.metrics.map((m) => (
                <tr key={m.metric} className="border-t border-border">
                  <td className={`${td} whitespace-nowrap`}>{m.label}</td>
                  {months.map((p) => {
                    const c = flows.cell(m.metric, p);
                    return (
                      <td key={p} className={num} title={c?.suppressed ? "محجوب: دفاتره قليلة أو يغلب عليه دفترٌ واحد" : c ? `${c.books} دفاتر · ${c.entries} قيداً` : ""}>
                        {!c ? "" : c.suppressed || c.value_minor === null ? <span className="text-muted">محجوب</span> : money(c.value_minor)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">«محجوب» ليس صفراً: أُخفي حمايةً لخصوصيّة أصحاب الدفاتر. تظهر الأرقام حين تتّسع الشبكة.</p>
        {mix.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-bold">حصّة العملات في القيود (آخر ٣ أشهر): </span>
            {mix.map((r) => (
              <span key={`${r.period}${r.currency}`} className="me-3 text-muted">
                {monthName(r.period)} {r.currency === "SDG" ? "جنيه" : "دولار"} {r.suppressed || r.share_pct === null ? "محجوب" : `${r.share_pct}٪`}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">٢ · القيود المتقابلة بين الشركاء (مجمَّعة، بلا أسماء)</h2>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr><th className={th}>النوع</th><th className={th}>الحالة</th><th className={th}>الاقتراحات</th><th className={th}>العقود</th><th className={th}>المجموع</th></tr>
            </thead>
            <tbody>
              {linkAgg.length === 0 && <tr><td className={td} colSpan={5}>لا اقتراحات بعد.</td></tr>}
              {linkAgg.map((r) => (
                <tr key={`${r.kind}${r.status}`} className="border-t border-border">
                  <td className={td}>{LINK_KIND_LABEL[r.kind]?.ar ?? r.kind}</td>
                  <td className={td}>{LINK_STATUS_LABEL[r.status]?.ar ?? r.status}</td>
                  {r.suppressed ? (
                    <td className={`${td} text-muted`} colSpan={3}>محجوب (أقلّ من {floorWord} عقود)</td>
                  ) : (
                    <>
                      <td className={num}>{r.links}</td>
                      <td className={num}>{r.agreements}</td>
                      <td className={num}>{r.amount_usd_minor === null ? "" : money(r.amount_usd_minor)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">٢ب · ما تأخّر، وفرق الذمّتين (بلا أسماء)</h2>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr><th className={th}>ما مضى عليه أكثر من أسبوع</th><th className={th}>العدد</th><th className={th}>العقود</th><th className={th}>أقدمها (أياماً)</th></tr>
            </thead>
            <tbody>
              {stale.map((r) => (
                <tr key={r.what} className="border-t border-border">
                  <td className={td}>{STALE_LABEL[r.what] ?? r.what}</td>
                  {r.suppressed ? (
                    <td className={`${td} text-muted`} colSpan={3}>محجوب (أقلّ من {floorWord} عقود)</td>
                  ) : (
                    <>
                      <td className={num}>{r.items}</td>
                      <td className={num}>{r.agreements}</td>
                      <td className={num}>{r.items ? r.oldest_days : ""}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-7">
          <span className="font-bold">فرق الذمّتين: </span>
          {verdict.kind === "withheld" && <span className="text-muted">محجوب — الدفاتر قليلة في أحد الجانبين أو يغلب عليه دفترٌ واحد.</span>}
          {verdict.kind === "match" && <span>ما تقوله دفاتر المزارعين أنّها مستحقّةٌ لشركائها يطابق ما تقوله دفاتر المستثمرين أنّها مستحقّةٌ لهم.</span>}
          {verdict.kind === "differs" && (
            <span>
              {verdict.direction === "farm_more" ? "دفاتر المزارعين تُثبت مستحقّاً للشركاء أكثر مما تُثبته دفاتر المستثمرين" : "دفاتر المستثمرين تُثبت مستحقّاً لهم أكثر مما تُثبته دفاتر المزارعين"} بمقدار{" "}
              <span className="font-bold tabular-nums">{money(verdict.difference)}</span>. القيود المتقابلة المؤكَّدة تتطابق دائماً، فهذا أثرُ عكسٍ جرى في دفترٍ واحد؛ ويُصلحه طلب إلغاءٍ باتّفاق الطرفين.
            </span>
          )}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">٣ · فحص دفتر شخصٍ بعينه</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className={`${label} flex-1`}>
            ابحث عن الشخص (الاسم أو الجوّال أو البريد)
            <input name="q" defaultValue={q} className={field} />
          </label>
          <button type="submit" className={button}>ابحث</button>
        </form>
        {q && people.length === 0 && <p className="mt-3 text-sm text-muted">لا أحد بهذا الوصف.</p>}
        <ul className="mt-3 space-y-3">
          {people.map((p) => (
            <li key={p.id} className={`${card} text-sm`}>
              <p className="font-bold">{p.full_name || "—"} <span className="font-normal text-muted">· {p.phone ?? p.email ?? ""}</span></p>
              <details className="mt-2">
                <summary className="cursor-pointer text-primary">افتح فحصاً على دفتره</summary>
                <form action={openInspection} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="user_id" value={p.id} />
                  <label className={label}>
                    الدفتر
                    <select name="kind" className={field} defaultValue="farm">
                      <option value="farm">دفتر المزرعة</option>
                      <option value="investor">دفتر المستثمر</option>
                    </select>
                  </label>
                  <label className={label}>
                    السبب (١٠ أحرفٍ فأكثر) — يراه صاحب الدفتر
                    <textarea name="reason" required minLength={10} maxLength={500} rows={2} className={field} />
                  </label>
                  <label className={label}>
                    المدّة بالساعات (الافتراضيّ ٢٤، الأقصى ٧٢)
                    <input name="hours" type="number" min={1} max={72} className={field} />
                  </label>
                  <button type="submit" className={`${button} self-start`}>افتح الفحص وأخطِر صاحبه</button>
                </form>
              </details>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 mt-6 text-sm font-bold">الفحوص</h3>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr><th className={th}>الدفتر</th><th className={th}>السبب</th><th className={th}>فُتح</th><th className={th}>ينتهي</th><th className={th}>الحالة</th><th className={th}></th></tr>
            </thead>
            <tbody>
              {inspections.length === 0 && <tr><td className={td} colSpan={6}>لا فحوص.</td></tr>}
              {inspections.map((i) => {
                const st = inspectionState(i, now);
                return (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className={td}>{i.book_kind === "investor" ? "مستثمر" : "مزرعة"}</td>
                    <td className={td}>{i.reason}</td>
                    <td className={td}>{when(i.opened_at)}</td>
                    <td className={td}>{i.closed_at ? when(i.closed_at) : when(i.expires_at)}</td>
                    <td className={td}>{st === "active" ? "جارٍ" : st === "closed" ? "أُغلق" : "انتهى بالوقت"}</td>
                    <td className={td}>
                      {st === "active" && (
                        <div className="flex flex-col gap-2">
                          <Link className="text-primary underline" href={`/books?book=${i.book_kind}`}>اقرأ الدفتر</Link>
                          <form action={closeInspection}>
                            <input type="hidden" name="inspection_id" value={i.id} />
                            <button type="submit" className={ghost}>أغلق الفحص</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">القراءة فقط: لا تملك الإدارة كتابة قيدٍ في دفتر أحد. وحين تفتح فحصاً على دفتر مزارعٍ، يظهر لك ذلك الدفتر وحده في «دفتر الحسابات» حتى يُغلق الفحص أو ينتهي.</p>
      </section>
    </div>
  );
}
