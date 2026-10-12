import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import PriceAlert from "@/components/market/PriceAlert";
import Sparkline from "@/components/market/Sparkline";
import { ageInDays, readFxReference } from "@/lib/fxRates";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import {
  CROP_NAME,
  FEWS_SOURCE_URL,
  MARKET_STALE_DAYS,
  UNIT_NAME,
  cropName,
  fetchFewsPrices,
  latest,
  money,
  readMarketPrices,
  seriesKey,
  type PriceSeries,
} from "@/lib/marketPrices";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "سوق المحاصيل اليوم | سوداقري", "Crop market today | Sudagri"),
    description: tr(
      locale,
      "أسعار السمسم والذرة والدخن والصمغ العربي والفول والكركدي في بورصتي القضارف والأبيض، بالقنطار والأردب، بالجنيه والدولار، كلُّ رقمٍ بتاريخه ومصدره.",
      "Sesame, sorghum, millet, gum arabic, groundnut and hibiscus prices at the Gedaref and El Obeid bourses, per qintar and ardeb, in pounds and dollars, each figure with its date and source.",
    ),
  };
}

/** Cards in the order a farmer looks for them: the cash crop first, then the staples, then the west's crops. */
const CROP_ORDER = ["sesame", "feterita", "millet", "tabat", "sesame_red", "gum_hashab", "groundnut", "hibiscus"];

