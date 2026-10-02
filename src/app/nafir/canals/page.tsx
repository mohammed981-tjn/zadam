import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { SUDAN_STATES, ar, type CanalSummary } from "@/lib/nafir";
import { createCanal } from "./actions";

export const metadata = {
  title: "الترع | سودغري",
  description:
    "الترعة موردٌ مشترك: أعضاؤها، ونوبات مائها، وواجب صيانتها بقدر فدادين كلٍّ منهم — ونفيرُ تطهيرها.",
};

/**
 * The directory of canals: name, place, how many members and how much land —
 * enough to find yours and ask to join. Who the members are, and their turns,
 * stay inside the canal (the page for each one).
 */
export default async function CanalsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { supabase, user, name } = await nafirViewer();
  const { data } = await supabase.rpc("canal_directory");
  const canals = (data ?? []) as CanalSummary[];

  return (
    <NafirShell active="/nafir/canals" ok={ok} error={error}>
      <h1 className="text-2xl font-black">الترع</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        الترعة موردٌ مشترك: ماؤها لأهلها بنوبات، وصيانتها عليهم بقدر ما تسقي
        لكلٍّ منهم. هكذا تبقى — ودرس مشروع الجزيرة أنّ الترعة التي يتولّى
        أهلُها صيانتها زادت غلّتها أضعافاً. سجّل ترعتك، واقبل جيرانك أعضاءً،
        واكتب جدول النوبات، وادعُ إلى نفير تطهيرها.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {canals.length === 0 && (
          <li className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">لا ترعة مسجّلة بعد.</li>
        )}
        {canals.map((c) => (
          <li key={c.id}>
            <Link href={`/nafir/canals/${c.id}`} className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-card p-4 hover:border-primary">
              <span className="font-bold">{c.name}</span>
              <span className="text-xs text-muted">{c.state} — {c.locality}</span>
              {c.description && <span className="text-sm text-muted">{c.description}</span>}
              <span className="figure mt-auto text-sm">
                {ar(Number(c.members))} عضواً · {ar(Number(c.feddans))} فدان
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">سجّل ترعتك</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتسجّل ترعة.
          </p>
        ) : (
          <form action={createCanal} className="mt-3 flex flex-col gap-3">
            <input name="name" required minLength={3} maxLength={80} className={field} placeholder="اسم الترعة أو الميسقة: ميسقة ٧ — الحصاحيصا" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="state" required className={field} defaultValue="">
                <option value="" disabled>الولاية</option>
                {SUDAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input name="locality" required minLength={2} maxLength={80} className={field} placeholder="المحلية أو القرية" />
            </div>
            <textarea name="description" maxLength={1000} rows={2} className={field} placeholder="وصفٌ قصير (اختياري): من أين تأخذ، وكم تسقي" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                اسمك كما يراه الأعضاء
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                فدادينك التي تسقيها
                <input type="number" name="feddans" required min={0.25} max={10000} step={0.25} className={field} />
              </label>
            </div>
            <p className="text-xs text-muted">مَن يسجّل الترعة يكون قيّمها: يقبل الأعضاء، ويثبّت فدادينهم، ويكتب الجدول. ويمكنه أن يجعل غيره قيّماً معه.</p>
            <button className={`${button} self-start`}>سجّل الترعة</button>
          </form>
        )}
      </section>
    </NafirShell>
  );
}
