import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import {
  JUDIYYA_KINDS,
  JUDIYYA_KINDS_EN,
  JUDIYYA_STATUS,
  JUDIYYA_STATUS_EN,
  SUDAN_STATES,
  ageAr,
  ar,
  label,
  stateName,
  typed,
  type JudiyyaCase,
  type JudiyyaMediator,
} from "@/lib/nafir";
import { openCase, verifyMediator, volunteer } from "./actions";
import FilmPlayer from "@/components/FilmPlayer";
import { columnsFor } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الجودية | سوداقري", "Judiyya | Sudagri"),
    description: tr(
      locale,
      "وساطة الأجاويد في نزاعات الماء والحدود والمرعى: يلتزم الطرفان بالحكم قبل سماعه، ويختاران أجاويد محايدين، ويُختم الصلح بإقرارهما — ويبقى بين أهله.",
      "Judiyya — mediation by respected elders (ajawid) in disputes over water, boundaries and grazing: both parties commit to the ruling before hearing it, choose neutral mediators together, and seal the settlement by confirming it — and it stays between the people concerned.",
    ),
  };
}

const STEPS: [string, string][] = [
  ["يفتح أحد الطرفين الطلب، ويرسل رابط الدعوة للطرف الآخر.", "One party opens the case and sends the invitation link to the other."],
  [
    "يلتزم كلٌّ منهما بقبول حكم الأجاويد قبل أن يسمعه — ولا خطوة قبل الالتزامين.",
    "Each commits to accept the mediators’ ruling before hearing it — nothing moves until both have committed.",
  ],
  [
    "يختاران أجاويد من السجلّ. لا يجلس أجويدٌ إلا إذا رضيه الطرفان كلاهما وقَبِل هو، ولا يكون طرفاً.",
    "Together they choose mediators from the register. A mediator sits only if both parties approve, they accept, and they are not a party to the dispute.",
  ],
  [
    "يسمع الأجاويد الطرفين حيث يجتمعون، ثمّ يكتب أحدهم الصلح هنا.",
    "The mediators hear both sides wherever they meet, and then one of them writes the settlement here.",
  ],
  [
    "يُقرّ كلُّ طرفٍ الصلح باسمه، فيُختم ويُحفظ. وإن عُدّل النصّ سقط الإقرار وأُعيد.",
    "Each party confirms the settlement by name, and it is sealed and kept. If the text is changed, the confirmations lapse and are asked for again.",
  ],
];

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const en = locale === "en";
  const { supabase, user, name, isAdmin } = await nafirViewer();

  const [{ data: meds }, { data: counts }, { data: mine }] = await Promise.all([
    supabase.from("judiyya_mediators").select(columnsFor("judiyya_mediators", Boolean(user))).order("verified_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("judiyya_counts").single(),
    user
      ? supabase.from("judiyya_cases").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const mediators = (meds ?? []) as unknown as JudiyyaMediator[];
  const verified = mediators.filter((m) => m.verified_at);
  const pending = mediators.filter((m) => !m.verified_at);
  const c = counts as { mediators_verified: number; cases_active: number; cases_settled: number } | null;
  const cases = (mine ?? []) as JudiyyaCase[];
  const iAmMediator = user ? mediators.find((m) => m.user_id === user.id) : undefined;
  const kinds = en ? JUDIYYA_KINDS_EN : JUDIYYA_KINDS;

  return (
    <NafirShell active="/nafir/judiyya" ok={ok} error={error}>
      <h1 className="text-2xl font-black">{t("الجودية", "Judiyya (mediation)")}</h1>
      {en ? (
        <>
          <p lang="ar" dir="rtl" className="mt-2 leading-8 text-muted">«فأصلحوا بين أخويكم»</p>
          <p className="mt-1 max-w-2xl leading-8 text-muted">
            “…so make settlement between your brothers” (al-Hujurat 49:10). Judiyya is a form of mediation Sudan knew
            before the courts: neutral mediators (ajawid) whom both parties accept, a commitment to their ruling before
            hearing it, and a settlement with no winner and no loser. Here its steps are followed as they are — and
            the dispute stays between the people concerned; no one else sees it.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-2xl leading-8 text-muted">
          «فأصلحوا بين أخويكم». الجودية وساطةٌ يعرفها السودان قبل المحاكم: أجاويد
          محايدون يرضاهم الطرفان، والتزامٌ بحكمهم قبل سماعه، وصلحٌ لا غالب فيه ولا
          مغلوب. هنا تُمشى خطواتها كما هي — ويبقى النزاع بين أهله، لا يراه غيرهم.
        </p>
      )}

      <figure className="my-6">
        <FilmPlayer base="/video/judiyya-wide" poster="/video/judiyya-wide.jpg" label={t("فيلم سوداقري: الجودية", "A Sudagri film: Judiyya")} />
      </figure>

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border text-center">
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">{t("أجاويد متحقَّقٌ منهم", "Verified mediators")}</dt>
          <dd className="figure text-xl font-black text-primary">{n(c?.mediators_verified ?? 0)}</dd>
        </div>
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">{t("وساطاتٌ جارية", "Mediations under way")}</dt>
          <dd className="figure text-xl font-black text-primary">{n(c?.cases_active ?? 0)}</dd>
        </div>
        <div className="bg-card p-3">
          <dt className="text-xs text-muted">{t("صلحٌ خُتم", "Settlements sealed")}</dt>
          <dd className="figure text-xl font-black text-primary">{n(c?.cases_settled ?? 0)}</dd>
        </div>
      </dl>

      {/* ───────── الخطوات ───────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("كيف تمضي", "How it works")}</h2>
        <ol className="flex flex-col gap-2 text-sm leading-7">
          {STEPS.map(([a, e], k) => (
            <li key={k} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <span className="figure flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
                {n(k + 1)}
              </span>
              {t(a, e)}
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-7">
          <strong>{t("الجودية ليست محكمة.", "Judiyya is not a court.")}</strong>{" "}
          {t(
            "لا تحلّ محلّ القضاء في دمٍ أو جنايةٍ أو حقٍّ لا يُتصالح عليه، ولا تُلزم أحداً لم يلتزم. وإن خيف على نفسٍ أو مالٍ فالشرطة والنيابة أوّلاً.",
            "It does not replace the courts in cases of bloodshed, crime, or rights that cannot be settled by agreement, and it binds no one who has not committed. If a life or property is at risk, go to the police and the prosecutor first.",
          )}
        </p>
      </section>

      {/* ───────── طلباتي ───────── */}
      {user && cases.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t("طلباتي", "My cases")}</h2>
          <ul className="flex flex-col gap-2">
            {cases.map((k) => (
              <li key={k.id}>
                <Link href={`/nafir/judiyya/${k.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary">
                  <span className="font-medium" {...typed(locale)}>{k.title}</span>
                  <span className="text-xs text-muted">
                    {label(JUDIYYA_KINDS, JUDIYYA_KINDS_EN, k.kind, locale)} · {label(JUDIYYA_STATUS, JUDIYYA_STATUS_EN, k.status, locale)} ·{" "}
                    {ageAr(k.created_at, undefined, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── افتح طلباً ───────── */}
      <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">{t("افتح طلب جودية", "Open a judiyya case")}</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href={loginTo("/nafir/judiyya")} className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
            {t("لتفتح طلباً.", "to open a case.")}
          </p>
        ) : (
          <form action={openCase} className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                {t("موضوع النزاع", "What the dispute is about")}
                <select name="kind" required className={field} defaultValue="water">
                  {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("اسمك كما يراه الطرف الآخر والأجاويد", "Your name as the other party and the mediators will see it")}
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
            </div>
            <input
              name="title"
              required
              minLength={5}
              maxLength={120}
              className={field}
              placeholder={t("عنوانٌ قصير: نوبة الماء في الترعة الفرعية", "A short title: the watering turn on the branch canal")}
            />
            <textarea
              name="summary"
              required
              minLength={20}
              maxLength={2000}
              rows={4}
              className={field}
              placeholder={t("ما الخلاف، ومنذ متى — بهدوء، فالطرف الآخر سيقرؤه", "What the disagreement is, and since when — calmly, as the other party will read it")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="state" required className={field} defaultValue="" aria-label={t("الولاية", "State")}>
                <option value="" disabled>{t("الولاية", "State")}</option>
                {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
              </select>
              <input
                name="locality"
                required
                minLength={2}
                maxLength={80}
                className={field}
                placeholder={t("المحلية أو القرية", "Locality or village")}
                aria-label={t("المحلية أو القرية", "Locality or village")}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="understood" required className="mt-1" />
              {t("قرأتُ ما الجودية وما ليست، وأطلبها طوعاً.", "I have read what judiyya is and what it is not, and I ask for it freely.")}
            </label>
            <button className={`${button} self-start`}>{t("افتح الطلب", "Open the case")}</button>
          </form>
        )}
      </section>

      {/* ───────── سجلّ الأجاويد ───────── */}
      <section className="mt-8">
        <h2 className="mb-1 text-lg font-bold">
          {t("سجلّ الأجاويد", "Register of mediators")} ({n(verified.length)})
        </h2>
        <p className="mb-3 text-sm text-muted">
          {t(
            "شيوخٌ ووجهاءُ تطوّعوا للإصلاح، وتحقّقت الإدارة من أنهم مَن يقولون. لا تختار الإدارةُ أجويداً لأحد — يختاره الطرفان.",
            "Sheikhs and respected elders who volunteered to make peace, and whom the administration has checked are who they say they are. The administration chooses no mediator for anyone — the two parties choose.",
          )}
        </p>
        {verified.length === 0 ? (
          <p className="text-sm text-muted">{t("لا أجويد في السجلّ بعد.", "No mediators in the register yet.")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {verified.map((m, i) => (
              <li key={m.user_id ?? i} className="rounded-xl border border-border bg-card p-3">
                <p className="font-bold">
                  <bdi>{m.display_name}</bdi> <span className="text-xs font-normal text-muted">· {stateName(m.state, locale)}</span>
                </p>
                <p className="mt-1 text-sm leading-6 text-muted" {...typed(locale)}>{m.about}</p>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && pending.length > 0 && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3">
            <p className="mb-2 text-sm font-bold">{t("ينتظرون التحقّق", "Awaiting verification")}</p>
            <ul className="flex flex-col gap-2">
              {pending.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <bdi>{m.display_name}</bdi> · {stateName(m.state, locale)} — <span className="text-muted" {...typed(locale)}>{m.about}</span>
                  </span>
                  <form action={verifyMediator}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button className={ghost}>{t("تحقّقتُ منه", "Mark as verified")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user && (
          <details className="mt-4 rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {iAmMediator ? t("عدّل بياناتك في السجلّ", "Edit your entry in the register") : t("تطوّع أجويداً", "Volunteer as a mediator")}
            </summary>
            <form action={volunteer} className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="display_name"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={iAmMediator?.display_name ?? name}
                  aria-label={t("اسمك", "Your name")}
                  className={field}
                />
                <select name="state" required className={field} defaultValue={iAmMediator?.state ?? ""} aria-label={t("الولاية", "State")}>
                  <option value="" disabled>{t("الولاية", "State")}</option>
                  {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
                </select>
              </div>
              <textarea
                name="about"
                required
                minLength={20}
                maxLength={500}
                rows={3}
                defaultValue={iAmMediator?.about}
                className={field}
                placeholder={t(
                  "مَن أنت، ولماذا يُرضى بك: «عمدة قرية كذا، صالحتُ في نزاعات ماءٍ عشرين سنة»",
                  "Who you are, and why people would accept you: “Village headman of …, I have settled water disputes for twenty years”",
                )}
              />
              <p className="text-xs text-muted">{t("كلُّ تعديلٍ يُعاد التحقّق منه.", "Every change is verified again.")}</p>
              <button className={`${button} self-start`}>{t("أرسل", "Send")}</button>
            </form>
          </details>
        )}
      </section>
    </NafirShell>
  );
}
