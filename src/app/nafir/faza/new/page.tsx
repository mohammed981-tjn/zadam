import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { FAZA_CAUSES, FAZA_CAUSES_EN, FAZA_NEEDS, FAZA_NEEDS_EN, SUDAN_STATES, stateName } from "@/lib/nafir";
import { createFaza } from "../../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "اطلب فزعة | سوداقري", "Ask for faza | Sudagri") };
}

export default async function NewFazaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const { user, name } = await nafirViewer();
  const causes = locale === "en" ? FAZA_CAUSES_EN : FAZA_CAUSES;
  const needs = locale === "en" ? FAZA_NEEDS_EN : FAZA_NEEDS;

  return (
    <NafirShell active="/nafir/faza" error={error}>
      <h1 className="text-2xl font-bold">{t("اطلب فزعة", "Ask for faza")}</h1>
      <p className="mb-6 mt-2 text-sm leading-7 text-muted">
        {t(
          "اكتب ما أصابك وما يفيدك. العون هنا يدٌ أو آلةٌ أو بذرٌ أو ترحيلٌ أو مشورة — لا مال، فلا يُطلب ولا يُعرض.",
          "Write what happened to you and what would help. Help here means hands, machinery, seed, transport or advice — never money; it is neither asked for nor offered.",
        )}
      </p>
      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
          {t("لتطلب فزعة.", "to ask for faza.")}
        </p>
      ) : (
        <form action={createFaza} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <label className="flex flex-col gap-1 text-sm">
            {t("ما أصابك", "What happened")}
            <select name="cause" required className={field} defaultValue="flood">
              {Object.entries(causes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("العنوان", "Title")}
            <input name="title" required minLength={5} maxLength={120} className={field} placeholder={t("السيل جرف بذور عشرة أفدنة", "The flood washed away the seed on ten feddans")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("التفاصيل", "Details")}
            <textarea name="description" required minLength={10} maxLength={1500} rows={4} className={field} />
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1">{t("ما الذي يفيدك؟", "What would help you?")}</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(needs).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                  <input type="checkbox" name="needs" value={k} /> {v}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("الولاية", "State")}
              <select name="state" required className={field} defaultValue="">
                <option value="" disabled>{t("اختر", "Choose")}</option>
                {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("المحلية أو القرية", "Locality or village")}
              <input name="locality" required minLength={2} maxLength={80} className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t("الاسم الذي يظهر على الطلب", "Name shown on the request")}
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>{t("انشر الطلب", "Post the request")}</button>
        </form>
      )}
    </NafirShell>
  );
}
