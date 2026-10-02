import Link from "next/link";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { ageAr, ar, type ShuraItem } from "@/lib/nafir";
import { answerShura, askShura, toggleSupport } from "../actions";

export const metadata = {
  title: "الشورى | سودغري",
  description: "«وأمرُهم شورى بينهم» — يُسأل القادة علناً، ويُجيبون بأسمائهم، ويبقى السؤال ظاهراً بعمره حتى يُجاب.",
};

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
  const { supabase, user, name, isAdmin } = await nafirViewer();

  const [{ data: items }, { data: counts }, { data: mineRows }, leader] = await Promise.all([
    supabase.from("shura_items").select("*").order("created_at", { ascending: true }).limit(200),
    supabase.rpc("shura_support_counts"),
    user ? supabase.from("shura_supports").select("item_id") : Promise.resolve({ data: [] }),
    user ? supabase.rpc("is_charter_leader") : Promise.resolve({ data: false }),
  ]);
  const all = (items ?? []) as ShuraItem[];
  const support = new Map(((counts ?? []) as { item_id: string; supports: number }[]).map((c) => [c.item_id, Number(c.supports)]));
  const mine = new Set(((mineRows ?? []) as { item_id: string }[]).map((r) => r.item_id));
  const canAnswer = isAdmin || leader.data === true;

  const waiting = all.filter((i) => !i.answer);
  const answered = all.filter((i) => i.answer).reverse();

  const Item = ({ i }: { i: ShuraItem }) => (
    <li id={i.id} className="scroll-mt-20 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">
        {i.kind === "question" ? "سؤال" : "مقترح"} من {i.display_name} · {ageAr(i.created_at)}
        {!i.answer && <strong className="text-danger"> · بلا جوابٍ {ageAr(i.created_at)}</strong>}
      </p>
      <h3 className="mt-1 font-bold">{i.title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-7">{i.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="figure text-muted">يؤيّده {ar(support.get(i.id) ?? 0)}</span>
        {user && (
          <form action={toggleSupport}>
            <input type="hidden" name="item_id" value={i.id} />
            <input type="hidden" name="on" value={mine.has(i.id) ? "0" : "1"} />
            <button className={`${ghost} py-1 text-xs`}>{mine.has(i.id) ? "أسحب تأييدي" : "أؤيّد"}</button>
          </form>
        )}
      </div>
      {i.answer ? (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs text-primary">
            أجاب {i.answer_name} · {i.answered_at && ageAr(i.answered_at)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-7">{i.answer}</p>
        </div>
      ) : (
        canAnswer && (
          <form action={answerShura} className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-3">
            <input type="hidden" name="item_id" value={i.id} />
            <textarea name="answer" required minLength={10} maxLength={2000} rows={3} className={field} placeholder="الجواب — يُنشر باسمك" />
            <div className="flex flex-wrap items-center gap-2">
              <input name="answer_name" required minLength={2} maxLength={60} defaultValue={name} className={`${field} w-48`} />
              <button className={button}>أجب علناً</button>
            </div>
          </form>
        )
      )}
    </li>
  );

  return (
    <NafirShell active="/nafir/shura" ok={ok} error={error}>
      <h1 className="text-2xl font-black">الشورى</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        «وأمرُهم شورى بينهم». اسأل القادة أو اقترح عليهم — عن توزيع العائد،
        ونوبات الماء، وقواعد التعاونية. السؤال يبقى ظاهراً بعمره حتى يُجاب،
        والجواب باسم مَن أجاب. يجيب القادة الموقّعون على الميثاق بعد التحقّق
        منهم، والإدارة.
      </p>

      {user ? (
        <form action={askShura} className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="question" defaultChecked /> سؤال</label>
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="proposal" /> مقترح</label>
          </fieldset>
          <input name="title" required minLength={5} maxLength={150} className={field} placeholder="كيف يُوزَّع عائد الموسم على الأعضاء؟" />
          <textarea name="body" required minLength={10} maxLength={2000} rows={3} className={field} placeholder="التفاصيل" />
          <div className="flex flex-wrap items-center gap-2">
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={`${field} w-48`} />
            <button className={button}>انشر</button>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتسأل أو تقترح أو تؤيّد.
        </p>
      )}

      <h2 className="mb-3 mt-8 text-xl font-bold">ينتظر الجواب ({ar(waiting.length)})</h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted">لا سؤال ينتظر.</p>
      ) : (
        <ul className="flex flex-col gap-3">{waiting.map((i) => <Item key={i.id} i={i} />)}</ul>
      )}

      {answered.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold">أُجيب ({ar(answered.length)})</h2>
          <ul className="flex flex-col gap-3">{answered.map((i) => <Item key={i.id} i={i} />)}</ul>
        </>
      )}
    </NafirShell>
  );
}
