import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  NAFIR_KINDS,
  NAFIR_KINDS_EN,
  ar,
  dateAr,
  label,
  stateName,
  typed,
  type NafirCall,
  type NafirJoin,
} from "@/lib/nafir";
import { closeCall, joinCall, leaveCall } from "../actions";
import { columnsFor } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "دعوة نفير | سوداقري", "Nafir call | Sudagri") };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const { supabase, user, name } = await nafirViewer();

  const [{ data: callRow }, { data: joinRows }] = await Promise.all([
    supabase.from("nafir_calls").select(columnsFor("nafir_calls", Boolean(user))).eq("id", id).maybeSingle(),
    supabase.from("nafir_joins").select(columnsFor("nafir_joins", Boolean(user))).eq("call_id", id).order("joined_at"),
  ]);
  const call = callRow as unknown as NafirCall | null;
  if (!call) notFound();
  const joins = (joinRows ?? []) as unknown as NafirJoin[];
  const mine = user ? joins.find((j) => j.user_id === user.id) : undefined;
  const isHost = user?.id === call.organizer_id;
  const open = call.status === "open";
  const kind = label(NAFIR_KINDS, NAFIR_KINDS_EN, call.kind, locale);

  return (
    <NafirShell active="/nafir" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">
        {locale === "en" ? `Nafir: ${kind}` : `نفير ${kind}`} · {stateName(call.state, locale)} — <bdi>{call.locality}</bdi>
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-snug" {...typed(locale)}>{call.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {t("يدعو إليه", "Called by")} <bdi>{call.display_name}</bdi> · {dateAr(call.starts_on, locale)}
      </p>

      {call.status === "done" && (
        <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-xs text-primary">{t("أُنجز", "Done")}</p>
          <p className="mt-1 font-bold" {...typed(locale)}>{call.outcome}</p>
          <p className="figure mt-1 text-sm">
            {locale === "en" ? `${n(call.attended ?? 0)} attended` : `حضره ${n(call.attended ?? 0)}`}
          </p>
        </div>
      )}
      {call.status === "cancelled" && (
        <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm text-muted">{t("أُلغيت هذه الدعوة.", "This call was cancelled.")}</p>
      )}

      <p className="mt-5 whitespace-pre-line leading-8" {...typed(locale)}>{call.description}</p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-xs text-muted">{t("لبّى", "Answered")}</dt>
          <dd className="figure text-xl font-black text-primary">
            {n(joins.length)} <span className="text-sm font-normal text-muted">{t("من", "of")} {n(call.needed)}</span>
          </dd>
        </div>
        {call.hosting && (
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted">{t("يقدّم المضيف", "The host provides")}</dt>
            <dd className="text-sm font-medium" {...typed(locale)}>{call.hosting}</dd>
          </div>
        )}
        {call.bring_tools && (
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted">{t("احمل معك", "Bring with you")}</dt>
            <dd className="text-sm font-medium" {...typed(locale)}>{call.bring_tools}</dd>
          </div>
        )}
      </dl>

      <ShareWhatsApp
        path={`/nafir/${call.id}`}
        text={
          locale === "en"
            ? `Nafir (${kind}): ${call.title} — ${call.locality}, ${dateAr(call.starts_on, locale)}. Answer the call:`
            : `نفير ${kind}: ${call.title} — ${call.locality}، ${dateAr(call.starts_on)}. لبِّ النداء:`
        }
        className="mt-5"
        locale={locale}
      />

      {/* ───────── التلبية ───────── */}
      {open && !isHost && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          {!user ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
              {t("لتلبّي النداء.", "to answer the call.")}
            </p>
          ) : mine ? (
            <form action={leaveCall} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="call_id" value={call.id} />
              <p className="text-sm">
                {locale === "en" ? (
                  <>You answered this call as “<bdi>{mine.display_name}</bdi>”.</>
                ) : (
                  <>لبّيتَ هذا النداء باسم «{mine.display_name}».</>
                )}
              </p>
              <button className={ghost}>{t("اسحب تلبيتي", "Withdraw my answer")}</button>
            </form>
          ) : (
            <form action={joinCall} className="flex flex-col gap-3">
              <input type="hidden" name="call_id" value={call.id} />
              <h2 className="font-bold">{t("لبِّ النداء", "Answer the call")}</h2>
              <label className="flex flex-col gap-1 text-sm">
                {t("اسمك كما يراه الناس", "Your name as others will see it")}
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("ما تجيء به", "What you will bring")} <span className="text-xs text-muted">{t("(اختياري)", "(optional)")}</span>
                <input name="brings" maxLength={120} className={field} placeholder={t("منجلان وحمار", "Two sickles and a donkey")} />
              </label>
              <button className={`${button} self-start`}>{t("أُلبّي", "I’ll come")}</button>
            </form>
          )}
        </section>
      )}

      {/* ───────── مَن لبّى ───────── */}
      {joins.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">{t("مَن لبّى", "Who answered")}</h2>
          <ul className="flex flex-wrap gap-2">
            {joins.map((j, i) => (
              <li key={j.user_id ?? i} className="rounded-full border border-border bg-card px-3 py-1 text-sm" {...typed(locale)}>
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
          <h2 className="font-bold">{t("بعد النفير: ما الذي أُنجز؟", "After the nafir: what got done?")}</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            {t(
              "جملةٌ واحدةٌ صادقة — «حُصد ٢٠ فداناً في يوم» — تُنشر في «ما أُنجز»، وتجعل النفير القادم أسهل.",
              "One honest sentence — “20 feddans harvested in a day” — is published under “What got done” and makes the next nafir easier.",
            )}
          </p>
          <form action={closeCall} className="flex flex-col gap-3">
            <input type="hidden" name="call_id" value={call.id} />
            <input type="hidden" name="status" value="done" />
            <input name="outcome" required minLength={5} maxLength={500} className={field} placeholder={t("ما أُنجز", "What got done")} />
            <label className="flex items-center gap-2 text-sm">
              {t("كم حضر فعلاً؟", "How many actually came?")}
              <input type="number" name="attended" required min={0} max={2000} defaultValue={joins.length} className={`${field} w-28`} />
            </label>
            <button className={`${button} self-start`}>{t("أغلق بما أُنجز", "Close with what got done")}</button>
          </form>
          <form action={closeCall} className="mt-3">
            <input type="hidden" name="call_id" value={call.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button className="text-sm text-danger underline">{t("ألغِ الدعوة", "Cancel the call")}</button>
          </form>
        </section>
      )}
    </NafirShell>
  );
}
