import Link from "next/link";
import NafirShell, { button } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { PULSE_QUESTIONS, PULSE_SCALE, PULSE_SCALE_EN, ar, currentPeriod, type NafirIndicators } from "@/lib/nafir";
import { submitPulse } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "نبض الثقة | سوداقري", "Trust pulse | Sudagri"),
    description: tr(
      locale,
      "أربعة أسئلةٍ في كلّ ربع سنة عن الثقة والتعاون — لا يقرأ إجابتك أحد، وتُعلن مجمّعةً فقط.",
      "Four questions each quarter about trust and cooperation — no one reads your answer, and results are published only in aggregate.",
    ),
  };
}

/**
 * Four statements a quarter. The answers are private to the one who gave
 * them — the table's policy lets nobody else read a row, administrators
 * included — and the averages appear only once enough people answered that
 * no answer can be picked out.
 */
export default async function PulsePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const en = locale === "en";
  const { supabase, user } = await nafirViewer();
  const period = currentPeriod();
  const [{ data: ind }, { data: mine }] = await Promise.all([
    supabase.rpc("nafir_indicators").single(),
    user
      ? supabase.from("trust_pulse").select("period").eq("period", period).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const i = ind as NafirIndicators | null;
  const averages = i && [i.pulse_trust_people, i.pulse_trust_leaders, i.pulse_help_expected, i.pulse_voice_heard];
  const floor = n(i?.pulse_floor ?? 10);
  const scale = en ? PULSE_SCALE_EN : PULSE_SCALE;

  return (
    <NafirShell active="/nafir/pulse" ok={ok} error={error}>
      <h1 className="text-2xl font-black">{t("نبض الثقة", "Trust pulse")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {en
          ? `Trust is the “glue” that holds shared work together. We measure it with four questions each quarter, taken from the World Bank’s questionnaire on social capital. No one reads your answer — not even the administration — it only goes into the average, and the average is not published until ${floor} people have answered.`
          : `الثقة هي «الغراء» الذي يمسك العمل المشترك. نقيسها بأربعة أسئلة في كلّ ربع سنة، مأخوذةٍ من استبيان البنك الدولي لرأس المال الاجتماعي. إجابتك لا يقرؤها أحد — ولا الإدارة — وتدخل في المتوسّط وحده، ولا يُعلن المتوسّط قبل أن يجيب ${floor}.`}
      </p>

      {/* ───────── النتائج ───────── */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">
          {t("الربع", "Quarter")} <span dir="ltr">{period}</span> ·{" "}
          {en ? `${n(i?.pulse_count ?? 0)} answered` : `أجاب ${n(i?.pulse_count ?? 0)}`}
        </h2>
        {averages && averages[0] != null ? (
          <ul className="mt-3 flex flex-col gap-3">
            {PULSE_QUESTIONS.map((q, k) => (
              <li key={q.key}>
                <p className="text-sm">{t(q.text, q.en)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${((averages[k]! - 1) / 4) * 100}%` }} />
                  </span>
                  <span className="figure w-14 text-sm font-bold">{n(averages[k]!)} / {en ? "5" : "٥"}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {en
              ? `The average is published after ${n(Math.max(0, (i?.pulse_floor ?? 10) - (i?.pulse_count ?? 0)))} more answers.`
              : `يُعلن المتوسّط بعد ${n(Math.max(0, (i?.pulse_floor ?? 10) - (i?.pulse_count ?? 0)))} إجاباتٍ أخرى.`}
          </p>
        )}
      </section>

      {/* ───────── الاستبيان ───────── */}
      <section className="mt-6">
        {!user ? (
          <p className="text-sm">
            <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
            {t("لتُجيب.", "to answer.")}
          </p>
        ) : mine ? (
          <p className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
            {t("أجبتَ في هذا الربع. نلقاك في الربع القادم.", "You have answered this quarter. See you next quarter.")}
          </p>
        ) : (
          <form action={submitPulse} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
            {PULSE_QUESTIONS.map((q) => (
              <fieldset key={q.key}>
                <legend className="mb-2 text-sm font-medium leading-7">{t(q.text, q.en)}</legend>
                <div className="grid grid-cols-5 gap-1 text-center text-xs">
                  {scale.map((option, k) => (
                    <label key={k} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                      <input type="radio" name={q.key} value={k + 1} required className="accent-[var(--primary)]" />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className={`${button} self-start`}>{t("أرسل إجابتي", "Send my answers")}</button>
          </form>
        )}
      </section>
    </NafirShell>
  );
}
