import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { FAZA_CAUSES, FAZA_NEEDS, SUDAN_STATES } from "@/lib/nafir";
import { createFaza } from "../../actions";

export const metadata = { title: "اطلب فزعة | سوداغري" };

export default async function NewFazaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { user, name } = await nafirViewer();

  return (
    <NafirShell active="/nafir/faza" error={error}>
      <h1 className="text-2xl font-bold">اطلب فزعة</h1>
      <p className="mb-6 mt-2 text-sm leading-7 text-muted">
        اكتب ما أصابك وما يفيدك. العون هنا يدٌ أو آلةٌ أو بذرٌ أو ترحيلٌ أو
        مشورة — لا مال، فلا يُطلب ولا يُعرض.
      </p>
      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتطلب فزعة.
        </p>
      ) : (
        <form action={createFaza} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <label className="flex flex-col gap-1 text-sm">
            ما أصابك
            <select name="cause" required className={field} defaultValue="flood">
              {Object.entries(FAZA_CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            العنوان
            <input name="title" required minLength={5} maxLength={120} className={field} placeholder="السيل جرف بذور عشرة أفدنة" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            التفاصيل
            <textarea name="description" required minLength={10} maxLength={1500} rows={4} className={field} />
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1">ما الذي يفيدك؟</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(FAZA_NEEDS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                  <input type="checkbox" name="needs" value={k} /> {v}
                </label>
              ))}
            </div>
          </fieldset>
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
          </div>
          <label className="flex flex-col gap-1 text-sm">
            الاسم الذي يظهر على الطلب
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>انشر الطلب</button>
        </form>
      )}
    </NafirShell>
  );
}
