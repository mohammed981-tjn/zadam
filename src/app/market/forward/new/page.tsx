import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { button, card, field, label } from "@/lib/ui";
import { OFFER_CROPS, OFFER_UNITS, OFFER_UNIT_NAME, type MarketOffer } from "@/lib/marketOffers";
import { proposeForward } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "اقترح عقداً آجلاً | سوداقري", "Propose a forward contract | Sudagri") };
}

/**
 * اقتراح عقدٍ آجل (البند ١٧٠): برقم جوّال الطرف الآخر، أو من عرضٍ في السوق فتُملأ الشروط منه ويُعرف الطرف الآخر بصاحبه.
 * الاقتراح توقيعُ المقترح؛ والعقد يُلزم حين يوقّعه الآخر.
 */
export default async function NewForwardPage({ searchParams }: PageProps<"/market/forward/new">) {
  const sp = await searchParams;
  const offerId = typeof sp.offer === "string" && /^[0-9a-f-]{36}$/.test(sp.offer) ? sp.offer : null;
  // «اشترِ لأهلك» (البند ١٧٢): the buyer is abroad and names who receives for them.
  const family = sp.family === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo(offerId ? `/market/forward/new?offer=${offerId}` : "/market/forward/new"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  const { data: offerRow } = offerId
    ? await supabase.from("market_offers").select("id, kind, crop, quantity, unit, grade, price_sdg, price_usd, state, locality").eq("id", offerId).maybeSingle()
    : { data: null };
  const offer = offerRow as Pick<
    MarketOffer,
    "id" | "kind" | "crop" | "quantity" | "unit" | "grade" | "price_sdg" | "price_usd" | "state" | "locality"
  > | null;
  // A notice to buy is answered by a farmer, a notice to sell by a buyer.
  const side = offer ? (offer.kind === "buy" ? "farmer" : "buyer") : family ? "buyer" : null;
  const { data: seasonRows } = await supabase
    .from("seasons")
    .select("id, name, planting_date")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("planting_date", { ascending: false });
  const seasons = (seasonRows ?? []) as { id: string; name: string }[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/market/forward" className="text-sm text-primary underline">
        {t("→ العقود الآجلة", "← Forward contracts")}
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        {family ? t("اشترِ حصاداً لأهلك", "Buy a harvest for your family") : t("اقترح عقداً آجلاً", "Propose a forward contract")}
      </h1>
      {family && (
        <p className="mt-2 rounded-xl bg-primary/10 p-3 text-sm leading-7">
          {t(
            "تشتري من مزارعٍ قريبٍ من أهلك، ويُسلَّم إليهم في موعده. شراءٌ لا استثمار ولا عائد، وتدفع للمزارع مباشرةً كما تتّفقان (تحويلٌ عند التسليم مثلاً). أهلك يستلمون، وأنت تسجّل الاستلام حين يخبرونك.",
            "You buy from a farmer near your family, and it is delivered to them on time. A purchase, not an investment and no return; you pay the farmer directly as you agree (a transfer on delivery, say). Your family receives it, and you record the delivery when they tell you.",
          )}
        </p>
      )}
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "اكتب الشروط كما اتّفقتما. اقتراحك توقيعك عليه، ولا تتغيّر شروطه بعد إرساله؛ وإن أخطأت فاسحبه قبل أن يوقّعه الآخر واقترح غيره.",
          "Write the terms as you agreed them. Proposing is your signature, and the terms cannot change once sent; if you made a mistake, withdraw it before the other side signs and propose another.",
        )}
      </p>
      {typeof sp.error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      {offer && (
        <div className={`${card} mt-6 text-sm`}>
          <p className="font-bold">
            {offer.kind === "buy" ? t("من عرض شراء", "From a notice to buy") : t("من عرض بيع", "From a notice to sell")}:{" "}
            {offer.crop} · {offer.quantity} {en ? OFFER_UNIT_NAME[offer.unit].en : OFFER_UNIT_NAME[offer.unit].ar} · {offer.state}
          </p>
          <p className="mt-1 text-muted">
            {offer.kind === "buy"
              ? t("صاحب العرض هو المشتري، وأنت المزارع. يصله الاقتراح في حسابه.", "The poster is the buyer and you are the farmer. The proposal reaches their account.")
              : t("صاحب العرض هو المزارع، وأنت المشتري. يصله الاقتراح في حسابه.", "The poster is the farmer and you are the buyer. The proposal reaches their account.")}
          </p>
        </div>
      )}

      <form action={proposeForward} className="mt-6 grid gap-4">
        {family && <input type="hidden" name="family" value="1" />}
        {offer || family ? (
          <>
            {offer && <input type="hidden" name="offer_id" value={offer.id} />}
            <input type="hidden" name="side" value={side!} />
            {!offer && (
              <label className={label}>
                {t("رقم جوّال المزارع (له حسابٌ برقمه)", "The farmer's phone number (they have an account under it)")}
                <input name="phone" required inputMode="tel" placeholder="09xxxxxxxx" className={field} />
              </label>
            )}
          </>
        ) : (
          <>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 font-medium">{t("أنت في هذا العقد", "In this contract you are")}</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="side" value="farmer" defaultChecked /> {t("المزارع (البائع)", "The farmer (seller)")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="side" value="buyer" /> {t("المشتري", "The buyer")}
              </label>
            </fieldset>
            <label className={label}>
              {t("رقم جوّال الطرف الآخر (له حسابٌ برقمه)", "The other side's phone number (they have an account under it)")}
              <input name="phone" required inputMode="tel" placeholder="09xxxxxxxx" className={field} />
            </label>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            {t("المحصول", "Crop")}
            <input name="crop" required minLength={2} maxLength={60} list="forward-crops" defaultValue={offer?.crop ?? ""} className={field} />
            <datalist id="forward-crops">
              {OFFER_CROPS.map((c) => (
                <option key={c.ar} value={c.ar}>
                  {en ? c.en : c.ar}
                </option>
              ))}
            </datalist>
          </label>
          <label className={label}>
            {t("الكميّة والوحدة", "Quantity and unit")}
            <span className="flex gap-2">
              <input name="quantity" required inputMode="decimal" defaultValue={offer?.quantity ?? ""} className={field} />
              <select name="unit" defaultValue={offer?.unit ?? "qintar"} className={field}>
                {OFFER_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {en ? OFFER_UNIT_NAME[u].en : OFFER_UNIT_NAME[u].ar}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
        <label className={label}>
          {t("الدرجة المتّفق عليها: النقاوة، الرطوبة، اللون، التعبئة…", "The agreed grade: purity, moisture, colour, packing…")}
          <textarea name="grade" required minLength={5} maxLength={300} rows={2} defaultValue={offer?.grade ?? ""} className={field} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            {t("السعر للوحدة", "Price per unit")}
            <input
              name="price"
              required
              inputMode="decimal"
              defaultValue={offer?.price_sdg ?? offer?.price_usd ?? ""}
              className={field}
            />
          </label>
          <label className={label}>
            {t("العملة", "Currency")}
            <select name="currency" defaultValue={offer && !offer.price_sdg && offer.price_usd ? "USD" : "SDG"} className={field}>
              <option value="SDG">{t("جنيه سوداني", "Sudanese pound")}</option>
              <option value="USD">{t("دولار", "US dollar")}</option>
            </select>
          </label>
          <label className={label}>
            {t("هامش الكميّة ±٪", "Quantity tolerance ±%")}
            <input name="tolerance_percent" inputMode="decimal" defaultValue="5" className={field} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            {t("التسليم من", "Delivery from")}
            <input name="delivery_from" type="date" required min={today} className={field} />
          </label>
          <label className={label}>
            {t("إلى", "to")}
            <input name="delivery_to" type="date" required min={today} className={field} />
          </label>
        </div>
        {side === "buyer" && (
          <fieldset className={`${card} grid gap-3`}>
            <legend className="px-1 text-sm font-bold">
              {t("من يستلم عنك (إن كنت تشتري لأهلك)", "Who receives for you (if you are buying for your family)")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                {t("اسمه", "Name")}
                <input name="consignee_name" required={family} minLength={2} maxLength={120} className={field} />
              </label>
              <label className={label}>
                {t("جوّاله", "Phone")}
                <input name="consignee_phone" required={family} inputMode="tel" maxLength={20} className={field} />
              </label>
            </div>
            <p className="text-xs text-muted">
              {t("يراه المزارع في العقد ليتّصل به عند التسليم، ولا يراه غيره.", "The farmer sees it in the contract to call them at delivery; no one else does.")}
            </p>
          </fieldset>
        )}
        <label className={label}>
          {t("مكان التسليم", "Place of delivery")}
          <input name="delivery_place" required minLength={3} maxLength={200} placeholder={t("مثلاً: مخزن المشتري في القضارف", "e.g. the buyer's store in Gedaref")} className={field} />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className={label}>
            {t("شروط الدفع", "Payment terms")}
            <input
              name="payment_terms"
              required
              minLength={5}
              maxLength={500}
              defaultValue={t("عند التسليم بعد الفحص", "On delivery, after inspection")}
              className={field}
            />
          </label>
          <label className={label}>
            {t("مقدَّمٌ ٪ (اختياريّ)", "Advance % (optional)")}
            <input name="advance_percent" inputMode="decimal" className={field} />
          </label>
        </div>
        {/* الشرط الجزائيّ (قرار المالك، 26 أكتوبر): نسبٌ من قيمة العقد يتّفقان عليها، والقاعدة تحدّ سقفها. */}
        <fieldset className={`${card} grid gap-3`}>
          <legend className="px-1 text-sm font-bold">{t("الشرط الجزائيّ", "Penalty clause")}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>
              {t("غرامة التأخير ٪ لكلّ أسبوع", "Late delivery % per week")}
              <input name="late_pct_week" inputMode="decimal" defaultValue="1" className={field} />
            </label>
            <label className={label}>
              {t("سقف غرامة التأخير ٪", "Late penalty cap %")}
              <input name="late_cap_pct" inputMode="decimal" defaultValue="10" className={field} />
            </label>
            <label className={label}>
              {t("غرامة الإخلال ٪", "Breach penalty %")}
              <input name="breach_pct" inputMode="decimal" defaultValue="10" className={field} />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="force_majeure" defaultChecked className="mt-1" />
            <span>
              {t(
                "تُعفى القوّة القاهرة: حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق.",
                "Force majeure is exempt: war, flood, locusts, or a closed road.",
              )}
            </span>
          </label>
          <p className="text-xs leading-6 text-muted">
            {t(
              "نسبٌ من قيمة العقد: غرامة التأخير حتى ٥٪ أسبوعيّاً وسقفها حتى ٣٠٪، وغرامة الإخلال حتى ٣٠٪ على من يمتنع عن التسليم أو الاستلام. لا تحسبها المنصّة ولا تحصّلها: إن اختلفتما تفصل الإدارة وتكتب المبلغ ومن يدفعه، ويدفعه الطرف للآخر مباشرةً.",
              "Shares of the contract's value: late delivery up to 5% a week, capped at up to 30%, and up to 30% on whoever refuses to deliver or take delivery. The platform neither computes nor collects it: if you disagree, the administration decides and writes the amount and who pays it, and that side pays the other directly.",
            )}
          </p>
        </fieldset>
        {seasons.length > 0 && side !== "buyer" && (
          <label className={label}>
            {t("موسمك الذي يأتي منه المحصول (اختياريّ، للمزارع)", "Your season the crop comes from (optional, for the farmer)")}
            <select name="season_id" defaultValue="" className={field}>
              <option value="">{t("لا أربطه بموسم", "Not linked to a season")}</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          {t("ملاحظات (اختياريّ)", "Notes (optional)")}
          <textarea name="notes" maxLength={1000} rows={2} className={field} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-1" />
          <span>
            {t(
              "قرأت الشروط وأوقّع عليها. أفهم أنّ المنصّة لا تحمل المال ولا تضمن التسليم ولا السداد، وأنّ العقد لا يُلغى بعد توقيع الطرف الآخر إلا باتّفاقنا.",
              "I have read the terms and sign them. I understand that the platform holds no money and guarantees neither delivery nor payment, and that once the other side signs, the contract is cancelled only if we both agree.",
            )}
          </span>
        </label>
        <button className={button}>{t("أرسل الاقتراح", "Send the proposal")}</button>
      </form>
    </div>
  );
}