export default async function MarketPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const data = readMarketPrices();
  const fx = readFxReference();
  const fews = await fetchFewsPrices();
  const usdRate = fx?.bank.sell ?? null;
  // The warehouse-receipt study, when it lands, is linked from here; until then the idea is stated without a dead link.
  const bourseStudy = existsSync(join(process.cwd(), "content/studies/bourse-ar.md"));

  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(en ? "en-GB" : "ar-SD-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });

  const byCrop = new Map<string, PriceSeries[]>();
  for (const s of data?.series ?? []) byCrop.set(s.crop, [...(byCrop.get(s.crop) ?? []), s]);
  const crops = [...byCrop.keys()].sort((a, b) => {
    const ia = CROP_ORDER.indexOf(a), ib = CROP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const per = (s: PriceSeries) => (en ? `per ${UNIT_NAME[s.unit].en}` : `لل${UNIT_NAME[s.unit].ar.slice(2)}`);

  const row = (s: PriceSeries) => {
    const m = data!.markets[s.market];
    const { last, change, changePct } = latest(s);
    const age = ageInDays(last.date);
    const stale = age > MARKET_STALE_DAYS;
    const label = `${cropName(s.crop, locale)} — ${en ? m.name_en : m.name_ar}`;
    return (
      <li key={s.market} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold">{en ? m.name_en : m.name_ar}</div>
            <div className="mt-0.5 text-2xl font-black" dir="ltr">
              {money(last.price)} <span className="text-sm font-bold">{t("جنيه", "SDG")}</span>
            </div>
            <div className="text-xs text-muted">
              {per(s)}
              {usdRate && (
                <>
                  {" · "}
                  <span dir="ltr">≈ ${money(last.price / usdRate, 2)}</span>
                  {t(" بسعر البنك اليوم", " at today's bank rate")}
                </>
              )}
            </div>
          </div>
          <Sparkline points={s.history.slice(-12)} label={t(`تاريخ سعر ${label}`, `Price history of ${label}`)} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {change !== null && (
            <span className={change > 0 ? "font-bold text-primary" : change < 0 ? "font-bold text-danger" : "text-muted"}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "＝"}{" "}
              <span dir="ltr">
                {change > 0 ? "+" : ""}
                {money(change)} ({changePct! > 0 ? "+" : ""}
                {money(changePct!, 1)}%)
              </span>{" "}
              <span className="font-normal text-muted">{t("عن الرقم السابق", "vs. the figure before")}</span>
            </span>
          )}
          {last.arrivals !== undefined && (
            <span className="text-muted">
              {t("الوارد", "Arrivals")}: <span dir="ltr">{money(last.arrivals)}</span> {t("جوال", "sacks")}
              {(s.crop === "feterita" || s.crop === "tabat") && t(" (الذرة كلّها)", " (all sorghum)")}
            </span>
          )}
        </div>

        <div className={`text-xs ${stale ? "font-bold text-danger" : "text-muted"}`}>
          {t("بتاريخ", "As of")} {day(last.date)}
          {stale && t(` — مضى ${age} يوماً، فتحقّق قبل أن تبيع أو تشتري عليه`, ` — ${age} days old, check before you trade on it`)}
          {" · "}
          <a href={last.source} className="underline" target="_blank" rel="noopener noreferrer">
            {t("المصدر", "Source")}
          </a>
          {last.note && <span className="font-normal text-muted"> · <span lang="en" dir="ltr">{last.note}</span></span>}
        </div>

        <PriceAlert
          id={seriesKey(s)}
          label={label}
          unit={per(s)}
          price={last.price}
          date={last.date}
          locale={locale}
        />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("سوق المحاصيل اليوم", "Crop market today")}</h1>
      <p className="mb-4 mt-2 text-sm leading-relaxed text-muted">
        {t(
          "آخر ما نُشر من أسعار بورصتي القضارف والأبيض: بالوحدة التي يُباع بها المحصول هناك، بالجنيه وبما يقابله بالدولار، مع الوارد والتغيّر وتاريخ كلّ رقمٍ ومصدره.",
          "The latest published prices from the Gedaref and El Obeid bourses: in the unit each crop is sold by there, in pounds and their dollar equivalent, with arrivals, the change, and each figure's date and source.",
        )}
      </p>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href="/market/offers" className="rounded-full border border-primary bg-primary/10 px-4 py-2 font-bold text-primary">
          {t("عروض البيع والشراء ←", "Buy and sell offers →")}
        </Link>
        <Link href="/rates" className="rounded-full border border-border px-4 py-2">
          {t("أسعار العملات", "Exchange rates")}
        </Link>
      </div>

      <div className="mb-6 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-relaxed">
        {t(
          "البورصتان لا تنشران نشرةً على الإنترنت؛ تصل أرقامهما في أخبار وكالة السودان للأنباء (سونا) والصحف، وأحياناً تغيب أسابيع. لذلك نكتب تاريخ كلّ رقم، ونعلّمه بالأحمر إذا مضى عليه أكثر من ثلاثة أيام. لا نقدّر رقماً لم نجده.",
          "Neither bourse publishes a bulletin online; their figures reach the public in SUNA wire stories and newspapers, and sometimes not for weeks. So every figure carries its date, and turns red when it is more than three days old. We never estimate a figure we did not find.",
        )}
      </div>

      {data === null || crops.length === 0 ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6 text-sm">
          {t("تعذّرت قراءة الأسعار الآن.", "The prices could not be read just now.")}
        </div>
      ) : (
        <div className="grid gap-4">
          {crops.map((crop) => {
            const series = byCrop.get(crop)!;
            const shareText = en
              ? `${CROP_NAME[crop]?.en ?? crop}: ${series.map((s) => `${data.markets[s.market].name_en} ${money(latest(s).last.price)} SDG ${per(s)} (${latest(s).last.date})`).join(" · ")} — Sudagri`
              : `${CROP_NAME[crop]?.ar ?? crop}: ${series.map((s) => `${data.markets[s.market].name_ar} ${money(latest(s).last.price)} جنيه ${per(s)} (${latest(s).last.date})`).join(" · ")} — سوداقري`;
            return (
              <section key={crop} id={crop} className="scroll-mt-20 rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-3 text-lg font-bold">{cropName(crop, locale)}</h2>
                <ul className="flex flex-col gap-3">{series.map(row)}</ul>
                <div className="mt-4">
                  <ShareWhatsApp text={shareText} path={`/market#${crop}`} locale={locale} />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">{t("مرجعٌ شهري: أسعار التجزئة في أسواق أخرى", "Monthly reference: retail prices in other markets")}</h2>
        <p className="mb-3 text-sm text-muted">
          {t(
            "من شبكة الإنذار المبكر بالمجاعة (FEWS NET): متوسّط شهري لأسعار الذرة والدخن بالتجزئة. هو مرجعٌ للاتجاه، لا سعر بورصة اليوم.",
            "From the Famine Early Warning Systems Network (FEWS NET): monthly average retail prices of sorghum and millet. A reference for the trend, not today's bourse price.",
          )}
        </p>
        {fews === null ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
            {t("تعذّر الوصول إلى بيانات FEWS NET الآن.", "FEWS NET's data could not be reached just now.")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("السوق", "Market")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("السلعة", "Product")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("السعر (جنيه)", "Price (SDG)")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("الشهر", "Month")}</th>
                </tr>
              </thead>
              <tbody>
                {fews.map((f) => (
                  <tr key={`${f.market}|${f.product}|${f.unit}`} className="border-t border-border">
                    <td className="px-3 py-2" lang="en" dir="ltr">{f.market}</td>
                    <td className="px-3 py-2" lang="en" dir="ltr">
                      {f.product} {f.unit && <span className="text-muted">/ {f.unit}</span>}
                    </td>
                    <td className="px-3 py-2 font-bold" dir="ltr">
                      {money(f.value)}
                      {f.prev !== null && (
                        <span className={`ms-1 text-xs ${f.value >= f.prev ? "text-primary" : "text-danger"}`}>
                          {f.value >= f.prev ? "▲" : "▼"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted" dir="ltr">{f.date.slice(0, 7)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          <a href={FEWS_SOURCE_URL} className="underline" target="_blank" rel="noopener noreferrer">FEWS NET — Sudan</a>
        </p>
      </section>

      <section className="mt-10 flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">{t("الوحدات", "Units")}</h2>
        <p>{t(UNIT_NAME.qintar.noteAr, UNIT_NAME.qintar.noteEn)} {t(UNIT_NAME.ardeb.noteAr, UNIT_NAME.ardeb.noteEn)}</p>
        <p>
          {fx
            ? t(
                `الدولار بسعر ${fx.bank.name_ar} اليوم (${money(fx.bank.sell, 2)} جنيه، بتاريخ ${day(fx.bank.date)}) — لا بسعر يوم الرقم نفسه؛ فهو للمقارنة لا للمحاسبة.`,
                `Dollars at the ${fx.bank.name_en}'s rate today (${money(fx.bank.sell, 2)} SDG, as of ${day(fx.bank.date)}) — not the rate on the figure's own day, so it is for comparison, not accounting.`,
              )
            : t("تعذّرت قراءة سعر الصرف، فلا يظهر الدولار.", "The exchange rate could not be read, so dollars are not shown.")}{" "}
          <Link href="/rates" className="text-primary underline">{t("أسعار العملات", "Exchange rates")}</Link>
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
        <h2 className="mb-2 text-base font-bold">{t("ما بعد الأسعار: إيصالات المخازن", "Beyond prices: warehouse receipts")}</h2>
        <p className="text-muted">
          {t(
            "السعر وحده لا يحمي المزارع الذي يبيع ساعة الحصاد بأدنى سعر لأنه يحتاج النقد. الخطوة التالية التي ندرسها: أن يودع محصوله مخزناً معتمداً ويأخذ إيصالاً يُرهن أو يُباع في بورصة الولاية للسلع، فيبيع حين يشاء لا حين يُضطرّ.",
            "A price alone does not protect the farmer who sells at harvest at the lowest price because he needs cash. The next step we are studying: depositing the crop in a certified warehouse for a receipt that can be pledged or sold on the state commodities bourse, so he sells when he chooses, not when he must.",
          )}
          {bourseStudy && (
            <>
              {" "}
              <Link href="/studies/bourse" className="text-primary underline">{t("الدراسة", "The study")}</Link>
            </>
          )}
        </p>
      </section>

      <div className="mt-6">
        <ShareWhatsApp text={t("سوق المحاصيل اليوم: القضارف والأبيض — سوداقري", "Crop market today: Gedaref and El Obeid — Sudagri")} path="/market" locale={locale} />
      </div>
    </div>
  );
}
