import Link from "next/link";
import ActionNotice from "@/components/ActionNotice";
import PageHeader from "@/components/PageHeader";
import MarketTabs from "@/components/market/MarketTabs";
import OfferNotice from "@/components/market/OfferNotice";
import PhoneField from "@/components/PhoneField";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { OFFER_CROPS, OFFER_UNITS, OFFER_UNIT_NAME, isNotYetCreated } from "@/lib/marketOffers";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import { createClient } from "@/lib/supabase/server";
import { createOffer } from "../actions";
import { field, label } from "@/lib/ui";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "أضف عرض بيع أو شراء | سوداقري", "Add a buy or sell offer | Sudagri"),
  };
}

/**
 * The form asks for the least a caller needs to decide whether to ring: what,
 * how much, where, and a number. Price and grade are optional — many offers
 * are "price on inspection" — and the phone number's publicity is stated
 * above the submit button, not in a policy page.
 */
export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: flash } = await searchParams;
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const probe = user ? await supabase.from("market_offers").select("id").limit(1) : null;
  const pending = isNotYetCreated(probe?.error);


  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <MarketTabs active="/market/offers" locale={locale} />
      <PageHeader icon="chart" eyebrow={t("البيع والشراء", "Buy & sell")} title={t("أضف عرضاً", "Add an offer")} />

      <ActionNotice error={flash} />

      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-bold text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
          {t("لتضيف عرضاً — حتى يُعرف صاحبه ويستطيع إغلاقه.", "to add an offer — so its owner is known and can close it.")}
        </p>
      ) : pending ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold">{t("تُفعَّل قريباً", "Opening soon")}</p>
          <p className="mt-2 text-sm text-muted">
            {t("نشر العروض ينتظر تفعيله في قاعدة البيانات.", "Publishing offers is waiting to be switched on in the database.")}
          </p>
        </div>
      ) : (
        <form action={createOffer} className="flex flex-col gap-4">
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-1">{t("ماذا تريد؟", "What do you want to do?")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="sell" defaultChecked /> {t("أبيع", "Sell")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="buy" /> {t("أشتري", "Buy")}
            </label>
          </fieldset>

          <label className={label}>
            {t("المحصول", "Crop")}
            <input name="crop" list="offer-crops" required minLength={2} maxLength={60} className={field} placeholder="سمسم" />
            <datalist id="offer-crops">
              {OFFER_CROPS.map((c) => (
                <option key={c.ar} value={c.ar}>{en ? c.en : undefined}</option>
              ))}
            </datalist>
            {en && <span className="text-xs text-muted">Crop names are kept in Arabic so the filter finds them.</span>}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("الكمية", "Quantity")}
              <input name="quantity" inputMode="decimal" required className={field} dir="ltr" />
            </label>
            <label className={label}>
              {t("الوحدة", "Unit")}
              <select name="unit" defaultValue="qintar" className={field}>
                {OFFER_UNITS.map((u) => (
                  <option key={u} value={u}>{en ? OFFER_UNIT_NAME[u].en : OFFER_UNIT_NAME[u].ar}</option>
                ))}
              </select>
            </label>
          </div>

          <label className={label}>
            {t("الصنف والجودة (اختياري)", "Variety and quality (optional)")}
            <input name="grade" maxLength={200} className={field} placeholder={t("مثلاً: سمسم أبيض نظيف، موسم 2026", "e.g. clean white sesame, 2026 season")} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("الولاية", "State")}
              <select name="state" required defaultValue="" className={field}>
                <option value="" disabled>{t("اختر", "Choose")}</option>
                {SUDAN_STATES.map((s) => (
                  <option key={s} value={s}>{stateName(s, locale)}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t("المحلية أو السوق", "Locality or market")}
              <input name="locality" required minLength={2} maxLength={80} className={field} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("السعر بالجنيه للوحدة (اختياري)", "Price in SDG per unit (optional)")}
              <input name="price_sdg" inputMode="decimal" className={field} dir="ltr" />
            </label>
            <label className={label}>
              {t("أو بالدولار (اختياري)", "Or in USD (optional)")}
              <input name="price_usd" inputMode="decimal" className={field} dir="ltr" />
            </label>
          </div>

          <PhoneField locale={locale} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="whatsapp" value="1" defaultChecked /> {t("الرقم عليه واتساب", "This number is on WhatsApp")}
          </label>

          <label className={label}>
            {t("ملاحظات (اختياري)", "Notes (optional)")}
            <textarea name="notes" maxLength={1000} rows={3} className={field} />
          </label>

          <label className={label}>
            {t("مدّة العرض", "How long it stays up")}
            <select name="days" defaultValue="30" className={field}>
              <option value="7">{t("أسبوع", "One week")}</option>
              <option value="14">{t("أسبوعان", "Two weeks")}</option>
              <option value="30">{t("شهر", "One month")}</option>
              <option value="60">{t("شهران", "Two months")}</option>
            </select>
          </label>

          <OfferNotice locale={locale} />

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" value="1" required className="mt-1" />
            <span>
              {t(
                "فهمتُ أنّ رقمي يظهر لكلّ من يزور الصفحة، وأنّ المنصّة لا تتوسّط في المال ولا التسليم.",
                "I understand that my number is shown to everyone who visits the page, and that the platform does not handle money or delivery.",
              )}
            </span>
          </label>

          <button className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t("انشر العرض", "Publish the offer")}</button>
        </form>
      )}
    </div>
  );
}
