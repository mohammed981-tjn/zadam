import { tr, type Locale } from "@/lib/i18n";
import { M3_PER_MM_FEDDAN, WAPOR_LAYER_URL, fetchLandWater } from "@/lib/wapor";

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PART_AR = ["", "العشرة الأولى من", "العشرة الثانية من", "آخر"];
const PART_EN = ["", "1–10", "11–20", "21–end"];

function dekadLabel(dekad: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-D([123])$/.exec(dekad);
  if (!m) return dekad;
  const month = Number(m[2]) - 1;
  const part = Number(m[3]);
  return locale === "en" ? `${PART_EN[part]} ${EN_MONTHS[month]}` : `${PART_AR[part]} ${AR_MONTHS[month]}`;
}

/**
 * «ماء أرضك من الأقمار الصناعيّة» — what FAO's WaPOR measured leaving this
 * land, every ten days. A server component streamed inside <Suspense>, so a
 * slow read never holds up the page.
 */
export default async function LandWater({
  lat,
  lng,
  feddans,
  locale,
}: {
  lat: number;
  lng: number;
  feddans: number;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const rows = await fetchLandWater(lat, lng);
  const n1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

  return (
    <div className="mt-4 rounded-xl bg-background p-3 text-sm">
      <p className="font-semibold">{t("ماء أرضك من الأقمار الصناعيّة — الفاو", "Your land's water from satellites — FAO")}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{t("لم تُقرأ بيانات الفاو لهذا الموقع الآن. أعد فتح الصفحة لاحقاً.", "FAO's data for this location could not be read just now. Reopen the page later.")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {t(
              "ما خرج من الأرض فعلاً كلّ عشرة أيّام: نتح المحصول وتبخّر التربة معاً، كما قاسته أقمار الفاو. حين يرتفع والمحصول قائم فهو يشرب؛ وحين يقترب من الصفر فالأرض بور أو عطشى.",
              "What actually left the land every ten days: the crop's transpiration and the soil's evaporation together, as FAO's satellites measured it. When it is high with a crop standing, the crop is drinking; near zero, the land is bare or dry.",
            )}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-start font-medium">{t("الفترة", "Period")}</th>
                  <th className="py-1 text-start font-medium">{t("مم في اليوم", "mm per day")}</th>
                  <th className="py-1 text-start font-medium">{t("م³ للفدان", "m³ per feddan")}</th>
                  <th className="py-1 text-start font-medium">{t(`للأرض كلّها (${n1(feddans)} فدان)`, `Whole land (${n1(feddans)} feddans)`)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dekad} className="border-t border-border">
                    <td className="py-1">{dekadLabel(r.dekad, locale)}</td>
                    <td className="py-1 font-bold" dir="ltr">{n1(r.mmPerDay)}</td>
                    <td className="py-1" dir="ltr">{n0(r.m3PerFeddan)}</td>
                    <td className="py-1" dir="ltr">{n0(r.m3PerFeddan * feddans)} m³</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">
            {t(
              `الحساب: مم في اليوم × أيّام الفترة × ${M3_PER_MM_FEDDAN} (المليمتر على فدانٍ مساحته ٤٢٠٠ م² = ${M3_PER_MM_FEDDAN} م³). كلّ قراءةٍ لمربّع ٣٠٠ متر حول موقع الأرض، أي نحو ٢١ فداناً، فقد تدخل فيها أرض الجيران إن كانت أرضك أصغر.`,
              `Worked out as mm per day × days × ${M3_PER_MM_FEDDAN} (a millimetre over a 4,200 m² feddan is ${M3_PER_MM_FEDDAN} m³). Each reading is a 300-metre square around the land's location — about 21 feddans — so a smaller land shares it with its neighbours.`,
            )}{" "}
            <a href={WAPOR_LAYER_URL} target="_blank" rel="noopener noreferrer" className="underline">
              FAO WaPOR
            </a>
          </p>
        </>
      )}
    </div>
  );
}
