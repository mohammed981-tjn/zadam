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
  { label: "نصف مليون فدان — غمر", area: 500_000, method: "flood" as const, reach: undefined },
  { label: "نصف مليون فدان — تنقيط", area: 500_000, method: "drip" as const, reach: undefined },
  { label: "النواة: ٢٠ ألف فدان — تنقيط", area: 20_000, method: "drip" as const, reach: PILOT_REACH },
];

export default function ArcCanalDesign() {
  const designs = SCHEMES.map((s) => ({
    ...s,
    d: designCanal(s.area, s.method, clay, sand, IRRADIANCE_ANNUAL, s.reach),
  }));

  const full = designs[0].d;
  const pilot = designs[2].d;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">التربة والتصميم الهندسي</h2>
        <p className="leading-relaxed text-muted">
          التربة مقيسة من ISRIC SoilGrids على ٢٥٠ متراً، والإشعاع الشمسي من
          NASA POWER. والباقي محسوبٌ منهما: التسرّب بالقوام، والتصرّف بالطلب،
          والمقطع بمعادلة مانينغ، والقدرة بـρgQH، والكلفة بالكميّات.
        </p>
      </div>

      {/* Soil. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">
          التربة على طول المسار — {SOIL_POINTS.length} نقطة
        </h3>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [`${n0(clay)}٪`, "طين", `${n0(SOIL_SUMMARY.clayMin)}–${n0(SOIL_SUMMARY.clayMax)}٪`],
            [`${n0(sand)}٪`, "رمل", "في المتر العلوي"],
            [
              `${n1(SOIL_SUMMARY.ph)}`,
              "درجة الحموضة",
              `${n1(SOIL_SUMMARY.phMin)}–${n1(SOIL_SUMMARY.phMax)}`,
            ],
            [`${n0(SOIL_SUMMARY.cec)}`, "السعة التبادلية", "سنتيمول/كغ"],
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
        </div>

        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            القياسات نقطةً نقطة
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2 text-start font-normal">كم</th>
                  <th className="p-2 text-start font-normal">طين٪</th>
                  <th className="p-2 text-start font-normal">رمل٪</th>
                  <th className="p-2 text-start font-normal">طمي٪</th>
                  <th className="p-2 text-start font-normal">حموضة</th>
                  <th className="p-2 text-start font-normal">القوام</th>
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
                    <td className="p-2">{TEXTURE_LABEL[p.texture]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            طُلبت {SOIL_SAMPLES_REQUESTED} نقطة وعادت {SOIL_POINTS.length}.
            النقطة عند الكيلومتر صفر تقع على بحيرة الخزان، ولا قطاع تربة تحت
            الماء — فغيابها قراءةٌ صحيحة لا نقصٌ في البيانات. القيم متوسّطات
            مرجّحة بسُمك الطبقات على المتر العلوي، جُلبت في {GROUND_FETCHED_AT}.
          </p>
        </details>
      </div>

      {/* The design. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">القناة التي يتطلّبها هذا الطلب</h3>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[38rem] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="p-3 text-start font-normal">البند</th>
                {designs.map((s) => (
                  <th key={s.label} className="p-3 text-start font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["طول المجرى", (d: typeof full) => `${n0(d.lengthKm)} كم`],
                  ["التصرّف التصميمي", (d: typeof full) => `${n1(d.designQ)} م³/ث`],
                  ["عمق الماء", (d: typeof full) => `${n1(d.depthM)} م`],
                  ["عرض القاع", (d: typeof full) => `${n1(d.bottomWidthM)} م`],
                  ["العرض العلوي", (d: typeof full) => `${n1(d.topWidthM)} م`],
                  [
                    "السرعة",
                    (d: typeof full) =>
                      `${d.velocityMS.toFixed(2)} م/ث${d.velocityOk ? "" : " ⚠"}`,
                  ],
                  [
                    "التسرّب السنوي",
                    (d: typeof full) =>
                      `${n0(d.seepageMm3PerYear)} مليون م³ (${n0(d.seepageShare * 100)}٪)`,
                  ],
                  ["الرفع الكلّي", (d: typeof full) => `${n1(d.totalHeadM)} م`],
                  ["محطات الرفع", (d: typeof full) => `${d.stations}`],
                  ["القدرة المركّبة", (d: typeof full) => `${n0(d.peakPowerMW)} ميغاواط`],
                  ["الطاقة السنوية", (d: typeof full) => `${n0(d.annualEnergyGWh)} ج.و.س`],
                  [
                    "المصفوفة الشمسية",
                    (d: typeof full) =>
                      d.pvMwp === null ? "—" : `${n1(d.pvMwp)} ميغاواط ذروة`,
                  ],
                  ["حجم الحفر", (d: typeof full) => `${n1(d.earthworkMm3)} مليون م³`],
                  [
                    "الكلفة الرأسمالية",
                    (d: typeof full) => `${n0(d.capexLowM)}–${n0(d.capexHighM)} مليون $`,
                  ],
                  [
                    "كلفة ثابتة للفدان/سنة",
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
        <h3 className="mb-2 font-semibold">ما الذي يقوله هذا الجدول</h3>
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
      </div>

      {/* Assumptions, in one place. */}
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          الاختيارات التصميمية وأسعار الوحدة — كلّها هنا
        </summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pr-5 text-sm leading-relaxed text-muted">
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
      </details>
    </section>
  );
}
