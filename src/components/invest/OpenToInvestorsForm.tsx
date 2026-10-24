import { tr, type Locale } from "@/lib/i18n";
import { lbl } from "@/lib/partners";
import { INVESTOR_MODEL_DETAIL, INVESTOR_MODEL_LABEL, INVESTOR_MODELS } from "@/lib/investors";
import { button, field } from "@/lib/ui";
import { setInvestorConsent } from "@/app/invest/actions";

/**
 * «اعرض أرضي على المستثمرين»: the partnership models the owner accepts and a
 * line for investors. One copy, on the owner's land card (LandInvestorConsent)
 * and on the project page built on that land — where the owner was told to go
 * to «أراضيّ» for it, and asked how anyone was to partner with him (24 October).
 */
export default function OpenToInvestorsForm({
  landId,
  models = [],
  note,
  locale,
  returnTo,
}: {
  landId: string;
  /** The models chosen last time; all of them when none were. */
  models?: string[];
  note?: string | null;
  locale: Locale;
  /** A project page to come back to; «أراضيّ» otherwise. */
  returnTo?: string;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const chosen = new Set(models);
  return (
    <form action={setInvestorConsent} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="land_id" value={landId} />
      <input type="hidden" name="open" value="true" />
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">{t("ما الشراكة التي تقبلها؟", "Which partnerships do you accept?")}</legend>
        {INVESTOR_MODELS.map((m) => (
          <label key={m} className="flex items-start gap-2">
            <input type="checkbox" name="models" value={m} defaultChecked={chosen.size === 0 || chosen.has(m)} className="mt-1 size-4" />
            <span>
              <span className="font-bold">{lbl(INVESTOR_MODEL_LABEL[m], locale)}</span>
              <span className="block text-xs text-muted">{lbl(INVESTOR_MODEL_DETAIL[m].owner, locale)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        {t("سطرٌ عن أرضك للمستثمر (اختياري)", "A line about your land for investors (optional)")}
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={note ?? ""}
          className={field}
          placeholder={t(
            "مثال: أرضٌ على النيل بمضخّة تعمل، زرعتُها بامية وطماطم، وأريد ممّولاً للموسم الشتوي.",
            "e.g. Land on the Nile with a working pump; grew okra and tomato; looking for finance for the winter season.",
          )}
        />
        <span className="text-xs text-muted">
          {t("لا تكتب اسمك ولا هاتفك هنا — يُكشفان بعد موافقتك.", "Don't write your name or phone here — they are shared after you agree.")}
        </span>
      </label>
      <button className={`${button} self-start`}>{t("اعرض أرضي على المستثمرين", "Offer my land to investors")}</button>
    </form>
  );
}
