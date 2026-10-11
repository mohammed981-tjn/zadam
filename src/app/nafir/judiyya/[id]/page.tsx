import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import {
  JUDIYYA_KINDS,
  JUDIYYA_KINDS_EN,
  JUDIYYA_STATUS,
  JUDIYYA_STATUS_EN,
  ageAr,
  label,
  stateName,
  typed,
  type JudiyyaCase,
  type JudiyyaMediator,
  type JudiyyaPanelSeat,
  type JudiyyaParty,
} from "@/lib/nafir";
import { accept, approve, commit, confirm, withdraw, writeSettlement } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "طلب جودية | سوداقري", "Judiyya case | Sudagri"), robots: { index: false } };
}

/**
 * One case, as whoever is looking can act on it. Row-level security decides
 * who may look at all (the parties, the case's mediators, the administration)
 * — anyone else gets «not found», which is also what a case that does not
 * exist looks like, so a guessed address learns nothing.
 */
export default async function JudiyyaCasePage({
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
  const en = locale === "en";
  const { supabase, user, name } = await nafirViewer();
  if (!user) notFound();

  const [{ data: caseRow }, { data: partyRows }, { data: seatRows }, { data: medRows }] = await Promise.all([
    supabase.from("judiyya_cases").select("*").eq("id", id).maybeSingle(),
    supabase.from("judiyya_parties").select("*").eq("case_id", id),
    supabase.from("judiyya_panel").select("*").eq("case_id", id),
    supabase.from("judiyya_mediators").select("*").not("verified_at", "is", null),
  ]);
  const k = caseRow as JudiyyaCase | null;
  if (!k) notFound();
  const parties = (partyRows ?? []) as JudiyyaParty[];
  const seats = (seatRows ?? []) as JudiyyaPanelSeat[];
  const mediators = (medRows ?? []) as JudiyyaMediator[];
  const a = parties.find((p) => p.side === "a");
  const b = parties.find((p) => p.side === "b");
  const me = parties.find((p) => p.user_id === user.id);
  const mySeat = seats.find((s) => s.mediator_id === user.id);
  const seated = seats.filter((s) => s.approved_a && s.approved_b && s.accepted_at);
  const medName = (uid: string) => mediators.find((m) => m.user_id === uid)?.display_name ?? t("أجويد", "Mediator");
  const live = k.status === "forming" || k.status === "active";


  return (
    <NafirShell active="/nafir/judiyya" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">
        {t("جودية", "Judiyya")} · {label(JUDIYYA_KINDS, JUDIYYA_KINDS_EN, k.kind, locale)} · {stateName(k.state, locale)} — <bdi>{k.locality}</bdi> ·{" "}
        {label(JUDIYYA_STATUS, JUDIYYA_STATUS_EN, k.status, locale)}
      </p>
      <h1 className="mt-1 text-2xl font-bold" {...typed(locale)}>{k.title}</h1>
      <p className="mt-1 text-xs text-muted">
        {en
          ? `Opened ${ageAr(k.created_at, undefined, locale)} · Only the two parties, their mediators and the administration can see this page`
          : `فُتح ${ageAr(k.created_at)} · لا يرى هذه الصفحة إلا طرفاها وأجاويدها والإدارة`}
      </p>
      <p className="mt-4 whitespace-pre-line leading-8" {...typed(locale)}>{k.summary}</p>

      <ol className="mt-6 flex flex-col gap-3">
        <Step n={1} done={!!b} title={t("دخول الطرفين", "Both parties join")} locale={locale}>
          <p>
            <bdi>{a?.display_name ?? "—"}</bdi>{" "}
            {b ? (
              en ? <>and <bdi>{b.display_name}</bdi></> : `و${b.display_name}`
            ) : (
              t("— وينتظر الطرفَ الآخر", "— waiting for the other party")
            )}
          </p>
          {!b && me?.side === "a" && k.status === "forming" && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-muted">
                {t("أرسل هذا الرابط للطرف الآخر وحده — يعمل مرّةً واحدة:", "Send this link to the other party only — it works once:")}
              </p>
              <ShareWhatsApp
                path={`/nafir/judiyya/join/${k.invite_token}`}
                text={
                  en
                    ? `I invite you to judiyya (mediation) over “${k.title}” — mediators we both accept, and a settlement between us:`
                    : `أدعوك إلى الجودية في «${k.title}» — أجاويد يرضاهم الطرفان، والصلح بيننا:`
                }
                locale={locale}
              />
            </div>
          )}
        </Step>

        <Step
          n={2}
          done={!!(a?.committed_at && b?.committed_at)}
          title={t("الالتزام بقبول الحكم قبل سماعه", "Committing to accept the ruling before hearing it")}
          locale={locale}
        >
          <p>
            <bdi>{a?.display_name}</bdi>: {a?.committed_at ? t("التزم", "committed") : t("لم يلتزم بعد", "not yet committed")}
            {b && (
              <>
                {" "}
                · <bdi>{b.display_name}</bdi>: {b.committed_at ? t("التزم", "committed") : t("لم يلتزم بعد", "not yet committed")}
              </>
            )}
          </p>
          {me && !me.committed_at && k.status === "forming" && b && (
            <form action={commit} className="mt-2">
              <input type="hidden" name="case_id" value={k.id} />
              <button className={button}>
                {t("ألتزم بقبول حكم الأجاويد قبل أن أسمعه", "I commit to accept the mediators’ ruling before I hear it")}
              </button>
            </form>
          )}
        </Step>

        <Step n={3} done={seated.length > 0} title={t("اختيار الأجاويد", "Choosing the mediators")} locale={locale}>
          {k.status === "forming" ? (
            <p className="text-muted">{t("بعد التزام الطرفين.", "Once both parties have committed.")}</p>
          ) : (
            <>
              {seated.length > 0 && (
                <p>
                  {t("اللجنة:", "The panel:")} {seated.map((s) => medName(s.mediator_id)).join(en ? ", " : "، ")}
                </p>
              )}
              {me && k.status === "active" && (
                <ul className="mt-2 flex flex-col gap-2">
                  {mediators
                    .filter((m) => !parties.some((p) => p.user_id === m.user_id))
                    .map((m) => {
                      const s = seats.find((x) => x.mediator_id === m.user_id);
                      const mine = me.side === "a" ? s?.approved_a : s?.approved_b;
                      const theirs = me.side === "a" ? s?.approved_b : s?.approved_a;
                      return (
                        <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                          <span>
                            <strong><bdi>{m.display_name}</bdi></strong> <span className="text-xs text-muted">· {stateName(m.state, locale)}</span>
                            <span className="block text-xs text-muted">
                              {theirs ? t("رضيه الطرف الآخر", "Approved by the other party") : ""}
                              {s?.accepted_at
                                ? t(" · قَبِل", " · Accepted")
                                : s?.approved_a && s?.approved_b
                                  ? t(" · ينتظر قبوله", " · Waiting for them to accept")
                                  : ""}
                            </span>
                          </span>
                          <form action={approve}>
                            <input type="hidden" name="case_id" value={k.id} />
                            <input type="hidden" name="mediator_id" value={m.user_id} />
                            <input type="hidden" name="on" value={mine ? "0" : "1"} />
                            <button className={mine ? ghost : button}>
                              {mine ? t("أسحب رضاي", "Withdraw my approval") : t("أرضاه", "I approve")}
                            </button>
                          </form>
                        </li>
                      );
                    })}
                </ul>
              )}
              {mySeat && mySeat.approved_a && mySeat.approved_b && !mySeat.accepted_at && (
                <form action={accept} className="mt-2">
                  <input type="hidden" name="case_id" value={k.id} />
                  <p className="mb-2">
                    {t("اختارك الطرفان أجويداً. هل تقبل الوساطة؟", "Both parties have chosen you as a mediator. Do you accept the mediation?")}
                  </p>
                  <button className={button}>
                    {t("أقبل، وأشهد أني لستُ طرفاً", "I accept, and I affirm that I am not a party to the dispute")}
                  </button>
                </form>
              )}
            </>
          )}
        </Step>

        <Step n={4} done={!!k.settlement} title={t("كتابة الصلح", "Writing the settlement")} locale={locale}>
          {k.settlement ? (
            <div className="rounded-xl border border-primary/40 bg-background p-3">
              <p className="whitespace-pre-line" {...typed(locale)}>{k.settlement}</p>
              <p className="mt-1 text-xs text-muted">
                {t("كتبه", "Written by")} <bdi>{k.settlement_name}</bdi> · {k.settlement_at && ageAr(k.settlement_at, undefined, locale)}
              </p>
            </div>
          ) : (
            <p className="text-muted">{t("يكتبه أحد الأجاويد بعد سماع الطرفين.", "One of the mediators writes it after hearing both sides.")}</p>
          )}
          {mySeat?.accepted_at && k.status === "active" && (
            <form action={writeSettlement} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="case_id" value={k.id} />
              <textarea
                name="settlement"
                required
                minLength={20}
                maxLength={3000}
                rows={4}
                defaultValue={k.settlement ?? ""}
                className={field}
                placeholder={t("نصّ الصلح كما اتُّفق عليه", "The text of the settlement as agreed")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  name="settlement_name"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={name}
                  aria-label={t("اسمك", "Your name")}
                  className={`${field} w-48`}
                />
                <button className={button}>
                  {k.settlement ? t("عدّل الصلح", "Edit the settlement") : t("اكتب الصلح", "Write the settlement")}
                </button>
              </div>
              {k.settlement && (
                <p className="text-xs text-muted">
                  {t("التعديل يُسقط إقرار الطرفين ويُعيد طلبه.", "Editing cancels both parties’ confirmations and asks for them again.")}
                </p>
              )}
            </form>
          )}
        </Step>

        <Step n={5} done={k.status === "settled"} title={t("إقرار الطرفين وختم الصلح", "Both parties confirm, and the settlement is sealed")} locale={locale}>
          <p>
            <bdi>{a?.display_name}</bdi>: {a?.confirmed_at ? t("أقرّ", "confirmed") : t("لم يُقرّ", "not confirmed")}
            {b && (
              <>
                {" "}
                · <bdi>{b.display_name}</bdi>: {b.confirmed_at ? t("أقرّ", "confirmed") : t("لم يُقرّ", "not confirmed")}
              </>
            )}
          </p>
          {me && !me.confirmed_at && k.settlement && k.status === "active" && (
            <form action={confirm} className="mt-2">
              <input type="hidden" name="case_id" value={k.id} />
              <button className={button}>{t("أُقرّ هذا الصلح", "I confirm this settlement")}</button>
            </form>
          )}
          {k.status === "settled" && (
            <p className="mt-1 font-bold text-primary">
              {en ? (
                <>
                  Settlement sealed {k.settled_at && ageAr(k.settled_at, undefined, locale)}. “…and settlement is best” (an-Nisa 4:128){" "}
                  <span lang="ar" dir="rtl">«والصلح خير»</span>.
                </>
              ) : (
                <>خُتم الصلح {k.settled_at && ageAr(k.settled_at)}. «والصلح خير».</>
              )}
            </p>
          )}
        </Step>
      </ol>

      {me && live && (
        <form action={withdraw} className="mt-6">
          <input type="hidden" name="case_id" value={k.id} />
          <button className="text-sm text-danger underline">{t("اسحب الطلب", "Withdraw the case")}</button>
        </form>
      )}
    </NafirShell>
  );
}

function Step({
  n,
  done,
  title,
  locale,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  locale: Locale;
  children?: React.ReactNode;
}) {
  return (
    <li className={`rounded-2xl border p-4 ${done ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <p className="font-bold">
        <span className="figure me-2 text-primary">{done ? "✓" : n.toLocaleString(locale === "en" ? "en-GB" : "ar")}</span>
        {title}
      </p>
      {children && <div className="mt-2 text-sm leading-7">{children}</div>}
    </li>
  );
}
