import Link from "next/link";
import ActionNotice from "@/components/ActionNotice";
import PageHeader from "@/components/PageHeader";
import MarketTabs from "@/components/market/MarketTabs";
import { tr, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import {
  OFFER_CROPS,
  OFFER_UNIT_NAME,
  isNotYetCreated,
  offerCropName,
  type MarketOffer,
} from "@/lib/marketOffers";
import { money } from "@/lib/marketCrops";
import { SUDAN_STATES, stateName, typed } from "@/lib/nafir";
import { createClient } from "@/lib/supabase/server";
import OfferNotice from "@/components/market/OfferNotice";
import { closeOffer } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "عروض البيع والشراء | سوداقري", "Buy and sell offers | Sudagri"),
    description: tr(
      locale,
      "عروض بيع وشراء المحاصيل بين المزارع والتاجر: المحصول والكمية والمكان ورقم التواصل. المنصّة لا تمسك مالاً ولا تضمن تسليماً.",
      "Crop offers to sell and to buy, between farmers and traders: the crop, quantity, place and a contact number. The platform holds no money and guarantees no delivery.",
    ),
  };
}

const waLink = (o: MarketOffer, locale: Locale) =>
  `https://wa.me/${o.contact_phone}?text=${encodeURIComponent(
    locale === "en"
      ? `Hello, about your offer on Sudagri: ${offerCropName(o.crop, locale)} ${money(o.quantity)} ${OFFER_UNIT_NAME[o.unit].en}`
      : `السلام عليكم، بخصوص عرضك في سوداقري: ${o.crop} ${money(o.quantity)} ${OFFER_UNIT_NAME[o.unit].ar}`,
  )}`;

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ crop?: string; state?: string; kind?: string; ok?: string; error?: string }>;
}) {
  const { crop = "", state = "", kind = "", ok, error: flash } = await searchParams;
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let q = supabase
    .from("market_offers")
    .select("*")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (crop) q = q.eq("crop", crop);
  if ((SUDAN_STATES as readonly string[]).includes(state)) q = q.eq("state", state);
  if (kind === "sell" || kind === "buy") q = q.eq("kind", kind);
  const { data, error } = await q;
  const pending = isNotYetCreated(error);
  if (error && !pending) console.error("market offers: list failed", error);
  const offers = (data ?? []) as MarketOffer[];

  const mine =
    user && !error
      ? (((
          await supabase
            .from("market_offers")
            .select("*")
            .eq("created_by", user.id)
            .order("created_at", { ascending: false })
            .limit(30)
        ).data ?? []) as MarketOffer[])
      : [];

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(en ? "en-GB" : "ar-SD-u-nu-latn", { day: "numeric", month: "short" });
  const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <MarketTabs active="/market/offers" locale={locale} />
      <PageHeader icon="chart" eyebrow={t("السوق والأسعار", "Market and prices")} title={t("عروض البيع والشراء", "Buy and sell offers")}>
        {t(
          "مزارعٌ عنده محصول، وتاجرٌ يبحث عنه: اكتب ما عندك أو ما تطلبه، ومكانك، ورقمك، فيتّصل بك من يهمّه الأمر مباشرة.",
          "A farmer with a crop, a trader looking for one: post what you have or what you want, where you are and your number, and whoever is interested calls you directly.",
        )}
      </PageHeader>

      <ActionNotice ok={ok} error={flash} />

      <OfferNotice locale={locale} />

      {pending ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold">{t("تُفعَّل قريباً", "Opening soon")}</p>
          <p className="mt-2 text-sm text-muted">
            {t(
              "لوحة العروض جاهزة، وتنتظر تفعيلها في قاعدة البيانات. إلى ذلك الحين تابع الأسعار في سوق المحاصيل.",
              "The offers board is built and waiting to be switched on in the database. Until then, follow the prices on the crop market page.",
            )}
          </p>
          <Link href="/market" className="mt-3 inline-block text-primary underline">{t("سوق المحاصيل اليوم", "Crop market today")}</Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <form method="get" className="flex flex-wrap gap-2">
              <select name="kind" defaultValue={kind} className={field} aria-label={t("النوع", "Kind")}>
                <option value="">{t("بيع وشراء", "Sell and buy")}</option>
                <option value="sell">{t("للبيع", "For sale")}</option>
                <option value="buy">{t("مطلوب للشراء", "Wanted")}</option>
              </select>
              <select name="crop" defaultValue={crop} className={field} aria-label={t("المحصول", "Crop")}>
                <option value="">{t("كلّ المحاصيل", "All crops")}</option>
                {OFFER_CROPS.map((c) => (
                  <option key={c.ar} value={c.ar}>{en ? c.en : c.ar}</option>
                ))}
              </select>
              <select name="state" defaultValue={state} className={field} aria-label={t("الولاية", "State")}>
                <option value="">{t("كلّ الولايات", "All states")}</option>
                {SUDAN_STATES.map((s) => (
                  <option key={s} value={s}>{stateName(s, locale)}</option>
                ))}
              </select>
              <button className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-rose hover:text-rose">{t("اعرض", "Show")}</button>
            </form>
            <Link href="/market/offers/new" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
              {t("+ أضف عرضاً", "+ Add an offer")}
            </Link>
          </div>

          <ul className="mt-6 grid gap-3">
            {offers.length === 0 && (
              <li className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
                {error
                  ? t("تعذّرت قراءة العروض الآن. أعد المحاولة بعد قليل.", "The offers could not be read just now. Try again shortly.")
                  : t("لا عروض مفتوحة بهذه الشروط بعد.", "No open offers match yet.")}
              </li>
            )}
            {offers.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${o.kind === "sell" ? "bg-primary/10 text-primary" : "bg-accent/20"}`}>
                    {o.kind === "sell" ? t("للبيع", "For sale") : t("مطلوب", "Wanted")}
                  </span>
                  <span className="font-bold" {...typed(locale)}>{offerCropName(o.crop, locale)}</span>
                  <span dir="ltr">{money(o.quantity)}</span>
                  <span>{en ? OFFER_UNIT_NAME[o.unit].en : OFFER_UNIT_NAME[o.unit].ar}</span>
                </div>
                {o.grade && <p className="mt-1 text-sm text-muted" {...typed(locale)}>{o.grade}</p>}
                <p className="mt-1 text-sm">
                  {stateName(o.state, locale)} — <bdi>{o.locality}</bdi>
                </p>
                {(o.price_sdg || o.price_usd) && (
                  <p className="mt-1 text-sm font-bold">
                    {o.price_sdg && <span dir="ltr">{money(o.price_sdg)} {t("جنيه", "SDG")}</span>}
                    {o.price_sdg && o.price_usd && " · "}
                    {o.price_usd && <span dir="ltr">${money(o.price_usd, 2)}</span>}
                    <span className="font-normal text-muted">
                      {" "}
                      {t(`لل${OFFER_UNIT_NAME[o.unit].ar}`, `per ${OFFER_UNIT_NAME[o.unit].en}`)}
                    </span>
                  </p>
                )}
                {o.notes && <p className="mt-1 text-sm text-muted" {...typed(locale)}>{o.notes}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <a href={`tel:+${o.contact_phone}`} className="rounded-full border border-border px-3 py-1.5 font-bold" dir="ltr">
                    📞 +{o.contact_phone}
                  </a>
                  {o.whatsapp && (
                    <a href={waLink(o, locale)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366]/50 bg-[#25D366]/10 px-3 py-1.5 font-bold text-[#128C7E] dark:text-[#25D366]">
                      {t("واتساب", "WhatsApp")}
                    </a>
                  )}
                  <span className="text-xs text-muted">
                    {t("نُشر", "Posted")} {day(o.created_at)} · {t("ينتهي", "Expires")} {day(o.expires_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {mine.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-bold">{t("عروضي", "My offers")}</h2>
              <ul className="grid gap-2">
                {mine.map((o) => {
                  const live = o.status === "open" && new Date(o.expires_at) > new Date();
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                      <span>
                        {o.kind === "sell" ? t("بيع", "Sell") : t("شراء", "Buy")} · <bdi>{offerCropName(o.crop, locale)}</bdi> ·{" "}
                        <span dir="ltr">{money(o.quantity)}</span> {en ? OFFER_UNIT_NAME[o.unit].en : OFFER_UNIT_NAME[o.unit].ar}
                        <span className="ms-2 text-xs text-muted">
                          {live ? t(`مفتوح حتى ${day(o.expires_at)}`, `open until ${day(o.expires_at)}`) : o.status === "closed" ? t("مغلق", "closed") : t("انتهت مدّته", "expired")}
                        </span>
                      </span>
                      {live && (
                        <form action={closeOffer}>
                          <input type="hidden" name="offer_id" value={o.id} />
                          <button className="rounded-lg border border-border px-3 py-1 text-xs font-bold hover:border-danger">
                            {t("أغلق العرض", "Close the offer")}
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
