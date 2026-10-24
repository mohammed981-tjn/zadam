import {
  CROPS,
  IRRIGATION_LABEL,
  waterRequirement,
  type IrrigationMethod,
} from "@/lib/agronomy";
import { SOWING } from "@/lib/landCrops";
import {
  ROUTE_CLIMATE,
  END_CELL_RAINFALL,
  CORRIDOR_RAINFALL_MM,
  SCENARIO_CROP_PLAN,
} from "@/lib/arcCanal";
import { IRRIGATION_EN, cropName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

/**
 * What the corridor actually needs, run through the platform's own FAO-56
 * engine — the same one behind /tools/water and /tools/feasibility.
 *
 * The number this section exists to produce is the water the scheme demands at
 * each irrigation method, because everything downstream is a function of it:
 * the canal's discharge, its cross-section, the pumping capacity, and most of
 * the capital. Choosing drip over flood removes 39% of the demand, and that one
 * choice is worth more than any other decision on this page.
 */

const METHODS: IrrigationMethod[] = ["flood", "sprinkler", "pivot", "drip"];

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const crop = (key: string) => CROPS.find((c) => c.key === key)!;

/** Weighted demand for the assumed crop mix, per feddan. */
function planDemand(method: IrrigationMethod): number {
  return SCENARIO_CROP_PLAN.reduce(
    (sum, p) =>
      sum +
      waterRequirement(crop(p.cropKey), ROUTE_CLIMATE, p.plantingMonth, method)
        .m3PerFeddan *
        p.share,
    0,
  );
}

export default function ArcCanalWater({ locale = "ar" }: { locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const method = (m: IrrigationMethod) => (en ? IRRIGATION_EN[m] : IRRIGATION_LABEL[m]);
  const perFeddan = Object.fromEntries(
    METHODS.map((m) => [m, planDemand(m)]),
  ) as Record<IrrigationMethod, number>;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">
          {t("مناخ الممرّ، واحتياجه المائي بـFAO-56", "The corridor's climate, and its water need by FAO-56")}
        </h2>
        <p className="leading-relaxed text-muted">
          {t(
            "المناخ من NASA POWER عند المسار، والاحتياج محسوب بمحرّك FAO-56 نفسه الذي تعمل به حاسبة المياه في المنصّة — لا منقولاً عن دراسة.",
            "The climate is from NASA POWER at the route, and the need is computed with the same FAO-56 engine behind the platform's water calculator — not copied from a study.",
          )}
        </p>
      </div>

      {/* The resolution limit, stated before any number that rests on it. */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-2 font-semibold">
          {t(
            "مناخٌ واحد للمسار كلّه — وهذا ما تسمح به البيانات، لا اختصارٌ منّا",
            "One climate for the whole route — what the data allows, not a shortcut of ours",
          )}
        </h3>
        {en ? (
          <p className="leading-relaxed">
            We wanted a climate for each of the five segments. So we asked NASA POWER at the midpoint of each, and{" "}
            <strong>four of them came back byte-for-byte identical</strong>. The reason is that the MERRA-2 grid is
            half a degree of latitude by 0.625 of longitude — about <strong>55×67 km</strong> —{" "}
            <strong>and the whole canal sits inside a single pixel</strong>.
          </p>
        ) : (
          <p className="leading-relaxed">
            أردنا مناخاً لكل قطاع من الخمسة. فسألنا NASA POWER عند منتصف كل قطاع،
            فعادت <strong>أربعة منها متطابقة حرفياً</strong>. والسبب أن شبكة
            MERRA-2 نصف درجة عرض في ٠٫٦٢٥ درجة طول — أي نحو <strong>٥٥×٦٧
            كم</strong> — <strong>والقناة كلّها تقع داخل البكسل الواحد</strong>.
          </p>
        )}
        <div className="my-3 grid gap-2 sm:grid-cols-3">
          {[
            [END_CELL_RAINFALL.south, t("الطرف الجنوبي", "Southern end"), t("خليّة مجاورة", "Neighbouring cell")],
            [CORRIDOR_RAINFALL_MM, t("الممرّ الغربي كلّه", "The whole western corridor"), t("خليّة واحدة", "One cell")],
            [END_CELL_RAINFALL.north, t("الطرف الشمالي", "Northern end"), t("خليّة مجاورة", "Neighbouring cell")],
          ].map(([mm, where, note]) => (
            <div
              key={where as string}
              className="rounded-lg bg-background px-3 py-2 text-center"
            >
              <div className="text-lg font-bold">
                {mm} {t("ملم", "mm")}
              </div>
              <div className="text-xs">{where}</div>
              <div className="text-xs text-muted">{note}</div>
            </div>
          ))}
        </div>
        {en ? (
          <p className="leading-relaxed">
            The two readings at the ends <strong>are not a rainfall gradient</strong> but two different cells: two
            points on the same river 60 km apart, with nothing in the terrain between them to explain rain halving.
            Publishing five segment climates would have invented a precision the source does not have —{" "}
            <strong>and four of them would be the same numbers under different headings</strong>.
          </p>
        ) : (
          <p className="leading-relaxed">
            والقراءتان عند الطرفين <strong>ليستا تدرّجاً مطرياً</strong> بل خليّتين
            مختلفتين: نقطتان على النهر نفسه تفصلهما ٦٠ كم، ولا شيء في التضاريس
            بينهما يفسّر انخفاض المطر إلى النصف. فنشرُ خمسة مناخات للقطاعات كان
            سيخترع دقّةً لا يملكها المصدر — <strong>وأربعة منها الأرقام نفسها تحت
            عناوين مختلفة</strong>.
          </p>
        )}
      </div>

      {/* Demand per crop. */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">
          {en
            ? `What a feddan needs in this climate (${n0(CORRIDOR_RAINFALL_MM)} mm of rain a year)`
            : `كم يحتاج الفدان في هذا المناخ (${n0(CORRIDOR_RAINFALL_MM)} ملم مطراً سنوياً)`}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[30rem] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-3 text-start font-normal">{t("المحصول", "Crop")}</th>
                {METHODS.map((m) => (
                  <th key={m} className="p-3 text-start font-normal">
                    {method(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CROPS.map((c) => {
                // The scenario's month where it plants the crop; else the cited Sudanese sowing
                // month (landCrops.ts) — a winter crop must not be costed in July (backlog 156).
                const month =
                  SCENARIO_CROP_PLAN.find((p) => p.cropKey === c.key)
                    ?.plantingMonth ??
                  SOWING[c.key]?.month ??
                  6;
                return (
                  <tr key={c.key} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">{cropName(c, locale)}</td>
                    {METHODS.map((m) => (
                      <td key={m} className="p-3">
                        {n0(
                          waterRequirement(c, ROUTE_CLIMATE, month, m)
                            .m3PerFeddan,
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          {t(
            "بالمتر المكعّب للفدان للموسم الواحد، بشهر الزراعة المعتاد لكل محصول.",
            "Cubic metres per feddan per season, at each crop's usual planting month.",
          )}
        </p>
      </div>

      {/* The comparison the section exists for. */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h3 className="mb-3 font-semibold">
          {t("وعلى خليط المحاصيل المفترض، لنصف مليون فدان", "And for the assumed crop mix, over half a million feddan")}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 text-start font-normal">{t("طريقة الري", "Irrigation method")}</th>
                <th className="py-2 text-start font-normal">{t("م³ للفدان", "m³ per feddan")}</th>
                <th className="py-2 text-start font-normal">{t("الإجمالي", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map((m) => (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{method(m)}</td>
                  <td className="py-2">{n0(perFeddan[m])}</td>
                  <td className="py-2 font-bold">
                    {(perFeddan[m] * 500_000) / 1e9 < 10
                      ? ((perFeddan[m] * 500_000) / 1e9).toFixed(2)
                      : "—"}{" "}
                    {t("مليار م³", "billion m³")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 leading-relaxed">
          <strong>
            {t(
              "الفرق بين الغمر والتنقيط هو أهمّ قرار على هذه الصفحة.",
              "The choice between flood and drip is the most important decision on this page.",
            )}
          </strong>{" "}
          {en
            ? `It cuts demand from ${((perFeddan.flood * 500_000) / 1e9).toFixed(2)} to ${((perFeddan.drip * 500_000) / 1e9).toFixed(2)} billion m³ — ${Math.round((1 - perFeddan.drip / perFeddan.flood) * 100)}% — and with it the canal, the pumping stations, the solar array and the whole cost shrink by the same share, as the design section below shows.`
            : `فهو يخفض الطلب من ${((perFeddan.flood * 500_000) / 1e9).toFixed(2)} إلى ${((perFeddan.drip * 500_000) / 1e9).toFixed(2)} مليار م³ — أي ${Math.round((1 - perFeddan.drip / perFeddan.flood) * 100)}٪ — ومعه تصغُر القناة والمحطّات والمصفوفة الشمسية والكلفة كلّها بالنسبة نفسها، كما في قسم التصميم أدناه.`}
        </p>
        <p className="mt-2 leading-relaxed">
          {en ? (
            <>
              <strong>For the proposed core:</strong> twenty thousand feddan under drip need about{" "}
              <strong>{n0((perFeddan.drip * 20_000) / 1e6)} million m³</strong> — one twenty-fifth of what the
              project asks at its stated size, and with no need for a sovereign decision on a water allocation.
            </>
          ) : (
            <>
              <strong>وللنواة المقترحة:</strong> عشرون ألف فدان بالتنقيط تحتاج نحو{" "}
              <strong>{n0((perFeddan.drip * 20_000) / 1e6)} مليون م³</strong> — أي
              واحداً من كل خمسة وعشرين ممّا يطلبه المشروع بحجمه المعلن، وبلا حاجة
              إلى قرار سيادي بحصة.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
