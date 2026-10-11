/**
 * الأهمية الاقتصادية — أرقام منشورة تُسند قرار الاستثمار.
 *
 * The platform can already tell a farmer what a season needs. It could not tell
 * an investor why the sector is worth entering, and "الاستثمار الزراعي مهم" is
 * not an argument — it is a slogan with no source behind it.
 *
 * Every figure here carries the publication it came from and the year, for the
 * same reason agronomy.ts derives water instead of asserting it: a number
 * nobody can check is a number nobody should act on. Where a range is published
 * the range is kept rather than averaged into false precision.
 *
 * WHAT IS NOT HERE
 *
 * No projected returns, no yields per feddan for Sudan, no cost tables. Those
 * depend on inputs, prices and a season the platform cannot see, and inventing
 * them would turn a reference into a sales brochure. What is here is the size
 * and shape of the sector, and the size of the losses that services on this
 * platform exist to prevent.
 */

export interface EconomicFact {
  key: string;
  /** One sentence a non-specialist can act on. */
  headline: string;
  /** The detail, including the range where the source gives one. */
  detail: string;
  headlineEn: string;
  detailEn: string;
  source: string;
  year: string;
  /** Which part of the platform this fact bears on. */
  bearsOn: "livestock" | "postharvest" | "risk";
}

export const ECONOMIC_FACTS: EconomicFact[] = [
  /* ── الثروة الحيوانية ─────────────────────────────────────────────── */
  {
    key: "sheep_export_value",
    headline: "صادرات السودان من الضأن واللحوم تتجاوز ٤٠٠ مليون دولار سنوياً",
    detail:
      "وتضاعفت ثلاث مرات أو أكثر منذ عام ٢٠٠٠، وتوفّر دخلاً لأعداد كبيرة من الرعاة بينهم ذوو الدخل المحدود. هذا هو القطاع الوحيد في المنصّة الذي له سوق تصديري قائم فعلاً لا محتمَل.",
    headlineEn: "Sudan's exports of sheep and meat exceed US$400 million a year",
    detailEn:
      "They have tripled or more since 2000, and they provide income to large numbers of herders, many of them on low incomes. This is the only sector on the platform with an export market that already exists rather than one that might.",
    source: "SPARC — Impacts of disruptions to livestock marketing in Sudan",
    year: "2024",
    bearsOn: "livestock",
  },
  {
    key: "desert_sheep_share",
    headline: "ضأن الصحراء يشكّل أكثر من ٦٠٪ من ضأن السودان و~١٠٠٪ من صادراته",
    detail:
      "والحمري من شمال كردفان أشهر طرزه. السوق السعودي يفضّل لحم الضأن من الطرز الصحراوية تحديداً — أي أن السلالة نفسها هي الميزة التصديرية، لا العدد.",
    headlineEn: "Desert sheep make up over 60% of Sudan's sheep and ~100% of its sheep exports",
    detailEn:
      "The Hamari of North Kordofan is the best-known type. The Saudi market prefers mutton from the desert types in particular — the breed itself is the export advantage, not the numbers.",
    source: "FAO — Sudan desert sheep: origin, ecology and production potential",
    year: "1990s, still cited",
    bearsOn: "livestock",
  },
  {
    key: "hajj_demand",
    headline: "الطلب يقفز موسمياً مع الحج",
    detail:
      "موسم الحج يتطلّب حيواناً حيّاً للأضحية، فترتفع قيمة الثروة الحيوانية في نافذة زمنية معروفة سلفاً. دورة تسمين تُخطَّط لتنتهي قبل الموسم تبيع في أعلى نقطة سعرية في السنة — وهذا ما يجعل تواريخ الدورة قراراً مالياً لا تنظيمياً.",
    headlineEn: "Demand jumps every year with the Hajj",
    detailEn:
      "The Hajj season needs live animals for sacrifice, so livestock values rise in a time window known in advance. A fattening cycle planned to finish before the season sells at the highest price point of the year — which makes the cycle's dates a financial decision, not an administrative one.",
    source: "FAO / Sudan livestock marketing literature",
    year: "—",
    bearsOn: "livestock",
  },

  /* ── ما بعد الحصاد ────────────────────────────────────────────────── */
  {
    key: "postharvest_loss_value",
    headline: "أفريقيا جنوب الصحراء تفقد حبوباً بقيمة ~٤ مليارات دولار سنوياً",
    detail:
      "والفاقد يُقدَّر بين ٢٠٪ و٤٠٪ من المحصول، ويفقد صغار المزارعين أكثر من ٣٠٪ من حبوبهم. هذا فاقد بعد أن دُفعت كل تكاليف الإنتاج — أي أنه خسارة صافية على محصول مكتمل.",
    headlineEn: "Sub-Saharan Africa loses grain worth ~US$4 billion a year",
    detailEn:
      "Losses are estimated at 20% to 40% of the crop, and smallholders lose more than 30% of their grain. This loss comes after every cost of production has been paid — a net loss on a finished crop.",
    source: "World Bank, cited in FAO postharvest literature",
    year: "2023–2025",
    bearsOn: "postharvest",
  },
  {
    key: "hermetic_storage_effect",
    headline: "التخزين المحكم يخفض الفاقد من أكثر من ٣٠٪ إلى أقل من ٢٪",
    detail:
      "أكياس التخزين المحكمة والصوامع المعدنية تقنيات مثبتة، وبلغ خفض الفاقد في التخزين المحكم جيداً حتى ٩٨٪. هذه أعلى نسبة عائد إلى تكلفة في القائمة كلها: لا تحتاج بذرة أفضل ولا فداناً إضافياً، بل منع خسارة محصول قائم.",
    headlineEn: "Hermetic storage cuts losses from over 30% to under 2%",
    detailEn:
      "Hermetic storage bags and metal silos are proven technologies, and well-sealed storage has cut losses by up to 98%. This is the highest return on cost on the whole list: it needs no better seed and no extra feddan, only stopping the loss of a crop already grown.",
    source:
      "Frontiers in Sustainable Food Systems — hermetic bags for maize storage",
    year: "2022–2025",
    bearsOn: "postharvest",
  },

  /* ── المخاطر ──────────────────────────────────────────────────────── */
  {
    key: "locust_consumption",
    headline: "سرب جراد بمساحة كيلومتر مربع يأكل في يوم ما يأكله ٣٥ ألف إنسان",
    detail:
      "الكيلومتر المربع الواحد يحوي حتى ٨٠ مليون حشرة بالغة، والجراد الصحراوي أشد آفة مهاجرة في العالم تدميراً. سرب واحد يمرّ على مشروع يمحو موسماً كاملاً في أيام — ولهذا الاستجابة للجراد خدمة طارئة لا مرحلة مجدوَلة.",
    headlineEn: "A one-square-kilometre locust swarm eats in a day what 35,000 people eat",
    detailEn:
      "A single square kilometre holds up to 80 million adult insects, and the desert locust is the most destructive migratory pest in the world. One swarm passing over a project wipes out a whole season in days — which is why locust response is an emergency service, not a scheduled phase.",
    source: "FAO — Desert Locust programme",
    year: "2020–2025",
    bearsOn: "risk",
  },
  {
    key: "locust_regional_damage",
    headline: "أضرار الجراد في شرق أفريقيا واليمن بلغت ٨٫٥ مليار دولار في ٢٠٢٠",
    detail:
      "وقدّر برنامج الأغذية العالمي أن تكاليف الاستجابة والتعافي طويلة الأمد قد تتجاوز مليار دولار إن لم تُضبط الأسراب. الرقم يوضّح لماذا تكلفة المكافحة الوقائية بند استثماري لا مصروف تشغيلي.",
    headlineEn: "Locust damage in East Africa and Yemen reached US$8.5 billion in 2020",
    detailEn:
      "The World Food Programme estimated that response and long-term recovery costs could exceed US$1 billion if the swarms were not controlled. The figure shows why preventive control is an investment, not an operating expense.",
    source: "World Bank Group — Desert Locust response",
    year: "2020",
    bearsOn: "risk",
  },
];

