import Link from "next/link";
import NafirShell, { button } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { PULSE_QUESTIONS, PULSE_SCALE, ar, currentPeriod, type NafirIndicators } from "@/lib/nafir";
import { submitPulse } from "../actions";

export const metadata = {
  title: "نبض الثقة | سوداغري",
  description: "أربعة أسئلةٍ في كلّ ربع سنة عن الثقة والتعاون — لا يقرأ إجابتك أحد، وتُعلن مجمّعةً فقط.",
};

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

  return (
    <NafirShell active="/nafir/pulse" ok={ok} error={error}>
      <h1 className="text-2xl font-black">نبض الثقة</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        الثقة هي «الغراء» الذي يمسك العمل المشترك. نقيسها بأربعة أسئلة في كلّ
        ربع سنة، مأخوذةٍ من استبيان البنك الدولي لرأس المال الاجتماعي. إجابتك
        لا يقرؤها أحد — ولا الإدارة — وتدخل في المتوسّط وحده، ولا يُعلن
        المتوسّط قبل أن يجيب {ar(i?.pulse_floor ?? 10)}.
      </p>

      {/* ───────── النتائج ───────── */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">
          الربع <span dir="ltr">{period}</span> · أجاب {ar(i?.pulse_count ?? 0)}
        </h2>
        {averages && averages[0] != null ? (
          <ul className="mt-3 flex flex-col gap-3">
            {PULSE_QUESTIONS.map((q, k) => (
              <li key={q.key}>
                <p className="text-sm">{q.text}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${((averages[k]! - 1) / 4) * 100}%` }} />
                  </span>
                  <span className="figure w-14 text-sm font-bold">{ar(averages[k]!)} / ٥</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            يُعلن المتوسّط بعد {ar(Math.max(0, (i?.pulse_floor ?? 10) - (i?.pulse_count ?? 0)))} إجاباتٍ أخرى.
          </p>
        )}
      </section>

      {/* ───────── الاستبيان ───────── */}
      <section className="mt-6">
        {!user ? (
          <p className="text-sm">
            <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتُجيب.
          </p>
        ) : mine ? (
          <p className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">أجبتَ في هذا الربع. نلقاك في الربع القادم.</p>
        ) : (
          <form action={submitPulse} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
            {PULSE_QUESTIONS.map((q) => (
              <fieldset key={q.key}>
                <legend className="mb-2 text-sm font-medium leading-7">{q.text}</legend>
                <div className="grid grid-cols-5 gap-1 text-center text-xs">
                  {PULSE_SCALE.map((label, k) => (
                    <label key={k} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                      <input type="radio" name={q.key} value={k + 1} required className="accent-[var(--primary)]" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className={`${button} self-start`}>أرسل إجابتي</button>
          </form>
        )}
      </section>
    </NafirShell>
  );
}
