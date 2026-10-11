import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  WEEKDAYS,
  WEEKDAYS_EN,
  ar,
  dateAr,
  maintenanceShares,
  stateName,
  typed,
  type CanalMember,
  type CanalSummary,
  type CanalTurn,
  type NafirCall,
} from "@/lib/nafir";
import { decide, leave, requestJoin, setMember, setTurns } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "ترعة | سوداقري", "Canal | Sudagri") };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const en = locale === "en";
  const weekdays = en ? WEEKDAYS_EN : WEEKDAYS;
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
  const feddans = (x: number) => (en ? `${n(x)} feddans` : `${n(x)} فدان`);

  return (
    <NafirShell active="/nafir/canals" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">
        {t("ترعة", "Canal")} · {stateName(canal.state, locale)} — <bdi>{canal.locality}</bdi>
      </p>
      <h1 className="mt-1 text-2xl font-bold" {...typed(locale)}>{canal.name}</h1>
      {canal.description && <p className="mt-2 leading-8 text-muted" {...typed(locale)}>{canal.description}</p>}
      <p className="figure mt-2 text-sm">
        {en ? `${n(Number(canal.members))} members` : `${n(Number(canal.members))} عضواً`} · {feddans(Number(canal.feddans))}
      </p>

      {/* ───────── الانضمام ───────── */}
      {!me && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          {!user ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
              {t("لتطلب الانضمام إلى هذه الترعة.", "to ask to join this canal.")}
            </p>
          ) : (
            <form action={requestJoin} className="flex flex-col gap-3">
              <input type="hidden" name="canal_id" value={canal.id} />
              <h2 className="font-bold">{t("اطلب الانضمام", "Ask to join")}</h2>
              <p className="text-sm text-muted">
                {t(
                  "يقبلك قيّم الترعة ويثبّت فدادينك؛ وعليها يُحسب نصيبك من الصيانة.",
                  "The canal’s steward accepts you and confirms your feddans; your share of the upkeep is calculated from them.",
                )}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="display_name"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={name}
                  aria-label={t("اسمك", "Your name")}
                  className={field}
                />
                <input
                  type="number"
                  name="feddans"
                  required
                  min={0.25}
                  max={10000}
                  step={0.25}
                  placeholder={t("فدادينك التي تسقيها", "Feddans it waters for you")}
                  aria-label={t("فدادينك التي تسقيها", "Feddans it waters for you")}
                  className={field}
                />
              </div>
              <button className={`${button} self-start`}>{t("أرسل الطلب", "Send the request")}</button>
            </form>
          )}
        </section>
      )}
      {me?.status === "pending" && (
        <p className="mt-6 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
          {t("طلبك ينتظر قيّم الترعة.", "Your request is waiting for the canal’s steward.")}
        </p>
      )}

      {isMember && (
        <>
          <ShareWhatsApp
            path={`/nafir/canals/${canal.id}`}
            text={
              en
                ? `The ${canal.name} canal on Sudagri — ask to join to see the watering turns and the upkeep shares:`
                : `ترعة ${canal.name} على سوداقري — اطلب الانضمام لترى النوبات وواجب الصيانة:`
            }
            className="mt-4"
            locale={locale}
          />

          {/* ───────── الأعضاء والنصيب ───────── */}
          <section className="mt-6">
            <h2 className="mb-1 text-lg font-bold">{t("الأعضاء ونصيب كلٍّ من الصيانة", "Members and each one’s share of the upkeep")}</h2>
            <p className="mb-3 text-sm text-muted">
              {t(
                "النصيب بقدر الفدادين: مَن تسقي له الترعة أكثر، عليه من تطهيرها وإصلاحها أكثر.",
                "Shares follow the feddans: whoever the canal waters more does more of the clearing and repairs.",
              )}
            </p>
            <ul className="flex flex-col gap-2">
              {active.map((m) => (
                <li key={m.user_id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong><bdi>{m.display_name}</bdi></strong>
                      {m.role === "steward" && (
                        <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t("قيّم", "Steward")}</span>
                      )}
                      <span className="figure block text-xs text-muted">{feddans(Number(m.feddans))}</span>
                    </span>
                    <span className="figure text-lg font-black text-primary">
                      {n(Math.round((shares.get(m.user_id) ?? 0) * 100))}
                      {en ? "%" : "٪"}
                    </span>
                  </div>
                  {isSteward && (
                    <form action={setMember} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input
                        type="number"
                        name="feddans"
                        defaultValue={Number(m.feddans)}
                        min={0.25}
                        max={10000}
                        step={0.25}
                        aria-label={t("الفدادين", "Feddans")}
                        className={`${field} w-28`}
                      />
                      <select name="role" defaultValue={m.role} aria-label={t("الدور", "Role")} className={`${field} w-28`}>
                        <option value="member">{t("عضو", "Member")}</option>
                        <option value="steward">{t("قيّم", "Steward")}</option>
                      </select>
                      <button className={ghost}>{t("عدّل", "Update")}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isSteward && pending.length > 0 && (
            <section className="mt-6 rounded-2xl border border-accent/40 bg-accent/5 p-4">
              <h2 className="mb-2 font-bold">{t("طلبات الانضمام", "Requests to join")}</h2>
              <ul className="flex flex-col gap-2">
                {pending.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="me-auto">
                      <bdi>{m.display_name}</bdi> —{" "}
                      {en ? `says ${n(Number(m.feddans))} feddans` : `يقول ${n(Number(m.feddans))} فدان`}
                    </span>
                    <form action={decide} className="flex items-center gap-2">
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="accept" value="1" />
                      <input
                        type="number"
                        name="feddans"
                        defaultValue={Number(m.feddans)}
                        min={0.25}
                        max={10000}
                        step={0.25}
                        aria-label={t("الفدادين", "Feddans")}
                        className={`${field} w-24`}
                      />
                      <button className={button}>{t("اقبل", "Accept")}</button>
                    </form>
                    <form action={decide}>
                      <input type="hidden" name="canal_id" value={canal.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="accept" value="0" />
                      <button className={ghost}>{t("ردّ", "Decline")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ───────── النوبات ───────── */}
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">{t("نوبات الماء", "Watering turns")}</h2>
            {turns.length === 0 ? (
              <p className="text-sm text-muted">{t("لم يُكتب جدولٌ بعد.", "No schedule has been written yet.")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="p-2 text-start font-medium">{t("اليوم", "Day")}</th>
                      <th className="p-2 text-start font-medium">{t("من", "From")}</th>
                      <th className="p-2 text-start font-medium">{t("إلى", "To")}</th>
                      <th className="p-2 text-start font-medium">{t("لمن", "For")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turns.map((turn) => (
                      <tr key={turn.id} className={`border-t border-border ${turn.user_id === user?.id ? "bg-primary/5 font-bold" : ""}`}>
                        <td className="p-2">{weekdays[turn.weekday]}</td>
                        <td className="figure p-2" dir="ltr">{hhmm(turn.starts)}</td>
                        <td className="figure p-2" dir="ltr">{hhmm(turn.ends)}</td>
                        <td className="p-2"><bdi>{nameOf(turn.user_id)}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isSteward && (
              <details className="mt-3 rounded-xl border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">{t("اكتب جدول النوبات", "Write the watering schedule")}</summary>
                <form action={setTurns} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="canal_id" value={canal.id} />
                  <p className="text-xs text-muted">
                    {t(
                      "الجدول يُحفظ كلّه مرّةً واحدة. اترك الصفوف الفارغة كما هي.",
                      "The whole schedule is saved at once. Leave empty rows as they are.",
                    )}
                  </p>
                  {[...turns.map((turn) => turn as CanalTurn | null), ...Array.from({ length: 6 }, () => null)].map((turn, k) => (
                    <div key={k} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <select name="t_user" defaultValue={turn?.user_id ?? ""} aria-label={t("لمن", "For")} className={field}>
                        <option value="">—</option>
                        {active.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                      </select>
                      <select name="t_day" defaultValue={turn?.weekday ?? 0} aria-label={t("اليوم", "Day")} className={field}>
                        {weekdays.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                      <input type="time" name="t_starts" defaultValue={turn ? hhmm(turn.starts) : ""} aria-label={t("من", "From")} className={field} />
                      <input type="time" name="t_ends" defaultValue={turn ? hhmm(turn.ends) : ""} aria-label={t("إلى", "To")} className={field} />
                    </div>
                  ))}
                  <button className={`${button} self-start`}>{t("احفظ الجدول", "Save the schedule")}</button>
                </form>
              </details>
            )}
          </section>

          {/* ───────── نفير الترعة ───────── */}
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{t("نفير تطهير الترعة", "Canal-clearing nafirs")}</h2>
              <Link href={`/nafir/new?canal=${canal.id}`} className="text-sm text-primary underline">{t("ادعُ إلى نفير", "Call a nafir")}</Link>
            </div>
            {calls.length === 0 ? (
              <p className="text-sm text-muted">{t("لم يُدعَ إلى نفيرٍ لهذه الترعة بعد.", "No nafir has been called for this canal yet.")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {calls.map((c) => (
                  <li key={c.id}>
                    <Link href={`/nafir/${c.id}`} className="block rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary">
                      <strong {...typed(locale)}>{c.status === "done" ? c.outcome : c.title}</strong>
                      <span className="block text-xs text-muted">
                        {dateAr(c.starts_on, locale)} ·{" "}
                        {c.status === "done"
                          ? en
                            ? `${n(c.attended ?? 0)} attended`
                            : `حضره ${n(c.attended ?? 0)}`
                          : c.status === "open"
                            ? t("مفتوح", "Open")
                            : t("أُلغي", "Cancelled")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form action={leave} className="mt-8">
            <input type="hidden" name="canal_id" value={canal.id} />
            <button className="text-sm text-danger underline">{t("غادر الترعة", "Leave the canal")}</button>
          </form>
        </>
      )}
    </NafirShell>
  );
}
