import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NafirShell, { button, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import FilmPlayer from "@/components/FilmPlayer";
import {
  FAZA_CAUSES,
  NAFIR_KINDS,
  ar,
  ageAr,
  dateAr,
  type FazaRequest,
  type NafirCall,
  type NafirIndicators,
} from "@/lib/nafir";

export const metadata = {
  title: "النفير — العمل المشترك | سودغري",
  description:
    "النفير والفزعة والشورى: قيم الريف السوداني أدواتٍ تعمل — دعوةٌ إلى عملٍ جماعي، ونجدةٌ لمن أصابته جائحة، وقادةٌ يُسألون علناً.",
};

/**
 * الساحة: ما يُدعى إليه الآن، وما أُنجز، والأرقام التي تقول هل القيم تعمل.
 *
 * The page leads with action, not with the charter: a person arriving should
 * see a nafir they could join this week before they read why joining matters.
 * The why is one click away, and the numbers at the bottom are the charter's
 * promise kept in public — trust, participation, impact, the three measures
 * the plan named.
 */
export default async function NafirPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const supabase = await createClient();

  const [calls, done, faza, ind, joins] = await Promise.all([
    supabase
      .from("nafir_calls")
      .select("*")
      .eq("status", "open")
      .order("starts_on", { ascending: true })
      .limit(20),
    supabase
      .from("nafir_calls")
      .select("*")
      .eq("status", "done")
      .order("closed_at", { ascending: false })
      .limit(6),
    supabase
      .from("faza_requests")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.rpc("nafir_indicators").single(),
    supabase.from("nafir_joins").select("call_id"),
  ]);

  const open = (calls.data ?? []) as NafirCall[];
  const finished = (done.data ?? []) as NafirCall[];
  const needs = (faza.data ?? []) as FazaRequest[];
  const i = ind.data as NafirIndicators | null;
  const joined = new Map<string, number>();
  for (const j of (joins.data ?? []) as { call_id: string }[]) {
    joined.set(j.call_id, (joined.get(j.call_id) ?? 0) + 1);
  }

  return (
    <NafirShell active="/nafir" ok={ok} error={error}>
      <header className="mb-8">
        <h1 className="text-2xl font-black sm:text-3xl">النفير — العمل المشترك</h1>
        <p className="mt-3 max-w-2xl leading-8 text-muted">
          «المؤمن للمؤمن كالبنيان يشدّ بعضه بعضاً». هنا يدعو المزارع جيرانه إلى
          حصادٍ أو تطهير قناة، ويطلب مَن أصابته جائحةٌ فزعةً غير مالية، ويُسأل
          القادة علناً فيُجيبون. قيمٌ يعرفها الريف السوداني — صارت أداةً أوسع.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/nafir/new" className={button}>
            ادعُ إلى نفير
          </Link>
          <Link href="/nafir/faza/new" className={ghost}>
            اطلب فزعة
          </Link>
          <Link href="/nafir/charter" className={ghost}>
            اقرأ الميثاق ووقّع
          </Link>
        </div>
        <ShareWhatsApp path="/nafir" text="النفير على سودغري — ادعُ جيرانك إلى العمل، أو لبِّ نداءهم:" className="mt-4" />
      </header>

      {/* The owner's nafir clips (4 October): the call, the harvest, the meal, the judiyya, the leader in the canal, the promise kept, care in the work, the shura, the call on a phone, the palm offshoot. */}
      <figure className="mb-10">
        <FilmPlayer base="/video/nafir-wide" poster="/video/nafir-wide.jpg" label="فيلم سودغري: النفير… قيمٌ تعمل" />
      </figure>

      {/* ───────── دعواتٌ مفتوحة ───────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">دعواتٌ مفتوحة</h2>
        {open.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            لا دعوة مفتوحة الآن. كن أوّل مَن يدعو: حصادٌ، أو زراعة، أو تطهير
            ترعة — النفير يبدأ بواحد.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((c) => {
              const n = joined.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/nafir/${c.id}`}
                    className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-card transition hover:border-primary"
                  >
                    <span className="text-xs font-medium text-primary">
                      {NAFIR_KINDS[c.kind]} · {c.state} — {c.locality}
                    </span>
                    <span className="font-bold leading-7">{c.title}</span>
                    <span className="text-xs text-muted">{dateAr(c.starts_on)}</span>
                    <span className="mt-auto flex items-center gap-2 text-xs">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (n / c.needed) * 100)}%` }}
                        />
                      </span>
                      <span className="figure shrink-0">
                        {ar(n)} من {ar(c.needed)} لبّوا
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ───────── فزعة ───────── */}
      {needs.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">يطلبون الفزعة</h2>
            <Link href="/nafir/faza" className="text-sm text-primary underline">
              كلّ الطلبات
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {needs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/nafir/faza/${r.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 transition hover:border-accent"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="text-xs text-muted">
                    {FAZA_CAUSES[r.cause]} · {r.state} · {ageAr(r.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── ما أُنجز ───────── */}
      {finished.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold">ما أُنجز</h2>
          <ul className="flex flex-col gap-3">
            {finished.map((c) => (
              <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted">
                  {NAFIR_KINDS[c.kind]} · {c.state} — {c.locality} · دعا إليه {c.display_name}
                </p>
                <p className="mt-1 font-bold">{c.outcome}</p>
                <p className="figure mt-1 text-xs text-muted">حضره {ar(c.attended ?? 0)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── المؤشّرات ───────── */}
      <section id="indicators" className="scroll-mt-20">
        <h2 className="text-xl font-bold">هل تعمل القيم؟</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          ثلاثة مقاييس وعد بها الميثاق — الثقة والمشاركة والأثر — تُحسب من
          الأفعال لا من الأقوال، وتُعلن للجميع.
        </p>
        {i ? (
          <dl
            className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}
          >
            <Stat label="وقّعوا الميثاق" value={ar(i.signers_leaders + i.signers_members)} note={`منهم ${ar(i.signers_leaders)} من القادة`} />
            <Stat label="نفيرٌ أُنجز" value={ar(i.nafir_done)} note={`حضره ${ar(i.nafir_attended)} · ${ar(i.nafir_open)} مفتوح`} />
            <Stat
              label="عهود الفزعة الموفاة"
              value={i.pledges_total ? `${ar(Math.round((i.pledges_kept / i.pledges_total) * 100))}٪` : "—"}
              note={`${ar(i.pledges_kept)} من ${ar(i.pledges_total)} · ${ar(i.faza_met)} حاجةً قُضيت`}
            />
            <Stat
              label="أسئلة الشورى المُجابة"
              value={i.shura_total ? `${ar(i.shura_answered)} من ${ar(i.shura_total)}` : "—"}
              note={i.shura_median_days != null ? `الجواب في ${ar(i.shura_median_days)} يوماً (الوسيط)` : "لم يُجب عن سؤالٍ بعد"}
            />
            <Stat
              label="نبض الثقة هذا الربع"
              value={i.pulse_trust_people != null ? `${ar(i.pulse_trust_people)} / ٥` : `${ar(i.pulse_count)} أجابوا`}
              note={
                i.pulse_trust_people != null
                  ? `الثقة بالقادة ${ar(i.pulse_trust_leaders!)} · الصوت مسموع ${ar(i.pulse_voice_heard!)}`
                  : `يُعلن المتوسّط بعد ${ar(i.pulse_floor)} إجابات`
              }
              href="/nafir/pulse"
            />
          </dl>
        ) : (
          <p className="text-sm text-muted">تعذّر حساب المؤشّرات الآن.</p>
        )}
      </section>
    </NafirShell>
  );
}

function Stat({ label, value, note, href }: { label: string; value: string; note: string; href?: string }) {
  const body = (
    <>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="figure mt-1 text-2xl font-black text-primary">{value}</dd>
      <dd className="figure mt-1 text-xs leading-relaxed text-muted">{note}</dd>
    </>
  );
  return href ? (
    <Link href={href} className="block bg-card p-4 transition hover:bg-primary/5">
      {body}
    </Link>
  ) : (
    <div className="bg-card p-4">{body}</div>
  );
}
