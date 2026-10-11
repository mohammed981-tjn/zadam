import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NafirShell, { button, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import FilmPlayer from "@/components/FilmPlayer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  FAZA_CAUSES,
  FAZA_CAUSES_EN,
  NAFIR_KINDS,
  NAFIR_KINDS_EN,
  ar,
  ageAr,
  dateAr,
  label,
  stateName,
  typed,
  type FazaRequest,
  type NafirCall,
  type NafirIndicators,
} from "@/lib/nafir";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "النفير — العمل المشترك | سوداقري", "Nafir — working together | Sudagri"),
    description: tr(
      locale,
      "النفير والفزعة والشورى: قيم الريف السوداني أدواتٍ تعمل — دعوةٌ إلى عملٍ جماعي، ونجدةٌ لمن أصابته جائحة، وقادةٌ يُسألون علناً.",
      "Nafir, faza and shura: the values of rural Sudan as tools that work — a call to communal work, help for whoever disaster strikes, and leaders who answer in public.",
    ),
  };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
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
        <h1 className="text-2xl font-black sm:text-3xl">{t("النفير — العمل المشترك", "Nafir — working together")}</h1>
        <p className="mt-3 max-w-2xl leading-8 text-muted">
          {t(
            "«المؤمن للمؤمن كالبنيان يشدّ بعضه بعضاً». هنا يدعو المزارع جيرانه إلى حصادٍ أو تطهير قناة، ويطلب مَن أصابته جائحةٌ فزعةً غير مالية، ويُسأل القادة علناً فيُجيبون. قيمٌ يعرفها الريف السوداني — صارت أداةً أوسع.",
            "“The believer to the believer is like a building, each part strengthening the other.” Here a farmer calls the neighbours to a harvest or to clear a canal (a nafir), whoever is struck by disaster asks for non-cash help (a faza), and leaders are questioned in public and answer. Values rural Sudan already knows — now with a wider reach.",
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/nafir/new" className={button}>
            {t("ادعُ إلى نفير", "Call a nafir")}
          </Link>
          <Link href="/nafir/faza/new" className={ghost}>
            {t("اطلب فزعة", "Ask for faza")}
          </Link>
          <Link href="/nafir/charter" className={ghost}>
            {t("اقرأ الميثاق ووقّع", "Read and sign the charter")}
          </Link>
        </div>
        <ShareWhatsApp
          path="/nafir"
          text={t("النفير على سوداقري — ادعُ جيرانك إلى العمل، أو لبِّ نداءهم:", "Nafir on Sudagri — call your neighbours to work, or answer their call:")}
          className="mt-4"
          locale={locale}
        />
      </header>

      {/* The owner's nafir clips (4 October), each whole and in the order of their prompts: the call, the harvest, clearing the canal, the meal, the judiyya, the shura, the leader in the canal, the palm offshoot, the promise kept, care in the work, the call on a phone. */}
      <figure className="mb-10">
        <FilmPlayer base="/video/nafir-wide" poster="/video/nafir-wide.jpg" label={t("فيلم سوداقري: النفير… قيمٌ تعمل", "A Sudagri film: Nafir… values at work")} />
      </figure>

      {/* ───────── دعواتٌ مفتوحة ───────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">{t("دعواتٌ مفتوحة", "Open calls")}</h2>
        {open.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            {t(
              "لا دعوة مفتوحة الآن. كن أوّل مَن يدعو: حصادٌ، أو زراعة، أو تطهير ترعة — النفير يبدأ بواحد.",
              "No open calls right now. Be the first to call one: a harvest, planting, or clearing a canal — every nafir starts with one person.",
            )}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((c) => {
              const joinedCount = joined.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/nafir/${c.id}`}
                    className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-card transition hover:border-primary"
                  >
                    <span className="text-xs font-medium text-primary">
                      {label(NAFIR_KINDS, NAFIR_KINDS_EN, c.kind, locale)} · {stateName(c.state, locale)} — <bdi>{c.locality}</bdi>
                    </span>
                    <span className="font-bold leading-7" {...typed(locale)}>{c.title}</span>
                    <span className="text-xs text-muted">{dateAr(c.starts_on, locale)}</span>
                    <span className="mt-auto flex items-center gap-2 text-xs">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (joinedCount / c.needed) * 100)}%` }}
                        />
                      </span>
                      <span className="figure shrink-0">
                        {locale === "en"
                          ? `${n(joinedCount)} of ${n(c.needed)} answered`
                          : `${n(joinedCount)} من ${n(c.needed)} لبّوا`}
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
            <h2 className="text-xl font-bold">{t("يطلبون الفزعة", "Asking for faza")}</h2>
            <Link href="/nafir/faza" className="text-sm text-primary underline">
              {t("كلّ الطلبات", "All requests")}
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {needs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/nafir/faza/${r.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 transition hover:border-accent"
                >
                  <span className="font-medium" {...typed(locale)}>{r.title}</span>
                  <span className="text-xs text-muted">
                    {label(FAZA_CAUSES, FAZA_CAUSES_EN, r.cause, locale)} · {stateName(r.state, locale)} · {ageAr(r.created_at, undefined, locale)}
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
          <h2 className="mb-3 text-xl font-bold">{t("ما أُنجز", "What got done")}</h2>
          <ul className="flex flex-col gap-3">
            {finished.map((c) => (
              <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted">
                  {label(NAFIR_KINDS, NAFIR_KINDS_EN, c.kind, locale)} · {stateName(c.state, locale)} — <bdi>{c.locality}</bdi> ·{" "}
                  {t("دعا إليه", "called by")} <bdi>{c.display_name}</bdi>
                </p>
                <p className="mt-1 font-bold" {...typed(locale)}>{c.outcome}</p>
                <p className="figure mt-1 text-xs text-muted">
                  {locale === "en" ? `${n(c.attended ?? 0)} attended` : `حضره ${n(c.attended ?? 0)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── المؤشّرات ───────── */}
      <section id="indicators" className="scroll-mt-20">
        <h2 className="text-xl font-bold">{t("هل تعمل القيم؟", "Are the values working?")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {t(
            "ثلاثة مقاييس وعد بها الميثاق — الثقة والمشاركة والأثر — تُحسب من الأفعال لا من الأقوال، وتُعلن للجميع.",
            "Three measures the charter promised — trust, participation and impact — counted from deeds, not words, and published for everyone.",
          )}
        </p>
        {i ? (
          <dl
            className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}
          >
            <Stat
              label={t("وقّعوا الميثاق", "Signed the charter")}
              value={n(i.signers_leaders + i.signers_members)}
              note={locale === "en" ? `${n(i.signers_leaders)} of them leaders` : `منهم ${n(i.signers_leaders)} من القادة`}
            />
            <Stat
              label={t("نفيرٌ أُنجز", "Nafirs completed")}
              value={n(i.nafir_done)}
              note={
                locale === "en"
                  ? `${n(i.nafir_attended)} attended · ${n(i.nafir_open)} open`
                  : `حضره ${n(i.nafir_attended)} · ${n(i.nafir_open)} مفتوح`
              }
            />
            <Stat
              label={t("عهود الفزعة الموفاة", "Faza pledges kept")}
              value={
                i.pledges_total
                  ? `${n(Math.round((i.pledges_kept / i.pledges_total) * 100))}${locale === "en" ? "%" : "٪"}`
                  : "—"
              }
              note={
                locale === "en"
                  ? `${n(i.pledges_kept)} of ${n(i.pledges_total)} · ${n(i.faza_met)} needs met`
                  : `${n(i.pledges_kept)} من ${n(i.pledges_total)} · ${n(i.faza_met)} حاجةً قُضيت`
              }
            />
            <Stat
              label={t("أسئلة الشورى المُجابة", "Shura questions answered")}
              value={
                i.shura_total
                  ? locale === "en"
                    ? `${n(i.shura_answered)} of ${n(i.shura_total)}`
                    : `${n(i.shura_answered)} من ${n(i.shura_total)}`
                  : "—"
              }
              note={
                i.shura_median_days != null
                  ? locale === "en"
                    ? `Answered in ${n(i.shura_median_days)} days (median)`
                    : `الجواب في ${n(i.shura_median_days)} يوماً (الوسيط)`
                  : t("لم يُجب عن سؤالٍ بعد", "No question answered yet")
              }
            />
            <Stat
              label={t("نبض الثقة هذا الربع", "Trust pulse this quarter")}
              value={
                i.pulse_trust_people != null
                  ? `${n(i.pulse_trust_people)} / ${locale === "en" ? "5" : "٥"}`
                  : locale === "en"
                    ? `${n(i.pulse_count)} answered`
                    : `${n(i.pulse_count)} أجابوا`
              }
              note={
                i.pulse_trust_people != null
                  ? locale === "en"
                    ? `Trust in leaders ${n(i.pulse_trust_leaders!)} · Voice heard ${n(i.pulse_voice_heard!)}`
                    : `الثقة بالقادة ${n(i.pulse_trust_leaders!)} · الصوت مسموع ${n(i.pulse_voice_heard!)}`
                  : locale === "en"
                    ? `The average is published after ${n(i.pulse_floor)} answers`
                    : `يُعلن المتوسّط بعد ${n(i.pulse_floor)} إجابات`
              }
              href="/nafir/pulse"
            />
          </dl>
        ) : (
          <p className="text-sm text-muted">{t("تعذّر حساب المؤشّرات الآن.", "The indicators could not be calculated right now.")}</p>
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
