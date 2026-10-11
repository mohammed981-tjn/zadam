import {
  designCanal,
  PILOT_REACH,
  TEXTURE_LABEL,
  SEEPAGE_RATE,
  BED_SLOPE,
  SIDE_SLOPE,
  MANNING_N,
  PUMP_EFFICIENCY,
  OPERATING_HOURS_PER_DAY,
  LIFT_PER_STATION_M,
  EXCAVATION_USD_PER_M3,
  PUMPING_USD_PER_KW,
  PV_USD_PER_KWP,
  DISCOUNT_RATE,
  ECONOMIC_LIFE_YEARS,
} from "@/lib/canalDesign";
import {
  SOIL_POINTS,
  SOIL_SUMMARY,
  SOIL_SAMPLES_REQUESTED,
  ROUTE_TEXTURE,
  IRRADIANCE_ANNUAL,
  GROUND_FETCHED_AT,
} from "@/lib/canalGround";
import { tr, type Locale } from "@/lib/i18n";

/**
 * التربة والتصميم — البنود التي كانت «غير معروفة» وصارت محسوبة.
 *
 * The dossier used to list the soil, the design discharge, the cross-section,
 * the pump staging, the seepage and the power source as unknown. Six blanks in
 * a row is a fair description of the paperwork and a poor description of what
 * can be known: the soil is published at 250 m, the irradiance is published
 * daily, and everything else follows from those two plus the water requirement
 * and the elevations this platform already measured.
 *
 * So this section answers them. It leads with the soil because the soil decides
 * the seepage, the seepage decides the discharge, the discharge decides the
 * section and the power, and the power decides most of the capital. One
 * measurement, and the rest is arithmetic that can be checked.
 */

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const n1 = (v: number) => v.toFixed(1);

const clay = SOIL_SUMMARY.clay;
const sand = SOIL_SUMMARY.sand;

const SCHEMES = [
  { label: "نصف مليون فدان — غمر", en: "Half a million feddan — flood", area: 500_000, method: "flood" as const, reach: undefined },
  { label: "نصف مليون فدان — تنقيط", en: "Half a million feddan — drip", area: 500_000, method: "drip" as const, reach: undefined },
  { label: "النواة: ٢٠ ألف فدان — تنقيط", en: "The core: 20,000 feddan — drip", area: 20_000, method: "drip" as const, reach: PILOT_REACH },
];

