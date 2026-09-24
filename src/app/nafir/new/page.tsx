import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { NAFIR_KINDS, SUDAN_STATES, tomorrowIso } from "@/lib/nafir";
import { createCall } from "../actions";

export const metadata = { title: "ادعُ إلى نفير | سودجري" };

/**
 * The call, in the order the tradition makes it: what work, where, which day,
 * how many hands — and the two halves of the bargain, what the host provides
 * and what the helper carries. A neighbour decides from this one screen.
 */
export default async function NewCallPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { user, name } = await nafirViewer();
  const tomorrow = tomorrowIso();

  return (
    <NafirShell active="/nafir" error={error}>
      <h1 className="text-2xl font-bold">ادعُ إلى نفير</h1>
      <p className="mb-6 mt-2 text-sm leading-7 text-muted">
        النفير عملٌ جماعيٌّ بلا أجر، يُكرم فيه صاحبُ الحاجة مَن لبّاه، ويلبّي
        هو حين يُدعى. اكتب ما يلزم ليقرّر جارك في قراءةٍ واحدة.
      </p>
      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link>{" "}
          لتدعو إلى نفير.
        </p>
      ) : (
        <form action={createCall} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <label className="flex flex-col gap-1 text-sm">
            نوع العمل
            <select name="kind" required className={field} defaultValue="harvest">
              {Object.entries(NAFIR_KINDS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            عنوان الدعوة
            <input name="title" required minLength={5} maxLength={120} className={field} placeholder="حصاد سمسم عشرين فداناً في الحواتة" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            التفاصيل
            <textarea name="description" required minLength={10} maxLength={1500} rows={4} className={field} placeholder="ما العمل بالضبط، ومتى يبدأ، وأين نلتقي" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              الولاية
              <select name="state" required className={field} defaultValue="">
                <option value="" disabled>اختر</option>
                {SUDAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              المحلية أو القرية
              <input name="locality" required minLength={2} maxLength={80} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              اليوم
              <input type="date" name="starts_on" required min={tomorrow.slice(0, 10)} defaultValue={tomorrow} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              كم يداً تحتاج؟
              <input type="number" name="needed" required min={1} max={500} defaultValue={10} className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            ما تقدّمه للملبّين <span className="text-xs text-muted">(اختياري — الفطور، الغداء، الماء…)</span>
            <input name="hosting" maxLength={200} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ما يحمله الملبّي معه <span className="text-xs text-muted">(اختياري — منجل، طورية، كوريك…)</span>
            <input name="bring_tools" maxLength={200} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الاسم الذي يظهر على الدعوة
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>انشر الدعوة</button>
        </form>
      )}
    </NafirShell>
  );
}
