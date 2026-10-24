import Link from "next/link";
import { MONTH_NAMES } from "@/lib/agronomy";
import { CROP_INPUTS } from "@/lib/cropInputs";
import { cropName } from "@/lib/farmLabelsEn";
import { FAO29_URL, SALT_LABEL, SOWING, cropsForLand, type CropFit, type LandForFit } from "@/lib/landCrops";
import { tr, type Locale } from "@/lib/i18n";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * «🌱 المحاصيل التي تناسب أرضك» on the owner's land card (البند ١٥٢). Folded:
 * the land card is long already, and the list is for the evening the owner
 * plans a season, not for every visit. Every line says why, and where from.
 */
export default function LandCropFit({ land, locale }: { land: LandForFit; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { fits, noMonth, saline, sodic } = cropsForLand(land);
  if (fits.length === 0) return null;
  const rainfed = land.water_source === "rainfed";
  const declared = land.water_per_feddan && land.water_per_feddan > 0 ? Number(land.water_per_feddan) : null;
  const month = (m: number) => (locale === "en" ? MONTHS_EN[m] : MONTH_NAMES[m]);

  const verdict = (f: CropFit) => {
    if (rainfed) {
      return f.rainShortM3 != null && f.rainShortM3 > 0
        ? t(`يحتاج ريّاً تكميليّاً نحو ${n0(f.rainShortM3)} م³ للفدان بعد متوسّط المطر`, `Needs about ${n0(f.rainShortM3)} m³/feddan of supplementary irrigation after average rain`)
        : t("يكفيه متوسّط المطر في محطّتك", "Your station's average rain covers it");
    }
    if (f.water === "flood") return t(`ماؤك يكفيه بالغمر (${n0(f.floodM3!)} م³ للفدان)`, `Your water covers it by flood (${n0(f.floodM3!)} m³/feddan)`);
    if (f.water === "drip") return t(`يكفيه ماؤك بالتنقيط فقط (${n0(f.dripM3!)} م³؛ بالغمر ${n0(f.floodM3!)})`, `Your water covers it by drip only (${n0(f.dripM3!)} m³; flood ${n0(f.floodM3!)})`);
    if (f.water === "short") return t(`ماؤك لا يكفيه (يحتاج ${n0(f.dripM3!)} م³ بالتنقيط)`, `Your water is short (needs ${n0(f.dripM3!)} m³ by drip)`);
    return t(`يحتاج ${n0(f.floodM3!)} م³ للفدان بالغمر و${n0(f.dripM3!)} بالتنقيط`, `Needs ${n0(f.floodM3!)} m³/feddan by flood, ${n0(f.dripM3!)} by drip`);
  };
  const tone = (f: CropFit) =>
    rainfed
      ? "border-border"
      : f.water === "flood"
        ? "border-leaf/40 bg-leaf/5"
        : f.water === "drip"
          ? "border-primary/30 bg-primary/5"
          : f.water === "short"
            ? "border-border opacity-70"
            : "border-border";

  return (
    <details className="mt-4 rounded-xl border border-leaf/30 bg-leaf/5 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-bold text-leaf">
        🌱 {t("المحاصيل التي تناسب أرضك", "Crops that suit your land")}
      </summary>

      <p className="mt-2 text-xs leading-6 text-muted">
        {rainfed
          ? t(
              "أرضك مطريّة: لكلّ محصول ما يبقى من حاجته بعد متوسّط مطر محطّتك، بطريقة الفاو (FAO-56).",
              "Your land is rain-fed: for each crop, what is left of its need after your station's average rain, by the FAO-56 method.",
            )
          : declared
            ? t(
                `قارنّا حاجة كلّ محصولٍ من الماء في مناخ محطّتك (طريقة الفاو FAO-56) بالماء الذي سجّلته: ${n0(declared)} م³ للفدان.`,
                `We compared each crop's water need in your station's climate (FAO-56) with the water you recorded: ${n0(declared)} m³ per feddan.`,
              )
            : t(
                "لم تسجّل كم يصل أرضك من الماء للفدان، فهذه حاجة كلّ محصولٍ فقط. سجّلها لتعرف ما يكفيه ماؤك.",
                "You have not recorded how much water reaches your land per feddan, so this is each crop's need only. Record it to see what your water covers.",
              )}
      </p>

      {saline && (
        <p className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs leading-6">
          {t(
            "تربة أرضك في خريطة التربة ملحيّة (سولونتشاك)، فرُتّبت المحاصيل بتحمّلها للملوحة أوّلاً. افحص التربة قبل الزراعة: الخريطة لمنطقتك لا لحقلك.",
            "The soil map shows your land as saline (Solonchak), so crops are ordered by salt tolerance first. Test the soil before sowing: the map is of your area, not your field.",
          )}
        </p>
      )}
      {sodic && (
        <p className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs leading-6">
          {t(
            "تربة أرضك في خريطة التربة صوديّة (سولونتز): الصوديوم يسدّ مسامّ التربة فلا يدخلها الماء. افحص التربة والماء قبل أيّ زراعةٍ مرويّة.",
            "The soil map shows your land as sodic (Solonetz): sodium seals the soil so water cannot enter. Test the soil and water before any irrigated crop.",
          )}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {fits.map((f) => {
          const sow = SOWING[f.crop.key];
          const src = CROP_INPUTS[f.crop.key]?.sources?.[0];
          return (
            <li key={f.crop.key} className={`rounded-lg border bg-card px-3 py-2 ${tone(f)}`}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <strong>{cropName(f.crop.key, locale)}</strong>
                {f.wanted && <span className="text-xs font-bold text-primary">★ {t("تريده", "you want it")}</span>}
                {f.grownBefore && <span className="text-xs text-muted">· {t("زرعته هنا من قبل", "grown here before")}</span>}
              </p>
              <p className="mt-0.5">{verdict(f)}</p>
              <p className="mt-0.5 text-xs text-muted">
                {t("الزراعة: ", "Sowing: ")}
                {month(sow.month)} — {locale === "en" ? sow.source.en : sow.source.ar}
                {src && (
                  <>
                    {" · "}
                    <a href={src.url} target="_blank" rel="noopener" className="underline">
                      {t("المصدر", "source")}
                    </a>
                  </>
                )}
                {f.salt && (
                  <>
                    {" · "}
                    {locale === "en" ? SALT_LABEL[f.salt.cls].en : SALT_LABEL[f.salt.cls].ar}
                    {f.salt.ece != null && t(` (حتى ${f.salt.ece} dS/m بلا نقص)`, ` (up to ${f.salt.ece} dS/m with no loss)`)}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      {noMonth.length > 0 && (
        <p className="mt-3 text-xs leading-6 text-muted">
          {t("لم نحسبها لأنّا لم نجد لموعد زراعتها في السودان مصدراً بعد: ", "Not computed — we have not yet found a source for their sowing month in Sudan: ")}
          {noMonth.map((c) => cropName(c.key, locale)).join("، ")}.
        </p>
      )}
      <p className="mt-2 text-xs leading-6 text-muted">
        {t("التحمّل للملوحة من ", "Salt tolerance from ")}
        <a href={FAO29_URL} target="_blank" rel="noopener" className="underline">
          {t("دليل الفاو ٢٩ لجودة مياه الريّ (الجدولان ٤ و٥)", "FAO Irrigation and Drainage Paper 29 (Tables 4 and 5)")}
        </a>
        {t(
          "؛ وملوحة أرضك نفسها لا نعرفها حتى تُفحص. والتفاصيل في ",
          "; your own land's salinity is unknown until it is tested. Details in ",
        )}
        <Link href="/tools/water" className="underline">
          {t("حاسبة الماء", "the water calculator")}
        </Link>
        .
      </p>
    </details>
  );
}