export default function ArcCanalDesign({ locale = "ar" }: { locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const texture = (k: string) => (en ? k : TEXTURE_LABEL[k]);
  const m = t("م", "m");
  const designs = SCHEMES.map((s) => ({
    ...s,
    d: designCanal(s.area, s.method, clay, sand, IRRADIANCE_ANNUAL, s.reach),
  }));

  const full = designs[0].d;
  const pilot = designs[2].d;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t("التربة والتصميم الهندسي", "Soil and engineering design")}</h2>
        <p className="leading-relaxed text-muted">
          {t(
            "التربة مقيسة من ISRIC SoilGrids على ٢٥٠ متراً، والإشعاع الشمسي من NASA POWER. والباقي محسوبٌ منهما: التسرّب بالقوام، والتصرّف بالطلب، والمقطع بمعادلة مانينغ، والقدرة بـρgQH، والكلفة بالكميّات.",
            "The soil is measured from ISRIC SoilGrids at 250 m, and solar irradiance from NASA POWER. The rest is computed from those two: seepage from the texture, discharge from the demand, the cross-section by Manning's equation, power by ρgQH, and cost from quantities.",
          )}
        </p>
      </div>

      {/* Soil. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">
          {en
            ? `Soil along the route — ${SOIL_POINTS.length} points`
            : `التربة على طول المسار — ${SOIL_POINTS.length} نقطة`}
        </h3>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [`${n0(clay)}${t("٪", "%")}`, t("طين", "Clay"), `${n0(SOIL_SUMMARY.clayMin)}–${n0(SOIL_SUMMARY.clayMax)}${t("٪", "%")}`],
            [`${n0(sand)}${t("٪", "%")}`, t("رمل", "Sand"), t("في المتر العلوي", "in the top metre")],
            [
              `${n1(SOIL_SUMMARY.ph)}`,
              t("درجة الحموضة", "pH"),
              `${n1(SOIL_SUMMARY.phMin)}–${n1(SOIL_SUMMARY.phMax)}`,
            ],
            [`${n0(SOIL_SUMMARY.cec)}`, t("السعة التبادلية", "Cation exchange capacity"), t("سنتيمول/كغ", "cmol/kg")],
          ].map(([big, label, note]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-card p-3 text-center"
            >
              <div className="text-xl font-bold">{big}</div>
              <div className="text-sm font-medium">{label}</div>
              <div className="mt-1 text-xs text-muted">{note}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 leading-relaxed">
          {en ? (
            <>
              <p>
                The prevailing texture is <strong>{texture(ROUTE_TEXTURE)}</strong>, heavy enough to hold water: its
                standard seepage rate is{" "}
                <strong>{SEEPAGE_RATE[ROUTE_TEXTURE]} m³ per square metre per day</strong> of wetted perimeter — half
                what a sandy loam loses.
              </p>
              <p className="mt-3">
                The surface is lighter than the depth: clay rises from about 25% in the first five centimetres to{" "}
                {n0(SOIL_SUMMARY.clayMax)}% at one metre. That works in the project&apos;s favour — a canal nine metres
                deep is dug into the heavy layer, not the sandy one.
              </p>
              <p className="mt-3">
                <strong>
                  But a pH of {n1(SOIL_SUMMARY.phMin)}–{n1(SOIL_SUMMARY.phMax)} is a real constraint on farming.
                </strong>{" "}
                Above 8.3, phosphorus, iron and zinc become scarcely available however much is added — the range of
                calcareous or sodic soils. SoilGrids says nothing about exchangeable sodium, the test that decides
                whether the land needs gypsum and drainage before anything else — a simple field test, with no
                substitute.
              </p>
            </>
          ) : (
            <>
              <p>
                القوام الغالب <strong>{TEXTURE_LABEL[ROUTE_TEXTURE]}</strong>، وهو
                ثقيلٌ بما يكفي لأن يحتفظ بالماء: معدّل التسرّب المعياري له{" "}
                <strong>{SEEPAGE_RATE[ROUTE_TEXTURE]} م³ لكل متر مربّع يومياً</strong>{" "}
                من المحيط المبلول — أي نصف ما تفقده تربة طميية رملية.
              </p>
              <p className="mt-3">
                والسطح أخفّ من العمق: الطين يرتفع من نحو ٢٥٪ في الخمسة سنتيمترات
                الأولى إلى {n0(SOIL_SUMMARY.clayMax)}٪ في المتر. وهذا في صالح
                المشروع — قناةٌ بعمق تسعة أمتار تُحفر في الطبقة الثقيلة لا في
                الرملية.
              </p>
              <p className="mt-3">
                <strong>لكن درجة الحموضة {n1(SOIL_SUMMARY.phMin)}–
                {n1(SOIL_SUMMARY.phMax)} قيدٌ زراعي حقيقي.</strong> فوق ٨٫٣ يصير
                الفوسفور والحديد والزنك شحيحة الإتاحة مهما أُضيفت، وهذا نطاق التربة
                الكلسية أو الصودية. ولا يقول SoilGrids شيئاً عن الصوديوم المتبادل،
                وهو الفحص الذي يقرّر إن كانت الأرض تحتاج جبساً وصرفاً قبل أي شيء —
                فحصٌ حقلي بسيط، ولا بديل عنه.
              </p>
            </>
          )}
        </div>

        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("القياسات نقطةً نقطة", "The measurements point by point")}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2 text-start font-normal">{t("كم", "km")}</th>
                  <th className="p-2 text-start font-normal">{t("طين٪", "Clay %")}</th>
                  <th className="p-2 text-start font-normal">{t("رمل٪", "Sand %")}</th>
                  <th className="p-2 text-start font-normal">{t("طمي٪", "Silt %")}</th>
                  <th className="p-2 text-start font-normal">{t("حموضة", "pH")}</th>
                  <th className="p-2 text-start font-normal">{t("القوام", "Texture")}</th>
                </tr>
              </thead>
              <tbody>
                {SOIL_POINTS.map((p) => (
                  <tr
                    key={p.chainageKm}
                    className="border-b border-border last:border-0"
                  >
                    <td className="p-2">{p.chainageKm}</td>
                    <td className="p-2">{n0(p.clay)}</td>
                    <td className="p-2">{n0(p.sand)}</td>
                    <td className="p-2">{n0(p.silt)}</td>
                    <td className="p-2">{n1(p.ph)}</td>
                    <td className="p-2">{texture(p.texture)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {en
              ? `${SOIL_SAMPLES_REQUESTED} points were requested and ${SOIL_POINTS.length} came back. The point at kilometre zero lies on the reservoir lake, and there is no soil profile under water — so its absence is a correct reading, not missing data. Values are averages weighted by layer thickness over the top metre, fetched on ${GROUND_FETCHED_AT}.`
              : `طُلبت ${SOIL_SAMPLES_REQUESTED} نقطة وعادت ${SOIL_POINTS.length}. النقطة عند الكيلومتر صفر تقع على بحيرة الخزان، ولا قطاع تربة تحت الماء — فغيابها قراءةٌ صحيحة لا نقصٌ في البيانات. القيم متوسّطات مرجّحة بسُمك الطبقات على المتر العلوي، جُلبت في ${GROUND_FETCHED_AT}.`}
          </p>
        </details>
      </div>

      {/* The design. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t("القناة التي يتطلّبها هذا الطلب", "The canal this demand requires")}</h3>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[38rem] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-3 text-start font-normal">{t("البند", "Item")}</th>
                {designs.map((s) => (
                  <th key={s.label} className="p-3 text-start font-normal">
                    {en ? s.en : s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t("طول المجرى", "Channel length"), (d: typeof full) => `${n0(d.lengthKm)} ${t("كم", "km")}`],
                  [t("التصرّف التصميمي", "Design discharge"), (d: typeof full) => `${n1(d.designQ)} ${t("م³/ث", "m³/s")}`],
                  [t("عمق الماء", "Water depth"), (d: typeof full) => `${n1(d.depthM)} ${m}`],
                  [t("عرض القاع", "Bed width"), (d: typeof full) => `${n1(d.bottomWidthM)} ${m}`],
                  [t("العرض العلوي", "Top width"), (d: typeof full) => `${n1(d.topWidthM)} ${m}`],
                  [
                    t("السرعة", "Velocity"),
                    (d: typeof full) =>
                      `${d.velocityMS.toFixed(2)} ${t("م/ث", "m/s")}${d.velocityOk ? "" : " ⚠"}`,
                  ],
                  [
                    t("التسرّب السنوي", "Annual seepage"),
                    (d: typeof full) =>
                      en
                        ? `${n0(d.seepageMm3PerYear)} million m³ (${n0(d.seepageShare * 100)}%)`
                        : `${n0(d.seepageMm3PerYear)} مليون م³ (${n0(d.seepageShare * 100)}٪)`,
                  ],
                  [t("الرفع الكلّي", "Total lift"), (d: typeof full) => `${n1(d.totalHeadM)} ${m}`],
                  [t("محطات الرفع", "Pumping stations"), (d: typeof full) => `${d.stations}`],
                  [t("القدرة المركّبة", "Installed power"), (d: typeof full) => `${n0(d.peakPowerMW)} ${t("ميغاواط", "MW")}`],
                  [t("الطاقة السنوية", "Annual energy"), (d: typeof full) => `${n0(d.annualEnergyGWh)} ${t("ج.و.س", "GWh")}`],
                  [
                    t("المصفوفة الشمسية", "Solar array"),
                    (d: typeof full) =>
                      d.pvMwp === null ? "—" : `${n1(d.pvMwp)} ${t("ميغاواط ذروة", "MWp")}`,
                  ],
                  [t("حجم الحفر", "Excavation volume"), (d: typeof full) => `${n1(d.earthworkMm3)} ${t("مليون م³", "million m³")}`],
                  [
                    t("الكلفة الرأسمالية", "Capital cost"),
                    (d: typeof full) => `${n0(d.capexLowM)}–${n0(d.capexHighM)} ${t("مليون $", "million $")}`,
                  ],
                  [
                    t("كلفة ثابتة للفدان/سنة", "Fixed cost per feddan/year"),
                    (d: typeof full) =>
                      `${n0(d.fixedCostPerFeddanLow)}–${n0(d.fixedCostPerFeddanHigh)} $`,
                  ],
                ] as [string, (d: typeof full) => string][]
              ).map(([label, fn]) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{label}</td>
                  {designs.map((s) => (
                    <td key={s.label} className="p-3">
                      {fn(s.d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* What the table means. */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h3 className="mb-2 font-semibold">{t("ما الذي يقوله هذا الجدول", "What this table says")}</h3>
        {en ? (
          <>
            <p className="leading-relaxed">
              The full canal under flood is a channel{" "}
              <strong>
                {n1(full.depthM)} m deep and {n1(full.topWidthM)} m wide
              </strong>{" "}
              running for ninety-four kilometres — that is{" "}
              <strong>{n1(full.earthworkMm3)} million cubic metres of excavation</strong> before any structure,
              crossing or lining. And four pumping stations with{" "}
              <strong>{n0(full.peakPowerMW)} MW</strong> of capacity: a figure on the scale of a mid-sized power
              station, which is what makes the energy source a sovereign question rather than an engineering one.
            </p>
            <p className="mt-3 leading-relaxed">
              Drip instead of flood cuts all of that by about a third — excavation to{" "}
              {n1(designs[1].d.earthworkMm3)} million m³, power to {n0(designs[1].d.peakPowerMW)} MW, and cost to{" "}
              {n0(designs[1].d.capexLowM)}–{n0(designs[1].d.capexHighM)} million dollars.
            </p>
            <p className="mt-3 leading-relaxed">
              <strong>The core is a different project altogether</strong>: a canal along the southern twelve
              kilometres, <strong>{n1(pilot.depthM)} m</strong> deep, one pumping station of{" "}
              {n1(pilot.peakPowerMW)} MW, and a solar array of{" "}
              <strong>{n1(pilot.pvMwp ?? 0)} MWp</strong> that covers the whole year&apos;s pumping. It needs no
              decision on the national grid and no sovereign allocation — it needs a farm, a pump and the sun.
            </p>
            <p className="mt-3 leading-relaxed">
              The fixed cost of water at the core is{" "}
              <strong>
                {n0(pilot.fixedCostPerFeddanLow)}–{n0(pilot.fixedCostPerFeddanHigh)} dollars per feddan a year
              </strong>{" "}
              against {n0(full.fixedCostPerFeddanLow)}–{n0(full.fixedCostPerFeddanHigh)} at full size under flood.
              That is the difference between land you can plant with sorghum and land you can only justify planting
              with the highest-value crops.
            </p>
          </>
        ) : (
          <>
        <p className="leading-relaxed">
          القناة الكاملة بالغمر مجرى{" "}
          <strong>عمقه {n1(full.depthM)} م وعرضه {n1(full.topWidthM)} م</strong>{" "}
          يجري لأربعة وتسعين كيلومتراً — أي{" "}
          <strong>{n1(full.earthworkMm3)} مليون متر مكعّب حفراً</strong> قبل أي
          منشأ أو معبر أو بطانة. وأربع محطات رفع بقدرة{" "}
          <strong>{n0(full.peakPowerMW)} ميغاواط</strong>: هذا رقمٌ من مرتبة
          محطة كهرباء متوسّطة، وهو الذي يجعل مصدر الطاقة سؤالاً سيادياً لا
          سؤالاً هندسياً.
        </p>
        <p className="mt-3 leading-relaxed">
          والتنقيط بدل الغمر يخفض ذلك كلّه بنحو الثلث — الحفر إلى{" "}
          {n1(designs[1].d.earthworkMm3)} مليون م³، والقدرة إلى{" "}
          {n0(designs[1].d.peakPowerMW)} ميغاواط، والكلفة إلى{" "}
          {n0(designs[1].d.capexLowM)}–{n0(designs[1].d.capexHighM)} مليون
          دولار.
        </p>
        <p className="mt-3 leading-relaxed">
          <strong>أمّا النواة فمشروعٌ آخر تماماً</strong>: قناة على الاثني عشر
          كيلومتراً الجنوبية بعمق <strong>{n1(pilot.depthM)} م</strong>، ومحطة
          رفع واحدة قدرتها {n1(pilot.peakPowerMW)} ميغاواط، ومصفوفة شمسية{" "}
          <strong>{n1(pilot.pvMwp ?? 0)} ميغاواط ذروة</strong> تغطّي ضخّ السنة
          كلّها. أي أنها لا تحتاج قراراً في الشبكة القومية ولا حصةً سيادية —
          تحتاج مزرعةً ومضخّةً وشمساً.
        </p>
        <p className="mt-3 leading-relaxed">
          والكلفة الثابتة للماء عند النواة{" "}
          <strong>{n0(pilot.fixedCostPerFeddanLow)}–
          {n0(pilot.fixedCostPerFeddanHigh)} دولاراً للفدان سنوياً</strong>{" "}
          مقابل {n0(full.fixedCostPerFeddanLow)}–{n0(full.fixedCostPerFeddanHigh)}{" "}
          عند الحجم الكامل بالغمر. وهذا هو الفرق بين أرضٍ تزرعها بالذرة وأرضٍ لا
          يجوز أن تزرعها إلا بأعلى المحاصيل قيمةً.
        </p>
          </>
        )}
      </div>

      {/* Assumptions, in one place. */}
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {t("الاختيارات التصميمية وأسعار الوحدة — كلّها هنا", "Design choices and unit rates — all of them here")}
        </summary>
        {en ? (
          <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted">
            <li>
              Bed slope {BED_SLOPE * 1000} cm/km, side slope {SIDE_SLOPE}:1, bed width twice the depth, and Manning&apos;s
              n {MANNING_N} (unlined earth canal). The core gets a steeper slope, because velocity drops with discharge.
            </li>
            <li>
              Operation {OPERATING_HOURS_PER_DAY} hours a day — not twenty-four, since a canal with no spare capacity
              cannot make up for any stoppage.
            </li>
            <li>
              Pump and motor efficiency {PUMP_EFFICIENCY * 100}%, and each station lifts {LIFT_PER_STATION_M} metres.
            </li>
            <li>
              Excavation {EXCAVATION_USD_PER_M3.low}–{EXCAVATION_USD_PER_M3.high} $/m³, pumping{" "}
              {PUMPING_USD_PER_KW.low}–{PUMPING_USD_PER_KW.high} $ per installed kW, and solar {PV_USD_PER_KWP.low}–
              {PV_USD_PER_KWP.high} $ per kWp.
            </li>
            <li>
              Annual cost by capital recovery factor at {DISCOUNT_RATE * 100}% over {ECONOMIC_LIFE_YEARS} years.
            </li>
            <li>
              <strong>The excavation volume is a minimum</strong>: it counts the prism alone, with no spoil haulage,
              embankments, structures, crossings or lining. So the cost above is a floor, not an estimate.
            </li>
          </ul>
        ) : (
        <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted">
          <li>
            ميل القاع {BED_SLOPE * 1000} سم/كم، وميل الجوانب {SIDE_SLOPE}:١،
            وعرض القاع ضِعف العمق، ومعامل مانينغ {MANNING_N} (قناة ترابية غير
            مبطّنة). وللنواة ميلٌ أشدّ، لأن السرعة تهبط مع التصرّف.
          </li>
          <li>
            التشغيل {OPERATING_HOURS_PER_DAY} ساعة يومياً — لا أربعاً وعشرين،
            فقناةٌ لا فائض فيها لا تعوّض أي توقّف.
          </li>
          <li>
            كفاءة المضخّة والمحرّك {PUMP_EFFICIENCY * 100}٪، وكل محطة ترفع{" "}
            {LIFT_PER_STATION_M} متراً.
          </li>
          <li>
            الحفر {EXCAVATION_USD_PER_M3.low}–{EXCAVATION_USD_PER_M3.high}{" "}
            دولار/م³، والضخّ {PUMPING_USD_PER_KW.low}–{PUMPING_USD_PER_KW.high}{" "}
            دولار/كيلوواط مركّب، والشمسي {PV_USD_PER_KWP.low}–
            {PV_USD_PER_KWP.high} دولار/كيلوواط ذروة.
          </li>
          <li>
            الكلفة السنوية بمعامل استرداد رأس المال عند {DISCOUNT_RATE * 100}٪
            على {ECONOMIC_LIFE_YEARS} سنة.
          </li>
          <li>
            <strong>وحجم الحفر حدٌّ أدنى</strong>: يحسب المنشور وحده، بلا نقل
            مخلّفات ولا سدود جانبية ولا منشآت ولا معابر ولا بطانة. فالكلفة أعلاه
            أرضيةٌ لا تقدير.
          </li>
        </ul>
        )}
      </details>
    </section>
  );
}