export function factsFor(area: EconomicFact["bearsOn"]): EconomicFact[] {
  return ECONOMIC_FACTS.filter((f) => f.bearsOn === area);
}

/**
 * What a stated loss rate costs a given harvest.
 *
 * Deliberately takes the loss rate as an argument rather than baking in a
 * constant. The published range is 20–40% and where a particular store sits in
 * it depends on the store, so the caller supplies the assumption and the
 * platform does the arithmetic — the same division of labour as the water
 * engine, which computes from inputs it is given rather than asserting an
 * answer.
 */
export function lossValue(
  harvestValue: number,
  lossRate: number,
): { lost: number; retained: number } | null {
  if (!Number.isFinite(harvestValue) || harvestValue <= 0) return null;
  if (!Number.isFinite(lossRate) || lossRate < 0 || lossRate > 1) return null;

  const lost = harvestValue * lossRate;
  return { lost, retained: harvestValue - lost };
}

/**
 * The case for a storage intervention, as a difference rather than a claim.
 *
 * Returns what is saved by moving from one loss rate to another — the published
 * figures being "over 30%" without hermetic storage and "under 2%" with it.
 * Expressed as a function so the numbers on screen are always the caller's own
 * harvest, never an illustrative example someone might mistake for their own.
 */
export function storageGain(
  harvestValue: number,
  currentLossRate: number,
  improvedLossRate: number,
): { saved: number; sharePreserved: number } | null {
  const before = lossValue(harvestValue, currentLossRate);
  const after = lossValue(harvestValue, improvedLossRate);
  if (!before || !after) return null;
  if (improvedLossRate > currentLossRate) return null;

  return {
    saved: before.lost - after.lost,
    sharePreserved: (before.lost - after.lost) / harvestValue,
  };
}
