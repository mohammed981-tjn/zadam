import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import ActionNotice from "@/components/ActionNotice";
import { ledgerToday } from "@/lib/ledger/today";
import { money } from "@/lib/ledger/reports";
import {
  agreementsWithheld,
  agreementsWithheldEn,
  closedMonthEnd,
  inspectionState,
  lastClosedMonths,
  pivotFlows,
  RECONCILE_REMEDY,
  RECONCILE_REMEDY_EN,
  reconcileVerdict,
  STALE_LABEL,
  STALE_LABEL_EN,
  type FlowRow,
  type ReconcileRow,
  type StaleRow,
} from "@/lib/oversightView";
import { LINK_KIND_LABEL, LINK_STATUS_LABEL, type LinkKind, type LinkStatus } from "@/lib/ledgerLinks";
import { button, card, field, ghost, label } from "@/lib/ui";
import { closeInspection, openInspection } from "./actions";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";

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

const when = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", { timeZone: "Africa/Khartoum", dateStyle: "medium", timeStyle: "short" });
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
  if (!user) redirect(await loginHrefHere());
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const today = ledgerToday();
  // The twelve months that are over: the month under way has no figure until it ends.
  const months = lastClosedMonths(today, 12);
  const from = months[0];
  const asOf = closedMonthEnd(today);

  const [settingsRes, flowsRes, mixRes, linksRes, staleRes, reconRes, inspRes, peopleRes] = await Promise.all([
    supabase.from("oversight_settings").select("min_books").maybeSingle(),
    supabase.rpc("oversight_flows", { p_from: from, p_to: asOf }),
    supabase.rpc("oversight_currency_mix", { p_from: months[months.length - 3], p_to: asOf }),
    supabase.rpc("oversight_links", { p_from: from, p_to: asOf }),
    supabase.rpc("oversight_stale", { p_days: 7 }),
    supabase.rpc("oversight_reconcile", { p_as_of: asOf }),
    supabase.rpc("ledger_inspections_list"),
    q ? supabase.rpc("admin_users_list", { p_limit: 10, p_offset: 0, p_q: q }) : Promise.resolve({ data: [] as Person[] }),
  ]);
  // The floor is the administration's setting (now five books); the words below follow it instead of repeating a number.
  const minBooks = Number((settingsRes.data as { min_books?: number } | null)?.min_books ?? 5);
  const floorWord = minBooks.toLocaleString("ar-EG");
  const floorEn = minBooks.toLocaleString("en-US");
  const flows = pivotFlows((flowsRes.data ?? []) as FlowRow[]);
  const mix = (mixRes.data ?? []) as Mix[];
  const linkAgg = (linksRes.data ?? []) as LinkAgg[];
  const stale = (staleRes.data ?? []) as StaleRow[];
  const verdict = reconcileVerdict(((reconRes.data ?? []) as ReconcileRow[])[0]);
  const inspections = (inspRes.data ?? []) as Insp[];
  const people = (peopleRes.data ?? []) as Person[];
  const now = new Date();
  const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { timeZone: "UTC", month: "short", year: "2-digit" });
  const firstError = flowsRes.error ?? mixRes.error ?? linksRes.error ?? staleRes.error ?? reconRes.error ?? inspRes.error;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">{t("← الإدارة", "← Administration")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("الرقابة الماليّة", "Financial oversight")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {locale === "en" ? (
          <>
            The platform watches the money moving through the network the way a central bank watches banks: it sees
            aggregate figures with no names, and never writes in anyone&apos;s book or touches their money. Any figure fed
            by fewer than {floorEn} books, or dominated by one book, is withheld so its owner cannot be identified.
            Reading one particular book takes an inspection with a written reason; it is time-limited, and the book&apos;s
            owner is notified when it opens and when it closes.
          </>
        ) : (
          <>
            تراقب المنصّة الحركة الماليّة في الشبكة كما يراقب البنك المركزيّ البنوك: ترى الأرقام المجمَّعة بلا أسماء، ولا تكتب في دفتر أحد ولا في ماله.
            وأيّ رقمٍ ساهم فيه أقلّ من {floorWord} دفاتر، أو غلب عليه دفترٌ واحد، يُحجب حتى لا يُعرف صاحبه.
            وقراءة دفترٍ بعينه لا تكون إلا بفحصٍ تكتب سببه، مدّته محدودة، ويصل صاحبَ الدفتر إشعارٌ عند فتحه وعند إغلاقه.
          </>
        )}
      </p>

      <p className="mt-3 text-sm">
        <Link href="/books?book=platform" className="font-bold text-primary underline">{t("دفتر المنصّة", "Platform book")}</Link>
        <span className="text-muted">
          {t(
            " — ميزانه، وفيه الحسابات الإحصائيّة التي تسجّل فيها المنصّة مجاميع الشبكة كلّ شهر (خارج الميزانيّة).",
            " — its trial balance, including the statistical accounts where the platform records the network's totals each month (off the balance sheet).",
          )}
        </span>
      </p>

      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>
      {firstError && (
        <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">
          {t("تعذّر تحميل بعض الأرقام الآن؛ أعد المحاولة بعد قليل.", "Some figures could not be loaded right now; try again shortly.")}
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          {t("١ · الحركة الماليّة في الشبكة (بالدولار، آخر ١٢ شهراً انتهت)", "1 · Money moving through the network (USD, last 12 completed months)")}
        </h2>
        <p className="mb-3 text-sm text-muted">
          {t(
            "كلّ قيدٍ يُعدّ في الشهر الذي سُجّل فيه، والشهر الجاري يظهر حين ينتهي: فرقمُ الشهر المنتهي ثابتٌ لا يتغيّر بين قراءتين، فلا يُعرف منه قيد أحد.",
            "Each entry counts in the month it was recorded, and the current month appears once it ends: a completed month's figure never changes between two readings, so no one's entry can be inferred from it.",
          )}
        </p>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("البند", "Item")}</th>
                {months.map((m) => (
                  <th key={m} className={th}>{monthName(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flows.metrics.length === 0 && (
                <tr><td className={td} colSpan={months.length + 1}>{t("لا حركة بعد.", "No activity yet.")}</td></tr>
              )}
              {flows.metrics.map((m) => (
                <tr key={m.metric} className="border-t border-border">
                  <td className={`${td} whitespace-nowrap`}>{m.label}</td>
                  {months.map((p) => {
                    const c = flows.cell(m.metric, p);
                    return (
                      <td key={p} className={num} title={
                          c?.suppressed
                            ? t("محجوب: دفاتره قليلة أو يغلب عليه دفترٌ واحد", "Withheld: too few books, or one book dominates")
                            : c
                              ? t(`${c.books} دفاتر · ${c.entries} قيداً`, `${c.books} books · ${c.entries} entries`)
                              : ""
                        }
                      >
                        {!c ? "" : c.suppressed || c.value_minor === null ? <span className="text-muted">{t("محجوب", "Withheld")}</span> : money(c.value_minor)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          {t(
            "«محجوب» ليس صفراً: أُخفي حمايةً لخصوصيّة أصحاب الدفاتر. تظهر الأرقام حين تتّسع الشبكة.",
            "“Withheld” is not zero: it is hidden to protect the book owners' privacy. The figures appear as the network grows.",
          )}
        </p>
        {mix.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-bold">
              {t(
                "حصّة العملات في القيود (آخر ٣ أشهر انتهت، والشهر يُحجب كلّه إن حُجبت عملةٌ فيه): ",
                "Currency share of entries (last 3 completed months; a whole month is withheld if any currency in it is): ",
              )}
            </span>
            {mix.map((r) => (
              <span key={`${r.period}${r.currency}`} className="me-3 text-muted">
                {monthName(r.period)} {r.currency === "SDG" ? t("جنيه", "SDG") : t("دولار", "USD")}{" "}
                {r.suppressed || r.share_pct === null ? t("محجوب", "withheld") : t(`${r.share_pct}٪`, `${r.share_pct}%`)}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">
          {t("٢ · القيود المتقابلة بين الشركاء (مجمَّعة، بلا أسماء)", "2 · Linked entries between partners (aggregated, no names)")}
        </h2>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("النوع", "Type")}</th>
                <th className={th}>{t("الحالة", "Status")}</th>
                <th className={th}>{t("الاقتراحات", "Proposals")}</th>
                <th className={th}>{t("العقود", "Agreements")}</th>
                <th className={th}>{t("المجموع", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {linkAgg.length === 0 && <tr><td className={td} colSpan={5}>{t("لا اقتراحات بعد.", "No proposals yet.")}</td></tr>}
              {linkAgg.map((r) => (
                <tr key={`${r.kind}${r.status}`} className="border-t border-border">
                  <td className={td}>{LINK_KIND_LABEL[r.kind]?.[locale] ?? r.kind}</td>
                  <td className={td}>{LINK_STATUS_LABEL[r.status]?.[locale] ?? r.status}</td>
                  {r.suppressed ? (
                    <td className={`${td} text-muted`} colSpan={3}>{t(agreementsWithheld(floorWord), agreementsWithheldEn(minBooks))}</td>
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
        <h2 className="mb-3 text-lg font-bold">
          {t("٢ب · ما تأخّر، وفرق الذمّتين (بلا أسماء)", "2b · What is overdue, and the gap between the two sides' dues (no names)")}
        </h2>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("ما مضى عليه أكثر من أسبوع", "Waiting more than a week")}</th>
                <th className={th}>{t("العدد", "Count")}</th>
                <th className={th}>{t("العقود", "Agreements")}</th>
                <th className={th}>{t("أقدمها (أياماً)", "Oldest (days)")}</th>
              </tr>
            </thead>
            <tbody>
              {stale.map((r) => (
                <tr key={r.what} className="border-t border-border">
                  <td className={td}>{(locale === "en" ? STALE_LABEL_EN : STALE_LABEL)[r.what] ?? r.what}</td>
                  {r.suppressed ? (
                    <td className={`${td} text-muted`} colSpan={3}>{t(agreementsWithheld(floorWord), agreementsWithheldEn(minBooks))}</td>
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
          <span className="font-bold">
            {t(
              `فرق الذمّتين (حتى ${asOf}، نهاية آخر شهرٍ انتهى): `,
              `Gap between the two sides' dues (as of ${asOf}, the end of the last completed month): `,
            )}
          </span>
          {verdict.kind === "withheld" && (
            <span className="text-muted">
              {t(
                "محجوب — الدفاتر قليلة في أحد الجانبين أو يغلب عليه دفترٌ واحد.",
                "Withheld — too few books on one side, or one book dominates it.",
              )}
            </span>
          )}
          {verdict.kind === "match" && (
            <span>
              {t(
                "ما تقوله دفاتر المزارعين أنّها مستحقّةٌ لشركائها يطابق ما تقوله دفاتر المستثمرين أنّها مستحقّةٌ لهم.",
                "What the farmers' books say they owe their partners matches what the investors' books say they are owed.",
              )}
            </span>
          )}
          {verdict.kind === "differs" && (
            <span>
              {verdict.direction === "farm_more"
                ? t(
                    "دفاتر المزارعين تُثبت مستحقّاً للشركاء أكثر مما تُثبته دفاتر المستثمرين",
                    "The farmers' books show more owed to partners than the investors' books show",
                  )
                : t(
                    "دفاتر المستثمرين تُثبت مستحقّاً لهم أكثر مما تُثبته دفاتر المزارعين",
                    "The investors' books show more owed to them than the farmers' books show",
                  )}{" "}
              {t("بمقدار", "by")}{" "}
              <span className="font-bold tabular-nums">{money(verdict.difference)}</span>. {t(RECONCILE_REMEDY, RECONCILE_REMEDY_EN)}
            </span>
          )}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">{t("٣ · فحص دفتر شخصٍ بعينه", "3 · Inspecting one person's book")}</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className={`${label} flex-1`}>
            {t("ابحث عن الشخص (الاسم أو الجوّال أو البريد)", "Find the person (name, phone or email)")}
            <input name="q" defaultValue={q} className={field} />
          </label>
          <button type="submit" className={button}>{t("ابحث", "Search")}</button>
        </form>
        {q && people.length === 0 && <p className="mt-3 text-sm text-muted">{t("لا أحد بهذا الوصف.", "No one matches.")}</p>}
        <ul className="mt-3 space-y-3">
          {people.map((p) => (
            <li key={p.id} className={`${card} text-sm`}>
              <p className="font-bold">{p.full_name || "—"} <span className="font-normal text-muted">· {p.phone ?? p.email ?? ""}</span></p>
              <details className="mt-2">
                <summary className="cursor-pointer text-primary">{t("افتح فحصاً على دفتره", "Open an inspection of their book")}</summary>
                <form action={openInspection} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="user_id" value={p.id} />
                  <label className={label}>
                    {t("الدفتر", "Book")}
                    <select name="kind" className={field} defaultValue="farm">
                      <option value="farm">{t("دفتر المزرعة", "Farm book")}</option>
                      <option value="investor">{t("دفتر المستثمر", "Investor book")}</option>
                    </select>
                  </label>
                  <label className={label}>
                    {t("السبب (١٠ أحرفٍ فأكثر) — يراه صاحب الدفتر", "Reason (10 characters or more) — the book's owner sees it")}
                    <textarea name="reason" required minLength={10} maxLength={500} rows={2} className={field} />
                  </label>
                  <label className={label}>
                    {t("المدّة بالساعات (الافتراضيّ ٢٤، الأقصى ٧٢)", "Length in hours (default 24, maximum 72)")}
                    <input name="hours" type="number" min={1} max={72} className={field} />
                  </label>
                  <button type="submit" className={`${button} self-start`}>
                    {t("افتح الفحص وأخطِر صاحبه", "Open the inspection and notify the owner")}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 mt-6 text-sm font-bold">{t("الفحوص", "Inspections")}</h3>
        <div className={box}>
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className={th}>{t("الدفتر", "Book")}</th>
                <th className={th}>{t("السبب", "Reason")}</th>
                <th className={th}>{t("فُتح", "Opened")}</th>
                <th className={th}>{t("ينتهي", "Ends")}</th>
                <th className={th}>{t("الحالة", "Status")}</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {inspections.length === 0 && <tr><td className={td} colSpan={6}>{t("لا فحوص.", "No inspections.")}</td></tr>}
              {inspections.map((i) => {
                const st = inspectionState(i, now);
                return (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className={td}>{i.book_kind === "investor" ? t("مستثمر", "Investor") : t("مزرعة", "Farm")}</td>
                    <td className={td}>{i.reason}</td>
                    <td className={td}>{when(i.opened_at, locale)}</td>
                    <td className={td}>{i.closed_at ? when(i.closed_at, locale) : when(i.expires_at, locale)}</td>
                    <td className={td}>
                      {st === "active" ? t("جارٍ", "Running") : st === "closed" ? t("أُغلق", "Closed") : t("انتهى بالوقت", "Expired")}
                    </td>
                    <td className={td}>
                      {st === "active" && (
                        <div className="flex flex-col gap-2">
                          <Link className="text-primary underline" href={`/books?book=${i.book_kind}&id=${i.book_id}`}>{t("اقرأ الدفتر", "Read the book")}</Link>
                          <form action={closeInspection}>
                            <input type="hidden" name="inspection_id" value={i.id} />
                            <button type="submit" className={ghost}>{t("أغلق الفحص", "Close the inspection")}</button>
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
        <p className="mt-2 text-xs text-muted">
          {t(
            "القراءة فقط: لا تملك الإدارة كتابة قيدٍ في دفتر أحد. وحين تفتح فحصاً على دفتر مزارعٍ، يظهر لك ذلك الدفتر وحده في «دفتر الحسابات» حتى يُغلق الفحص أو ينتهي.",
            "Read only: administrators cannot write an entry in anyone's book. When you open an inspection of a farmer's book, that book alone shows for you in “Books” until the inspection is closed or expires.",
          )}
        </p>
      </section>
    </div>
  );
}
