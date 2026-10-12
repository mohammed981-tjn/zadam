import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import { DELIVERY_STATUS, dateLabel, isNotDeployed, lbl, num, usd, type Carrier, type Delivery } from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field } from "@/components/supply/SupplyShell";
import PhotoField from "@/components/supply/PhotoField";
import GpsField from "@/components/supply/GpsField";
import IssueCode from "@/components/supply/IssueCode";
import { StatesList } from "@/components/supply/Explainers";
import { cancelDelivery, confirmDelivery, markDeliveryPaid, saveCarrier } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "التوصيل إلى الأرض | سوداقري", "Delivery to the farm | Sudagri"),
    description: tr(
      locale,
      "ناقلون محلّيون موثّقون، وإثبات تسليمٍ بالصورة والموقع ورمزٍ يعطيه المزارع للسائق. لا يُدفع للناقل قبل الرمز.",
      "Verified local carriers, and proof of delivery by photo, location and a code the farmer gives the driver. The carrier is not paid before the code.",
    ),
  };
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let carrier: Carrier | null = null;
  let deliveries: Delivery[] = [];
  let notDeployed = false;
  if (user) {
    const [{ data: c, error: cErr }, { data: d }] = await Promise.all([
      supabase.from("carriers").select("*").eq("owner_id", user.id).maybeSingle(),
      supabase.from("deliveries").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    notDeployed = isNotDeployed(cErr);
    carrier = c as Carrier | null;
    deliveries = (d ?? []) as Delivery[];
  }
  const toMe = deliveries.filter((d) => d.recipient_id === user?.id && d.status !== "cancelled");
  const mineToCarry = carrier ? deliveries.filter((d) => d.carrier_id === carrier.id && d.status !== "cancelled") : [];
  const assigned = deliveries.filter((d) => d.assigned_by === user?.id);

  return (
    <SupplyShell active="/suppliers/deliveries" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("التوصيل إلى الأرض", "Delivery to the farm")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "المنصّة لا تملك شاحنات — تجربة Twiga في كينيا علّمت أنّ الأسطول المملوك يُغرق صاحبه. التوصيل بناقلين محلّيين يوثّقهم المشرف، والتسليم لا يُثبت إلا بثلاثة أشياء معاً:",
          "The platform owns no trucks — Twiga in Kenya showed that an owned fleet sinks its owner. Delivery is by local carriers an administrator verifies, and a handover is proven only by three things together:",
        )}
      </p>
      <ol className={`${card} mt-4 grid gap-3 text-sm sm:grid-cols-3`}>
        <li>
          <p className="font-bold">{t("١. صورة", "1. A photo")}</p>
          <p className="text-muted">{t("يلتقطها السائق للبضاعة في مكان التسليم.", "The driver photographs the goods at the handover point.")}</p>
        </li>
        <li>
          <p className="font-bold">{t("٢. الموقع", "2. The location")}</p>
          <p className="text-muted">{t("من هاتف السائق لحظة التسليم.", "From the driver’s phone at the moment of handover.")}</p>
        </li>
        <li>
          <p className="font-bold">{t("٣. رمز المزارع", "3. The farmer’s code")}</p>
          <p className="text-muted">
            {t(
              "ستّة أرقامٍ يراها المستلم وحده في صفحته، ويعطيها للسائق بعد أن يرى بضاعته. يُقفل بعد خمس محاولاتٍ خاطئة.",
              "Six digits only the recipient sees on their page, given to the driver after seeing the goods. It locks after five wrong tries.",
            )}
          </p>
        </li>
      </ol>
      <p className="mt-3 text-sm">
        {t(
          "حين يطابق الرمز يصير التوصيل «مستحقّ الدفع» للناقل. ومن أسند التوصيل يدفع له خارج المنصّة ويسجّل رقم التحويل.",
          "When the code matches, the delivery becomes “payable” to the carrier. Whoever assigned it pays them outside the platform and records the transfer reference.",
        )}
      </p>

      {!user ? (
        <p className={`${card} mt-6 text-sm`}>
          <Link href="/login" className="font-medium text-primary underline">
            {t("سجّل الدخول", "Sign in")}
          </Link>{" "}
          {t("لترى توصيلاتك أو لتسجّل ناقلاً.", "to see your deliveries or register as a carrier.")}
        </p>
      ) : notDeployed ? (
        <div className="mt-6">
          <ComingSoon />
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-bold">{t("توصيلاتٌ إليك", "Deliveries to you")}</h2>
          {toMe.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              {t("لا توصيل إليك الآن. حين يُسند منظّم طلبك توصيلاً إلى أرضك يظهر هنا مع زرّ رمز الاستلام.", "No delivery to you now. When your order’s organiser assigns one to your farm it appears here with the handover-code button.")}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {toMe.map((d) => (
                <li key={d.id} className={card}>
                  <DeliveryHead d={d} locale={locale} />
                  {d.status === "assigned" ? (
                    <div className="mt-3">
                      <IssueCode deliveryId={d.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {mineToCarry.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-bold">{t("توصيلاتٌ أُسندت إليك ناقلاً", "Deliveries assigned to you as carrier")}</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {mineToCarry.map((d) => (
                  <li key={d.id} className={card}>
                    <DeliveryHead d={d} locale={locale} />
                    {d.status === "assigned" && (
                      <form action={confirmDelivery} className="mt-3 flex flex-col gap-3">
                        <input type="hidden" name="delivery_id" value={d.id} />
                        <PhotoField name="photo_path" folder="deliveries" required label={t("صوّر البضاعة في مكان التسليم", "Photograph the goods at the handover point")} />
                        <GpsField required label={t("موقع التسليم", "Handover location")} />
                        <label className="flex flex-col gap-1 text-sm">
                          {t("رمز المستلم (٦ أرقام)", "Recipient’s code (6 digits)")}
                          <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9٠-٩]{6}" maxLength={6} className={`${field} figure max-w-[12rem] text-center text-lg tracking-[0.3em]`} dir="ltr" />
                        </label>
                        <button className={`${button} self-start`}>{t("أكّد التسليم", "Confirm handover")}</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {assigned.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-bold">{t("توصيلاتٌ أسندتَها", "Deliveries you assigned")}</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {assigned.map((d) => (
                  <li key={d.id} className={card}>
                    <DeliveryHead d={d} locale={locale} />
                    {d.status === "confirmed" && (
                      <form action={markDeliveryPaid} className="mt-3 flex flex-wrap gap-2">
                        <input type="hidden" name="delivery_id" value={d.id} />
                        <input name="reference" required minLength={4} maxLength={60} className="w-44 rounded-lg border border-border bg-background px-2 py-2 text-sm" placeholder={t("رقم تحويل الأجرة", "Fee transfer ref.")} dir="ltr" />
                        <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{t("دفعتُ للناقل", "I paid the carrier")}</button>
                      </form>
                    )}
                    {d.status === "assigned" && (
                      <form action={cancelDelivery} className="mt-2">
                        <input type="hidden" name="delivery_id" value={d.id} />
                        <button className="text-xs text-danger underline">{t("ألغِ هذا التوصيل", "Cancel this delivery")}</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
            <h2 className="text-lg font-bold">{carrier ? t("بياناتك ناقلاً", "Your carrier details") : t("أنا ناقل — سجّلني", "I am a carrier — register me")}</h2>
            {carrier && (
              <p className="mt-1 text-sm">
                {carrier.verified_at ? (
                  <span className="text-primary">{t(`✓ موثّق منذ ${dateLabel(carrier.verified_at, locale)}`, `✓ Verified since ${dateLabel(carrier.verified_at, locale)}`)}</span>
                ) : (
                  <span className="text-accent">{t("بانتظار مراجعة المشرف", "Awaiting administrator review")}</span>
                )}
                {carrier.review_note && (
                  <>
                    {" · "}
                    <bdi>{carrier.review_note}</bdi>
                  </>
                )}
                {carrier.states.length > 0 && (
                  <>
                    {" · "}
                    <StatesList states={carrier.states} locale={locale} />
                  </>
                )}
              </p>
            )}
            <form action={saveCarrier} className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="name" required minLength={2} maxLength={80} defaultValue={carrier?.name} className={field} placeholder={t("اسمك أو اسم شركة الترحيل", "Your name or the transport company’s")} aria-label={t("الاسم", "Name")} />
                <input name="phone" required inputMode="tel" defaultValue={carrier?.phone} className={field} placeholder={t("الهاتف", "Phone")} aria-label={t("الهاتف", "Phone")} dir="ltr" />
                <input name="vehicle" required minLength={2} maxLength={80} defaultValue={carrier?.vehicle} className={field} placeholder={t("المركبة: دفّار ٧ طن، لوري، بوكس", "Vehicle: 7 t truck, lorry, pickup")} aria-label={t("المركبة", "Vehicle")} />
                <input name="capacity_tonnes" type="number" required min={0.1} max={100} step="0.1" defaultValue={carrier?.capacity_tonnes} className={field} placeholder={t("الحمولة بالطن", "Capacity in tonnes")} aria-label={t("الحمولة بالطن", "Capacity in tonnes")} />
              </div>
              <details className="text-sm" open={!carrier}>
                <summary className="cursor-pointer">{t("الولايات التي تعمل فيها", "States you work in")}</summary>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SUDAN_STATES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5">
                      <input type="checkbox" name="states" value={s} defaultChecked={carrier?.states.includes(s)} className="size-4" />
                      {stateName(s, locale)}
                    </label>
                  ))}
                </div>
              </details>
              <p className="text-xs text-muted">
                {t("تغيير الاسم أو المركبة بعد التوثيق يعيدك إلى المراجعة.", "Changing the name or vehicle after verification sends you back for review.")}
              </p>
              <button className={`${button} self-start`}>{t("احفظ", "Save")}</button>
            </form>
          </section>
        </>
      )}
    </SupplyShell>
  );
}

function DeliveryHead({ d, locale }: { d: Delivery; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {d.kind === "to_farm" ? t("إلى الأرض:", "To the farm:") : t("إلى نقطة الاستلام:", "To the pickup point:")} <bdi>{d.destination}</bdi>
        </span>
        <span className={`text-xs ${d.status === "assigned" ? "text-accent" : "text-primary"}`}>{lbl(DELIVERY_STATUS[d.status], locale)}</span>
      </div>
      <p className="figure text-xs text-muted">
        <Link href={`/suppliers/orders/${d.order_id}`} className="text-primary underline">
          {t("الطلب", "The order")}
        </Link>
        {d.fee_usd !== null && <> · {t("الأجرة", "Fee")} {usd(d.fee_usd, locale)}</>}
        {d.confirmed_at && <> · {t(`سُلّم ${dateLabel(d.confirmed_at, locale)}`, `Delivered ${dateLabel(d.confirmed_at, locale)}`)}</>}
        {d.gps_lat !== null && d.gps_lng !== null && (
          <>
            {" · "}
            <a href={`https://www.google.com/maps?q=${d.gps_lat},${d.gps_lng}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {num(d.gps_lat, locale, 4)}, {num(d.gps_lng, locale, 4)}
            </a>
          </>
        )}
        {d.paid_ref && <> · {t("دُفع:", "Paid:")} <bdi>{d.paid_ref}</bdi></>}
      </p>
    </>
  );
}
