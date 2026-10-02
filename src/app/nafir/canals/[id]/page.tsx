import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import {
  WEEKDAYS,
  ar,
  dateAr,
  maintenanceShares,
  type CanalMember,
  type CanalSummary,
  type CanalTurn,
  type NafirCall,
} from "@/lib/nafir";
import { decide, leave, requestJoin, setMember, setTurns } from "../actions";

export const metadata = { title: "ترعة | سوداغري" };

const hhmm = (t: string) => t.slice(0, 5);

/**
 * One canal. The public sees what the directory shows and a way to ask to
 * join; members see the roster with each one's share of the maintenance, the
 * weekly turns, and the nafirs called for this canal; stewards also see the
 * applications and edit the roster and the schedule. Row-level security
 * decides who reads what; this page only chooses what to draw.
 */
export default async function CanalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user, name } = await nafirViewer();

  const [{ data: dir }, { data: memberRows }, { data: turnRows }, { data: callRows }] = await Promise.all([
    supabase.rpc("canal_directory"),
    user ? supabase.from("canal_members").select("*").eq("canal_id", id) : Promise.resolve({ data: [] }),
    user ? supabase.from("canal_turns").select("*").eq("canal_id", id).order("weekday").order("starts") : Promise.resolve({ data: [] }),
    supabase.from("nafir_calls").select("*").eq("canal_id", id).order("starts_on", { ascending: false }).limit(10),
  ]);
  const canal = ((dir ?? []) as CanalSummary[]).find((c) => c.id === id);
  if (!canal) notFound();
  const members = (memberRows ?? []) as CanalMember[];
  const turns = (turnRows ?? []) as CanalTurn[];
  const calls = (callRows ?? []) as NafirCall[];
  const me = user ? members.find((m) => m.user_id === user.id) : undefined;
  const isMember = me?.status === "member";
  const isSteward = isMember && me?.role === "steward";
  const active = members.filter((m) => m.status === "member");
  const pending = members.filter((m) => m.status === "pending");
  const shares = maintenanceShares(members);
  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.display_name ?? "—";

  return (
    <NafirShell active="/nafir/canals" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">ترعة · {canal.state} — {canal.locality}</p>
      <h1 className="mt-1 text-2xl font-bold">{canal.name}</h1>
      {canal.description && <p className="mt-2 leading-8 text-muted">{canal.description}</p>}
      <p className="figure mt-2 text-sm">{ar(Number(canal.members))} عضواً · {ar(Number(canal.feddans))} فدان</p>

      {/* ───────── الانضمام ───────── */}
      {!me && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          {!user ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتطلب الانضمام إلى هذه الترعة.
            </p>
          ) : (
            <form action={requestJoin} className="flex flex-col gap-3">
              <input type="hidden" name="canal_id" value={canal.id} />
              <h2 className="font-bold">اطلب الانضمام</h2>
              <p className="text-sm text-muted">يقبلك قيّم الترعة ويثبّت فدادينك؛ وعليها يُحسب نصيبك من الصيانة.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
                <input type="number" name="feddans" required min={0.25} max={10000} step={0.25} placeholder="فدادينك التي تسقيها" className={field} />
              </div>
              <button className={`${button} self-start`}>أرسل الطلب</button>
            </form>
          )}
        </section>
      )}
      {me?.status === "pending" && (
        <p className="mt-6 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">طلبك ينتظر قيّم الترعة.</p>
      )}

      {isMember && (
        <>
          <ShareWhatsApp path={`/nafir/canals/${canal.id}`} text={`ترعة ${canal.name} على سوداغري — اطلب الانضمام لترى النوبات وواجب الصيانة:`} className="mt-4" />

          {/* ───────── الأعضاء والنصيب ───────── */}
          <section className="mt-6">
            <h2 className="mb-1 text-lg font-bold">الأعضاء ونصيب كلٍّ من الصيانة</h2>
            <p className="mb-3 text-sm text-muted">
              النصيب بقدر الفدادين: مَن تسقي له الترعة أكثر، عليه من تطهيرها وإصلاحها أكثر.
            </p>
            <ul className="flex flex-col gap-2">
              {active.map((m) => (
                <li key={m.user_id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{m.display_name}</strong>
                      {m.role === "steward" && <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">قيّم</span>}
                      <span className="figure block text-xs text-muted">{ar(Number(m.feddans))} فدان</span>
                    </span>
                    <span className="figure text-lg font-black text-primary">{ar(Math.round((shares.get(m.user_id) ?? 0) * 100))}٪</span>
                  </div>
                  {isSteward && (
                    <form action={setMember} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="number" name="feddans" defaultValue={Number(m.feddans)} min={0.25} max={10000} step={0.25} className={`${field} w-28`} />
                      <select name="role" defaultValue={m.role} className={`${field} w-28`}>
                        <option value="member">عضو</option>
                        <option value="steward">قيّم</option>
                      </select>
                      <button className={ghost}>عدّل</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isSteward && pending.length > 0 && (
            <section className="mt-6 rounded-2xl border border-accent/40 bg-accent/5 p-4">
              <h2 className="mb-2 font-bold">طلبات الانضمام</h2>
              <ul className="flex flex-col gap-2">
                {pending.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="me-auto">{m.display_name} — يقول {ar(Number(m.feddans))} فدان</span>
                    <form action={decide} className="flex items-center gap-2">
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="accept" value="1" />
                      <input type="number" name="feddans" defaultValue={Number(m.feddans)} min={0.25} max={10000} step={0.25} className={`${field} w-24`} />
                      <button className={button}>اقبل</button>
                    </form>
                    <form action={decide}>
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="accept" value="0" />
                      <button className={ghost}>ردّ</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ───────── النوبات ───────── */}
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">نوبات الماء</h2>
            {turns.length === 0 ? (
              <p className="text-sm text-muted">لم يُكتب جدولٌ بعد.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="p-2 text-start font-medium">اليوم</th>
                      <th className="p-2 text-start font-medium">من</th>
                      <th className="p-2 text-start font-medium">إلى</th>
                      <th className="p-2 text-start font-medium">لمن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turns.map((t) => (
                      <tr key={t.id} className={`border-t border-border ${t.user_id === user?.id ? "bg-primary/5 font-bold" : ""}`}>
                        <td className="p-2">{WEEKDAYS[t.weekday]}</td>
                        <td className="figure p-2" dir="ltr">{hhmm(t.starts)}</td>
                        <td className="figure p-2" dir="ltr">{hhmm(t.ends)}</td>
                        <td className="p-2">{nameOf(t.user_id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isSteward && (
              <details className="mt-3 rounded-xl border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">اكتب جدول النوبات</summary>
                <form action={setTurns} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="canal_id" value={canal.id} />
                  <p className="text-xs text-muted">الجدول يُحفظ كلّه مرّةً واحدة. اترك الصفوف الفارغة كما هي.</p>
                  {[...turns.map((t) => t as CanalTurn | null), ...Array.from({ length: 6 }, () => null)].map((t, k) => (
                    <div key={k} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <select name="t_user" defaultValue={t?.user_id ?? ""} className={field}>
                        <option value="">—</option>
                        {active.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                      </select>
                      <select name="t_day" defaultValue={t?.weekday ?? 0} className={field}>
                        {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                      <input type="time" name="t_starts" defaultValue={t ? hhmm(t.starts) : ""} className={field} />
                      <input type="time" name="t_ends" defaultValue={t ? hhmm(t.ends) : ""} className={field} />
                    </div>
                  ))}
                  <button className={`${button} self-start`}>احفظ الجدول</button>
                </form>
              </details>
            )}
          </section>

          {/* ───────── نفير الترعة ───────── */}
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">نفير تطهير الترعة</h2>
              <Link href={`/nafir/new?canal=${canal.id}`} className="text-sm text-primary underline">ادعُ إلى نفير</Link>
            </div>
            {calls.length === 0 ? (
              <p className="text-sm text-muted">لم يُدعَ إلى نفيرٍ لهذه الترعة بعد.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {calls.map((c) => (
                  <li key={c.id}>
                    <Link href={`/nafir/${c.id}`} className="block rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary">
                      <strong>{c.status === "done" ? c.outcome : c.title}</strong>
                      <span className="block text-xs text-muted">
                        {dateAr(c.starts_on)} · {c.status === "done" ? `حضره ${ar(c.attended ?? 0)}` : c.status === "open" ? "مفتوح" : "أُلغي"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form action={leave} className="mt-8">
            <input type="hidden" name="canal_id" value={canal.id} />
            <button className="text-sm text-danger underline">غادر الترعة</button>
          </form>
        </>
      )}
    </NafirShell>
  );
}
