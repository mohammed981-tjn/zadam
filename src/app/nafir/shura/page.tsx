import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { ageAr, ar, typed, type ShuraItem } from "@/lib/nafir";
import { answerShura, askShura, toggleSupport } from "../actions";
import FilmPlayer from "@/components/FilmPlayer";
import { columnsFor } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الشورى | سوداقري", "Shura | Sudagri"),
    description: tr(
      locale,
      "«وأمرُهم شورى بينهم» — يُسأل القادة علناً، ويُجيبون بأسمائهم، ويبقى السؤال ظاهراً بعمره حتى يُجاب.",
      "“…and whose affair is [determined by] consultation among themselves” — leaders are questioned in public and answer by name, and each question stays visible, with its age, until it is answered.",
    ),
  };
}

/**
 * Questions and proposals to the leaders, in public.
 *
 * Unanswered items are listed first, oldest first, with their age: silence is
 * the thing this page exists to make visible. Supports are counted and never
 * named. Answering is open to admins and to leaders the platform has verified
 * — the database decides that, not this page (is_charter_leader()).
 */
export default async function ShuraPage({
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

  const [{ data: items }, { data: counts }, { data: mineRows }, leader] = await Promise.all([
    supabase.from("shura_items").select(columnsFor("shura_items", Boolean(user))).order("created_at", { ascending: true }).limit(200),
    supabase.rpc("shura_support_counts"),
    user ? supabase.from("shura_supports").select("item_id") : Promise.resolve({ data: [] }),
    user ? supabase.rpc("is_charter_leader") : Promise.resolve({ data: false }),
  ]);
  const all = (items ?? []) as unknown as ShuraItem[];
  const support = new Map(((counts ?? []) as { item_id: string; supports: number }[]).map((c) => [c.item_id, Number(c.supports)]));
  const mine = new Set(((mineRows ?? []) as { item_id: string }[]).map((r) => r.item_id));
  const canAnswer = isAdmin || leader.data === true;

  const waiting = all.filter((i) => !i.answer);
  const answered = all.filter((i) => i.answer).reverse();

  const Item = ({ i }: { i: ShuraItem }) => (
    <li id={i.id} className="scroll-mt-20 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">
        {i.kind === "question" ? t("سؤال", "Question") : t("مقترح", "Proposal")} {t("من", "from")} <bdi>{i.display_name}</bdi> ·{" "}
        {ageAr(i.created_at, undefined, locale)}
        {!i.answer && (
          <strong className="text-danger">
            {" "}
            · {en ? `unanswered since ${ageAr(i.created_at, undefined, locale)}` : `بلا جوابٍ ${ageAr(i.created_at)}`}
          </strong>
        )}
      </p>
      <h3 className="mt-1 font-bold" {...typed(locale)}>{i.title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-7" {...typed(locale)}>{i.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="figure text-muted">
          {en ? `Supported by ${n(support.get(i.id) ?? 0)}` : `يؤيّده ${n(support.get(i.id) ?? 0)}`}
        </span>
        {user && (
          <form action={toggleSupport}>
            <input type="hidden" name="item_id" value={i.id} />
            <input type="hidden" name="on" value={mine.has(i.id) ? "0" : "1"} />
            <button className={`${ghost} py-1 text-xs`}>
              {mine.has(i.id) ? t("أسحب تأييدي", "Withdraw my support") : t("أؤيّد", "Support")}
            </button>
          </form>
        )}
      </div>
      {i.answer ? (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs text-primary">
            {t("أجاب", "Answered by")} <bdi>{i.answer_name}</bdi> · {i.answered_at && ageAr(i.answered_at, undefined, locale)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-7" {...typed(locale)}>{i.answer}</p>
        </div>
      ) : (
        canAnswer && (
          <form action={answerShura} className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-3">
            <input type="hidden" name="item_id" value={i.id} />
            <textarea
              name="answer"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              className={field}
              placeholder={t("الجواب — يُنشر باسمك", "Your answer — published under your name")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                name="answer_name"
                required
                minLength={2}
                maxLength={60}
                defaultValue={name}
                aria-label={t("اسمك", "Your name")}
                className={`${field} w-48`}
              />
              <button className={button}>{t("أجب علناً", "Answer in public")}</button>
            </div>
          </form>
        )
      )}
    </li>
  );

  return (
    <NafirShell active="/nafir/shura" ok={ok} error={error}>
      <h1 className="text-2xl font-black">{t("الشورى", "Shura (consultation)")}</h1>
      {en ? (
        <>
          <p lang="ar" dir="rtl" className="mt-2 leading-8 text-muted">«وأمرُهم شورى بينهم»</p>
          <p className="mt-1 max-w-2xl leading-8 text-muted">
            “…and whose affair is [determined by] consultation among themselves” (ash-Shura 42:38). Ask the leaders a
            question or put a proposal to them — about how the returns are shared, watering turns, or the cooperative’s
            rules. A question stays visible, with its age, until it is answered, and each answer carries the name of
            whoever gave it. Leaders who have signed the charter answer once verified, and so does the administration.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-2xl leading-8 text-muted">
          «وأمرُهم شورى بينهم». اسأل القادة أو اقترح عليهم — عن توزيع العائد،
          ونوبات الماء، وقواعد التعاونية. السؤال يبقى ظاهراً بعمره حتى يُجاب،
          والجواب باسم مَن أجاب. يجيب القادة الموقّعون على الميثاق بعد التحقّق
          منهم، والإدارة.
        </p>
      )}

      <figure className="my-6">
        <FilmPlayer base="/video/shura-wide" poster="/video/shura-wide.jpg" label={t("فيلم سوداقري: الشورى", "A Sudagri film: Shura")} />
      </figure>

      {user ? (
        <form action={askShura} className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="question" defaultChecked /> {t("سؤال", "Question")}</label>
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="proposal" /> {t("مقترح", "Proposal")}</label>
          </fieldset>
          <input
            name="title"
            required
            minLength={5}
            maxLength={150}
            className={field}
            placeholder={t("كيف يُوزَّع عائد الموسم على الأعضاء؟", "How will the season’s returns be shared among members?")}
          />
          <textarea name="body" required minLength={10} maxLength={2000} rows={3} className={field} placeholder={t("التفاصيل", "Details")} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="display_name"
              required
              minLength={2}
              maxLength={60}
              defaultValue={name}
              aria-label={t("اسمك", "Your name")}
              className={`${field} w-48`}
            />
            <button className={button}>{t("انشر", "Post")}</button>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
          {t("لتسأل أو تقترح أو تؤيّد.", "to ask, propose or support.")}
        </p>
      )}

      <h2 className="mb-3 mt-8 text-xl font-bold">
        {t("ينتظر الجواب", "Awaiting an answer")} ({n(waiting.length)})
      </h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted">{t("لا سؤال ينتظر.", "No question is waiting.")}</p>
      ) : (
        <ul className="flex flex-col gap-3">{waiting.map((i) => <Item key={i.id} i={i} />)}</ul>
      )}

      {answered.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold">
            {t("أُجيب", "Answered")} ({n(answered.length)})
          </h2>
          <ul className="flex flex-col gap-3">{answered.map((i) => <Item key={i.id} i={i} />)}</ul>
        </>
      )}
    </NafirShell>
  );
}
