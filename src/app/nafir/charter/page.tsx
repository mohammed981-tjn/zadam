import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import {
  CHARTER_REFERENCE,
  CHARTER_VERSION,
  LEADER_VALUES,
  MEMBER_VALUES,
  SUDAN_STATES,
  ar,
  type CharterValue,
} from "@/lib/nafir";
import { signCharter, verifyLeader, withdrawSignature } from "../actions";

export const metadata = {
  title: "ميثاق النفير | سودجري",
  description:
    "مرجعيّةٌ وقيمٌ للقادة وللقاعدة، لكلّ قيمةٍ آليّةٌ تُمارَس بها في المنصّة — ويُوقَّع علناً.",
};

interface Signature {
  user_id: string;
  role: "leader" | "member";
  display_name: string;
  pledge: string | null;
  state: string | null;
  signed_at: string;
  verified_at: string | null;
}

/**
 * The charter as a page that does something: each value names where on the
 * platform it is practised, and the page ends with the signature — leaders by
 * name first, because a leader who signs publicly has made himself answerable,
 * and that is the whole of what leading by example means here.
 */
export default async function CharterPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { supabase, user, name, isAdmin } = await nafirViewer();
  const { data } = await supabase
    .from("charter_signatures")
    .select("*")
    .eq("charter_version", CHARTER_VERSION)
    .order("signed_at", { ascending: true });
  const sigs = (data ?? []) as Signature[];
  const leaders = sigs.filter((s) => s.role === "leader");
  const members = sigs.filter((s) => s.role === "member");
  const mine = user ? sigs.find((s) => s.user_id === user.id) : undefined;
  const pledges = members.filter((m) => m.pledge).slice(-8).reverse();

  return (
    <NafirShell active="/nafir/charter" ok={ok} error={error}>
      <h1 className="text-2xl font-black sm:text-3xl">ميثاق النفير</h1>
      <p className="mt-2 text-sm text-muted">النسخة {ar(CHARTER_VERSION)} · وقّعه {ar(sigs.length)}</p>

      {/* ───────── المرجعيّة ───────── */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">المرجعيّة: من أين تأتي الإرادة</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHARTER_REFERENCE.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-bold text-primary">{r.title}</h3>
              <p className="mt-2 text-sm leading-7">{r.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-7">
          <strong>النفير طوعٌ لا يُفرض.</strong> لا تُعلَّق عليه شارةُ جهةٍ ولا
          حزب، ولا يُرتَّب فيه الناس ولا يُعيَّر مَن لم يحضر. هكذا عاش النفير
          في الريف، وهكذا يبقى هنا.
        </p>
      </section>

      <Values title="قيم القادة" hint="ما يلتزم به مَن يقود — ويُسأل عنه علناً" values={LEADER_VALUES} />
      <Values title="قيم القاعدة" hint="ما يلتزم به كلّ عضو — ويُمارَس في المنصّة" values={MEMBER_VALUES} />

      {/* ───────── التوقيع ───────── */}
      <section id="sign" className="mt-10 scroll-mt-20 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">التوقيع</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتوقّع الميثاق.
          </p>
        ) : mine ? (
          <form action={withdrawSignature} className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              وقّعتَ باسم «{mine.display_name}»
              {mine.role === "leader" ? (mine.verified_at ? " قائداً متحقَّقاً منه." : " قائداً — ينتظر التحقّق.") : "."}
            </p>
            <button className={ghost}>اسحب توقيعي</button>
          </form>
        ) : (
          <form action={signCharter} className="mt-3 flex flex-col gap-3">
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="role" value="member" defaultChecked /> أوقّع عضواً
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="role" value="leader" /> أوقّع قائداً (رئيس تعاونية، شيخ، مدير مشروع…)
              </label>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                الاسم تحت التوقيع
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                الولاية <span className="text-xs text-muted">(اختياري)</span>
                <select name="state" className={field} defaultValue="">
                  <option value="">—</option>
                  {SUDAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              عهدك بكلماتك <span className="text-xs text-muted">(اختياري — «ألتزم أن…»)</span>
              <input name="pledge" maxLength={200} className={field} placeholder="ألتزم أن ألبّي نفير جيراني في الحصاد" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agree" required className="mt-1" />
              قرأتُ الميثاق، وأختاره طوعاً، وأعرف أنّ اسمي سيظهر تحته.
            </label>
            <button className={`${button} self-start`}>أوقّع</button>
          </form>
        )}
      </section>

      {/* ───────── الموقّعون ───────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">القادة الموقّعون ({ar(leaders.length)})</h2>
        {leaders.length === 0 ? (
          <p className="text-sm text-muted">لم يوقّع قائدٌ بعد. القدوة تبدأ بأوّلهم.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leaders.map((l) => (
              <li key={l.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <span className="font-bold">{l.display_name}</span>
                  {l.state && <span className="text-sm text-muted"> · {l.state}</span>}
                  <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${l.verified_at ? "bg-primary/15 text-primary" : "bg-border text-muted"}`}>
                    {l.verified_at ? "متحقَّقٌ منه" : "لم يُتحقَّق بعد"}
                  </span>
                  {l.pledge && <p className="mt-1 text-sm text-muted">«{l.pledge}»</p>}
                </div>
                {isAdmin && !l.verified_at && (
                  <form action={verifyLeader}>
                    <input type="hidden" name="user_id" value={l.user_id} />
                    <button className={ghost}>تحقّقتُ منه</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <h2 className="mb-3 mt-6 text-lg font-bold">الأعضاء الموقّعون ({ar(members.length)})</h2>
        {pledges.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pledges.map((m) => (
              <li key={m.user_id} className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
                «{m.pledge}» <span className="text-muted">— {m.display_name}{m.state ? `، ${m.state}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShareWhatsApp path="/nafir/charter" text="ميثاق النفير على سودجري — قيمٌ تعمل لا تُعلَّق. اقرأه ووقّع:" className="mt-6" />
    </NafirShell>
  );
}

function Values({ title, hint, values }: { title: string; hint: string; values: CharterValue[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {values.map((v) => (
          <li key={v.key} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-bold">{v.title}</h3>
              <span className="text-xs text-muted">{v.root}</span>
            </div>
            <p className="text-sm leading-7">{v.commitment}</p>
            <p className="mt-auto rounded-lg bg-primary/5 px-3 py-2 text-xs leading-6">
              <span className="font-medium text-primary">كيف تُمارَس: </span>
              {v.href ? (
                <Link href={v.href} className="underline">{v.practice}</Link>
              ) : (
                v.practice
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
