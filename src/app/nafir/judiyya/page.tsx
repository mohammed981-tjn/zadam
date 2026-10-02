import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import {
  JUDIYYA_KINDS,
  JUDIYYA_STATUS,
  SUDAN_STATES,
  ageAr,
  ar,
  type JudiyyaCase,
  type JudiyyaMediator,
} from "@/lib/nafir";
import { openCase, verifyMediator, volunteer } from "./actions";

export const metadata = {
  title: "الجودية | سوداغري",
  description:
    "وساطة الأجاويد في نزاعات الماء والحدود والمرعى: يلتزم الطرفان بالحكم قبل سماعه، ويختاران أجاويد محايدين، ويُختم الصلح بإقرارهما — ويبقى بين أهله.",
};

/**
 * What judiyya is, and what it is not, before anything can be opened; the
 * register of mediators; and the person's own cases. Cases are never listed
 * publicly — the page shows only counts, because a settlement is kept, not
 * published.
 */
export default async function JudiyyaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { supabase, user, name, isAdmin } = await nafirViewer();

  const [{ data: meds }, { data: counts }, { data: mine }] = await Promise.all([
    supabase.from("judiyya_mediators").select("*").order("verified_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("judiyya_counts").single(),
    user
      ? supabase.from("judiyya_cases").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const mediators = (meds ?? []) as JudiyyaMediator[];
  const verified = mediators.filter((m) => m.verified_at);
  const pending = mediators.filter((m) => !m.verified_at);
  const c = counts as { mediators_verified: number; cases_active: number; cases_settled: number } | null;
  const cases = (mine ?? []) as JudiyyaCase[];
  const iAmMediator = user ? mediators.find((m) => m.user_id === user.id) : undefined;

  return (
    <NafirShell active="/nafir/judiyya" ok={ok} error={error}>
      <h1 className="text-2xl font-black">الجودية</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        «فأصلحوا بين أخويكم». الجودية وساطةٌ يعرفها السودان قبل المحاكم: أجاويد
        محايدون يرضاهم الطرفان، والتزامٌ بحكمهم قبل سماعه، وصلحٌ لا غالب فيه ولا
        مغلوب. هنا تُمشى خطواتها كما هي — ويبقى النزاع بين أهله، لا يراه غيرهم.
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border text-center">
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">أجاويد متحقَّقٌ منهم</dt>
          <dd className="figure text-xl font-black text-primary">{ar(c?.mediators_verified ?? 0)}</dd>
        </div>
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">وساطاتٌ جارية</dt>
          <dd className="figure text-xl font-black text-primary">{ar(c?.cases_active ?? 0)}</dd>
        </div>
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">صلحٌ خُتم</dt>
          <dd className="figure text-xl font-black text-primary">{ar(c?.cases_settled ?? 0)}</dd>
        </div>
      </dl>

      {/* ───────── الخطوات ───────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">كيف تمضي</h2>
        <ol className="flex flex-col gap-2 text-sm leading-7">
          {[
            "يفتح أحد الطرفين الطلب، ويرسل رابط الدعوة للطرف الآخر.",
            "يلتزم كلٌّ منهما بقبول حكم الأجاويد قبل أن يسمعه — ولا خطوة قبل الالتزامين.",
            "يختاران أجاويد من السجلّ. لا يجلس أجويدٌ إلا إذا رضيه الطرفان كلاهما وقَبِل هو، ولا يكون طرفاً.",
            "يسمع الأجاويد الطرفين حيث يجتمعون، ثمّ يكتب أحدهم الصلح هنا.",
            "يُقرّ كلُّ طرفٍ الصلح باسمه، فيُختم ويُحفظ. وإن عُدّل النصّ سقط الإقرار وأُعيد.",
          ].map((t, k) => (
            <li key={k} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <span className="figure flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
                {ar(k + 1)}
              </span>
              {t}
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-7">
          <strong>الجودية ليست محكمة.</strong> لا تحلّ محلّ القضاء في دمٍ أو جنايةٍ
          أو حقٍّ لا يُتصالح عليه، ولا تُلزم أحداً لم يلتزم. وإن خيف على نفسٍ أو
          مالٍ فالشرطة والنيابة أوّلاً.
        </p>
      </section>

      {/* ───────── طلباتي ───────── */}
      {user && cases.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">طلباتي</h2>
          <ul className="flex flex-col gap-2">
            {cases.map((k) => (
              <li key={k.id}>
                <Link href={`/nafir/judiyya/${k.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary">
                  <span className="font-medium">{k.title}</span>
                  <span className="text-xs text-muted">
                    {JUDIYYA_KINDS[k.kind]} · {JUDIYYA_STATUS[k.status]} · {ageAr(k.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── افتح طلباً ───────── */}
      <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">افتح طلب جودية</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتفتح طلباً.
          </p>
        ) : (
          <form action={openCase} className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                موضوع النزاع
                <select name="kind" required className={field} defaultValue="water">
                  {Object.entries(JUDIYYA_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                اسمك كما يراه الطرف الآخر والأجاويد
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
            </div>
            <input name="title" required minLength={5} maxLength={120} className={field} placeholder="عنوانٌ قصير: نوبة الماء في الترعة الفرعية" />
            <textarea name="summary" required minLength={20} maxLength={2000} rows={4} className={field} placeholder="ما الخلاف، ومنذ متى — بهدوء، فالطرف الآخر سيقرؤه" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="state" required className={field} defaultValue="">
                <option value="" disabled>الولاية</option>
                {SUDAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input name="locality" required minLength={2} maxLength={80} className={field} placeholder="المحلية أو القرية" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="understood" required className="mt-1" />
              قرأتُ ما الجودية وما ليست، وأطلبها طوعاً.
            </label>
            <button className={`${button} self-start`}>افتح الطلب</button>
          </form>
        )}
      </section>

      {/* ───────── سجلّ الأجاويد ───────── */}
      <section className="mt-8">
        <h2 className="mb-1 text-lg font-bold">سجلّ الأجاويد ({ar(verified.length)})</h2>
        <p className="mb-3 text-sm text-muted">
          شيوخٌ ووجهاءُ تطوّعوا للإصلاح، وتحقّقت الإدارة من أنهم مَن يقولون. لا
          تختار الإدارةُ أجويداً لأحد — يختاره الطرفان.
        </p>
        {verified.length === 0 ? (
          <p className="text-sm text-muted">لا أجويد في السجلّ بعد.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {verified.map((m) => (
              <li key={m.user_id} className="rounded-xl border border-border bg-card p-3">
                <p className="font-bold">{m.display_name} <span className="text-xs font-normal text-muted">· {m.state}</span></p>
                <p className="mt-1 text-sm leading-6 text-muted">{m.about}</p>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && pending.length > 0 && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3">
            <p className="mb-2 text-sm font-bold">ينتظرون التحقّق</p>
            <ul className="flex flex-col gap-2">
              {pending.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{m.display_name} · {m.state} — <span className="text-muted">{m.about}</span></span>
                  <form action={verifyMediator}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button className={ghost}>تحقّقتُ منه</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user && (
          <details className="mt-4 rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {iAmMediator ? "عدّل بياناتك في السجلّ" : "تطوّع أجويداً"}
            </summary>
            <form action={volunteer} className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={iAmMediator?.display_name ?? name} className={field} />
                <select name="state" required className={field} defaultValue={iAmMediator?.state ?? ""}>
                  <option value="" disabled>الولاية</option>
                  {SUDAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <textarea name="about" required minLength={20} maxLength={500} rows={3} defaultValue={iAmMediator?.about} className={field} placeholder="مَن أنت، ولماذا يُرضى بك: «عمدة قرية كذا، صالحتُ في نزاعات ماءٍ عشرين سنة»" />
              <p className="text-xs text-muted">كلُّ تعديلٍ يُعاد التحقّق منه.</p>
              <button className={`${button} self-start`}>أرسل</button>
            </form>
          </details>
        )}
      </section>
    </NafirShell>
  );
}
