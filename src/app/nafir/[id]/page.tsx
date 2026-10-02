import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { NAFIR_KINDS, ar, dateAr, type NafirCall, type NafirJoin } from "@/lib/nafir";
import { closeCall, joinCall, leaveCall } from "../actions";

export const metadata = { title: "دعوة نفير | سودغري" };

/**
 * One call: what, where, when; who has answered by the name they chose; and,
 * for the host, the close — with what was achieved, because a nafir that ends
 * in a sentence of what got done is the invitation to the next one.
 */
export default async function CallPage({
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

  const [{ data: callRow }, { data: joinRows }] = await Promise.all([
    supabase.from("nafir_calls").select("*").eq("id", id).maybeSingle(),
    supabase.from("nafir_joins").select("*").eq("call_id", id).order("joined_at"),
  ]);
  const call = callRow as NafirCall | null;
  if (!call) notFound();
  const joins = (joinRows ?? []) as NafirJoin[];
  const mine = user ? joins.find((j) => j.user_id === user.id) : undefined;
  const isHost = user?.id === call.organizer_id;
  const open = call.status === "open";

  return (
    <NafirShell active="/nafir" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">
        نفير {NAFIR_KINDS[call.kind]} · {call.state} — {call.locality}
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-snug">{call.title}</h1>
      <p className="mt-1 text-sm text-muted">
        يدعو إليه {call.display_name} · {dateAr(call.starts_on)}
      </p>

      {call.status === "done" && (
        <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-xs text-primary">أُنجز</p>
          <p className="mt-1 font-bold">{call.outcome}</p>
          <p className="figure mt-1 text-sm">حضره {ar(call.attended ?? 0)}</p>
        </div>
      )}
      {call.status === "cancelled" && (
        <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm text-muted">أُلغيت هذه الدعوة.</p>
      )}

      <p className="mt-5 whitespace-pre-line leading-8">{call.description}</p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted">لبّى</dt>
          <dd className="figure text-xl font-black text-primary">
            {ar(joins.length)} <span className="text-sm font-normal text-muted">من {ar(call.needed)}</span>
          </dd>
        </div>
        {call.hosting && (
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted">يقدّم المضيف</dt>
            <dd className="text-sm font-medium">{call.hosting}</dd>
          </div>
        )}
        {call.bring_tools && (
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted">احمل معك</dt>
            <dd className="text-sm font-medium">{call.bring_tools}</dd>
          </div>
        )}
      </dl>

      <ShareWhatsApp
        path={`/nafir/${call.id}`}
        text={`نفير ${NAFIR_KINDS[call.kind]}: ${call.title} — ${call.locality}، ${dateAr(call.starts_on)}. لبِّ النداء:`}
        className="mt-5"
      />

      {/* ───────── التلبية ───────── */}
      {open && !isHost && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          {!user ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتلبّي النداء.
            </p>
          ) : mine ? (
            <form action={leaveCall} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="call_id" value={call.id} />
              <p className="text-sm">لبّيتَ هذا النداء باسم «{mine.display_name}».</p>
              <button className={ghost}>اسحب تلبيتي</button>
            </form>
          ) : (
            <form action={joinCall} className="flex flex-col gap-3">
              <input type="hidden" name="call_id" value={call.id} />
              <h2 className="font-bold">لبِّ النداء</h2>
              <label className="flex flex-col gap-1 text-sm">
                اسمك كما يراه الناس
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ما تجيء به <span className="text-xs text-muted">(اختياري)</span>
                <input name="brings" maxLength={120} className={field} placeholder="منجلان وحمار" />
              </label>
              <button className={`${button} self-start`}>أُلبّي</button>
            </form>
          )}
        </section>
      )}

      {/* ───────── مَن لبّى ───────── */}
      {joins.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">مَن لبّى</h2>
          <ul className="flex flex-wrap gap-2">
            {joins.map((j) => (
              <li key={j.user_id} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
                {j.display_name}
                {j.brings && <span className="text-muted"> — {j.brings}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── الإغلاق ───────── */}
      {open && isHost && (
        <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <h2 className="font-bold">بعد النفير: ما الذي أُنجز؟</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            جملةٌ واحدةٌ صادقة — «حُصد ٢٠ فداناً في يوم» — تُنشر في «ما أُنجز»،
            وتجعل النفير القادم أسهل.
          </p>
          <form action={closeCall} className="flex flex-col gap-3">
            <input type="hidden" name="call_id" value={call.id} />
            <input type="hidden" name="status" value="done" />
            <input name="outcome" required minLength={5} maxLength={500} className={field} placeholder="ما أُنجز" />
            <label className="flex items-center gap-2 text-sm">
              كم حضر فعلاً؟
              <input type="number" name="attended" required min={0} max={2000} defaultValue={joins.length} className={`${field} w-28`} />
            </label>
            <button className={`${button} self-start`}>أغلق بما أُنجز</button>
          </form>
          <form action={closeCall} className="mt-3">
            <input type="hidden" name="call_id" value={call.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button className="text-sm text-danger underline">ألغِ الدعوة</button>
          </form>
        </section>
      )}
    </NafirShell>
  );
}
