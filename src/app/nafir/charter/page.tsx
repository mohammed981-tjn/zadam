import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import {
  CHARTER_REFERENCE,
  CHARTER_VERSION,
  LEADER_VALUES,
  MEMBER_VALUES,
  SUDAN_STATES,
  ar,
  stateName,
  typed,
  type CharterValue,
} from "@/lib/nafir";
import { signCharter, verifyLeader, withdrawSignature } from "../actions";
import FilmPlayer from "@/components/FilmPlayer";
import { columnsFor } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "ميثاق النفير | سوداقري", "The Nafir Charter | Sudagri"),
    description: tr(
      locale,
      "مرجعيّةٌ وقيمٌ للقادة وللقاعدة، لكلّ قيمةٍ آليّةٌ تُمارَس بها في المنصّة — ويُوقَّع علناً.",
      "Foundations, and values for leaders and members — each value with a mechanism that practises it on the platform — signed in public.",
    ),
  };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const { supabase, user, name, isAdmin } = await nafirViewer();
  const { data } = await supabase
    .from("charter_signatures")
    .select(columnsFor("charter_signatures", Boolean(user)))
    .eq("charter_version", CHARTER_VERSION)
    .order("signed_at", { ascending: true });
  const sigs = (data ?? []) as unknown as Signature[];
  const leaders = sigs.filter((s) => s.role === "leader");
  const members = sigs.filter((s) => s.role === "member");
  const mine = user ? sigs.find((s) => s.user_id === user.id) : undefined;
  const pledges = members.filter((m) => m.pledge).slice(-8).reverse();

  return (
    <NafirShell active="/nafir/charter" ok={ok} error={error}>
      <h1 className="text-2xl font-black sm:text-3xl">{t("ميثاق النفير", "The Nafir Charter")}</h1>
      <p className="mt-2 text-sm text-muted">
        {locale === "en"
          ? `Version ${n(CHARTER_VERSION)} · signed by ${n(sigs.length)}`
          : `النسخة ${n(CHARTER_VERSION)} · وقّعه ${n(sigs.length)}`}
      </p>

      <figure className="my-6">
        <FilmPlayer
          base="/video/charter-wide"
          poster="/video/charter-wide.jpg"
          label={t("فيلم سوداقري: الفسيلة والوفاء والإتقان", "A Sudagri film: the palm seedling, keeping faith, and work done well")}
        />
      </figure>

      {/* ───────── المرجعيّة ───────── */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">{t("المرجعيّة: من أين تأتي الإرادة", "Our foundations: where the will comes from")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHARTER_REFERENCE.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-bold text-primary">{t(r.title, r.en.title)}</h3>
              {locale === "en" && r.en.quote && (
                <p lang="ar" dir="rtl" className="mt-2 text-sm leading-7">«{r.en.quote}»</p>
              )}
              <p className="mt-2 text-sm leading-7">{t(r.text, r.en.text)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-7">
          <strong>{t("النفير طوعٌ لا يُفرض.", "Nafir is voluntary, never imposed.")}</strong>{" "}
          {t(
            "لا تُعلَّق عليه شارةُ جهةٍ ولا حزب، ولا يُرتَّب فيه الناس ولا يُعيَّر مَن لم يحضر. هكذا عاش النفير في الريف، وهكذا يبقى هنا.",
            "No organisation’s or party’s badge is pinned to it, people are not ranked, and no one is shamed for not coming. That is how nafir has lived in the countryside, and that is how it stays here.",
          )}
        </p>
      </section>

      <Values
        title={t("قيم القادة", "Values for leaders")}
        hint={t("ما يلتزم به مَن يقود — ويُسأل عنه علناً", "What those who lead commit to — and are questioned on in public")}
        values={LEADER_VALUES}
        locale={locale}
      />
      <Values
        title={t("قيم القاعدة", "Values for members")}
        hint={t("ما يلتزم به كلّ عضو — ويُمارَس في المنصّة", "What every member commits to — and practises on the platform")}
        values={MEMBER_VALUES}
        locale={locale}
      />

      {/* ───────── التوقيع ───────── */}
      <section id="sign" className="mt-10 scroll-mt-20 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">{t("التوقيع", "Sign")}</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
            {t("لتوقّع الميثاق.", "to sign the charter.")}
          </p>
        ) : mine ? (
          <form action={withdrawSignature} className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {locale === "en" ? (
                <>
                  You signed as “<bdi>{mine.display_name}</bdi>”
                  {mine.role === "leader" ? (mine.verified_at ? ", as a verified leader." : ", as a leader — awaiting verification.") : "."}
                </>
              ) : (
                <>
                  وقّعتَ باسم «{mine.display_name}»
                  {mine.role === "leader" ? (mine.verified_at ? " قائداً متحقَّقاً منه." : " قائداً — ينتظر التحقّق.") : "."}
                </>
              )}
            </p>
            <button className={ghost}>{t("اسحب توقيعي", "Withdraw my signature")}</button>
          </form>
        ) : (
          <form action={signCharter} className="mt-3 flex flex-col gap-3">
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="role" value="member" defaultChecked /> {t("أوقّع عضواً", "I sign as a member")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="role" value="leader" />{" "}
                {t("أوقّع قائداً (رئيس تعاونية، شيخ، مدير مشروع…)", "I sign as a leader (cooperative head, sheikh, scheme manager…)")}
              </label>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                {t("الاسم تحت التوقيع", "Name under your signature")}
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("الولاية", "State")} <span className="text-xs text-muted">{t("(اختياري)", "(optional)")}</span>
                <select name="state" className={field} defaultValue="">
                  <option value="">—</option>
                  {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("عهدك بكلماتك", "Your pledge in your own words")}{" "}
              <span className="text-xs text-muted">{t("(اختياري — «ألتزم أن…»)", "(optional — “I commit to…”)")}</span>
              <input name="pledge" maxLength={200} className={field} placeholder={t("ألتزم أن ألبّي نفير جيراني في الحصاد", "I commit to answering my neighbours’ harvest nafir")} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agree" required className="mt-1" />
              {t(
                "قرأتُ الميثاق، وأختاره طوعاً، وأعرف أنّ اسمي سيظهر تحته.",
                "I have read the charter, I choose it freely, and I know my name will appear under it.",
              )}
            </label>
            <button className={`${button} self-start`}>{t("أوقّع", "Sign")}</button>
          </form>
        )}
      </section>

      {/* ───────── الموقّعون ───────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          {t("القادة الموقّعون", "Leaders who signed")} ({n(leaders.length)})
        </h2>
        {leaders.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يوقّع قائدٌ بعد. القدوة تبدأ بأوّلهم.", "No leader has signed yet. Leading by example starts with the first.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leaders.map((l, i) => (
              <li key={l.user_id ?? i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <bdi className="font-bold">{l.display_name}</bdi>
                  {l.state && <span className="text-sm text-muted"> · {stateName(l.state, locale)}</span>}
                  <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${l.verified_at ? "bg-primary/15 text-primary" : "bg-border text-muted"}`}>
                    {l.verified_at ? t("متحقَّقٌ منه", "Verified") : t("لم يُتحقَّق بعد", "Not yet verified")}
                  </span>
                  {l.pledge && <p className="mt-1 text-sm text-muted" {...typed(locale)}>«{l.pledge}»</p>}
                </div>
                {isAdmin && !l.verified_at && (
                  <form action={verifyLeader}>
                    <input type="hidden" name="user_id" value={l.user_id} />
                    <button className={ghost}>{t("تحقّقتُ منه", "Mark as verified")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <h2 className="mb-3 mt-6 text-lg font-bold">
          {t("الأعضاء الموقّعون", "Members who signed")} ({n(members.length)})
        </h2>
        {pledges.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pledges.map((m, i) => (
              <li key={m.user_id ?? i} className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
                <bdi {...typed(locale)}>«{m.pledge}»</bdi>{" "}
                <span className="text-muted">
                  — <bdi>{m.display_name}</bdi>
                  {m.state ? `${locale === "en" ? "," : "،"} ${stateName(m.state, locale)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShareWhatsApp
        path="/nafir/charter"
        text={t("ميثاق النفير على سوداقري — قيمٌ تعمل لا تُعلَّق. اقرأه ووقّع:", "The Nafir Charter on Sudagri — values that work, not slogans on a wall. Read it and sign:")}
        className="mt-6"
        locale={locale}
      />
    </NafirShell>
  );
}

function Values({ title, hint, values, locale }: { title: string; hint: string; values: CharterValue[]; locale: Locale }) {
  const en = locale === "en";
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {values.map((v) => (
          <li key={v.key} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-bold">{en ? v.en.title : v.title}</h3>
              {en ? (
                <span lang="ar" dir="rtl" className="text-xs text-muted">{v.root}</span>
              ) : (
                <span className="text-xs text-muted">{v.root}</span>
              )}
            </div>
            {en && <p className="text-xs italic leading-6 text-muted">{v.en.root}</p>}
            <p className="text-sm leading-7">{en ? v.en.commitment : v.commitment}</p>
            <p className="mt-auto rounded-lg bg-primary/5 px-3 py-2 text-xs leading-6">
              <span className="font-medium text-primary">{en ? "How it is practised: " : "كيف تُمارَس: "}</span>
              {v.href ? (
                <Link href={v.href} className="underline">{en ? v.en.practice : v.practice}</Link>
              ) : (
                en ? v.en.practice : v.practice
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
