/**
 * تكاليف الفدان المنشورة للمحاصيل الجديدة — مرجعٌ يُعرض كما كُتب (البند ١٧٧؛ قرار المالك 6 نوفمبر 2026:
 * «نعرضها مرجعاً فقط»).
 *
 * WHY A REFERENCE AND NOT A NUMBER THE STUDY RUNS ON
 *
 * Every figure here was copied from a source that was opened (6 November 2026 search): Sudanese state ministries via
 * FAO, Sudanese universities, Tropentag, the National Rice Development Strategy. They are 2002–2018 figures, in pounds
 * (or dinars) of their year, some per hectare, some variable costs only. The pound has lost most of its value since,
 * and converting would need a rate chosen by us — an estimate resting on two sources. So the study shows them as
 * written, with year, place and source, for the farmer to compare with his own; the cost the study runs on is still
 * the one he types. Crops with no published figure have no row: absence is said, not filled.
 */

export interface PublishedCost {
  crop: string;
  /** The figure exactly as the source writes it. */
  figure: string;
  basis: { ar: string; en: string };
  season: string;
  place: { ar: string; en: string };
  source: string;
  url: string;
}

const RN_FAO = "https://openknowledge.fao.org/server/api/core/bitstreams/38559d4b-7baf-451e-ac06-5a6f38900602/content";
const DARFUR = "https://www.easpublisher.com/get-articles/1741";
const total = { ar: "التكلفة الكلّيّة", en: "total cost" };
const variable = { ar: "التكاليف المتغيّرة وحدها", en: "variable costs only" };
const darfur = { ar: "محلية أزوم، وسط دارفور", en: "Azum locality, Central Darfur" };

export const PUBLISHED_COSTS: readonly PublishedCost[] = [
  { crop: "faba_bean", figure: "1,408 SDG/feddan", basis: total, season: "2013–14", place: { ar: "ولاية نهر النيل، ريّ صغير", en: "River Nile State, small-scale irrigated" }, source: "FAO & Mamoun Beheiry Center (2017), citing the state ministry of agriculture", url: RN_FAO },
  { crop: "faba_bean", figure: "48,310 SDD/feddan", basis: total, season: "2002/03", place: { ar: "الدامر، نهر النيل، ريّ بالطلمبات", en: "Eddamer, River Nile, pump irrigation" }, source: "Tropentag 2007", url: "https://www.tropentag.de/2007/abstracts/full/564.pdf" },
  { crop: "potato", figure: "22,459 SDG/feddan", basis: total, season: "2017/18", place: { ar: "جزيرة إسلانج، أم درمان، ريّ من النيل", en: "Islang island, Omdurman, Nile-bank irrigation" }, source: "Sudan University of Science and Technology", url: "https://repository.sustech.edu/jspui/bitstream/123456789/27069/1/%D8%A5%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%D9%8A%D8%A7%D8%AA%20%D8%A5%D9%86%D8%AA%D8%A7%D8%AC%20%D8%A7%D9%84%D8%A8%D8%B7%D8%A7%D8%B7%D8%B3%20.....%20.pdf" },
  { crop: "potato", figure: "8,757 SDG/feddan", basis: total, season: "2013–14", place: { ar: "ولاية نهر النيل، ريّ صغير", en: "River Nile State, small-scale irrigated" }, source: "FAO & Mamoun Beheiry Center (2017)", url: RN_FAO },
  { crop: "potato", figure: "20,303 SDG/ha", basis: variable, season: "2017/18", place: darfur, source: "EAS Journal (2019)", url: DARFUR },
  { crop: "rice", figure: "3,440 SDG/feddan", basis: total, season: "2010", place: { ar: "ولاية النيل الأبيض، أرزٌ هوائيّ", en: "White Nile State, aerobic rice" }, source: "National Rice Development Strategy (2019), citing the Ministry of Agriculture", url: "https://riceforafrica.net/wp-content/uploads/2021/09/sudan_nrds2.pdf" },
  { crop: "cowpea", figure: "14,963 SDG/ha", basis: variable, season: "2017/18", place: darfur, source: "EAS Journal (2019)", url: DARFUR },
  { crop: "cowpea", figure: "124 SDG/feddan", basis: { ar: "تكاليف الميزانيّة الجزئيّة", en: "partial-budget costs" }, season: "—", place: { ar: "شمال كردفان، مطريّ تقليديّ", en: "North Kordofan, traditional rainfed" }, source: "Tropentag 2013", url: "https://www.tropentag.de/2013/abstracts/posters/840.pdf" },
  { crop: "watermelon", figure: "11,148 SDG/ha", basis: variable, season: "2017/18", place: darfur, source: "EAS Journal (2019)", url: DARFUR },
  { crop: "watermelon", figure: "239 SDG/ha (1 $ = 5.2 SDG)", basis: total, season: "2008/09–2010/11", place: { ar: "محلية بارا، شمال كردفان، مطريّ", en: "Bara, North Kordofan, rainfed" }, source: "American International Journal of Contemporary Research (2013)", url: "https://aijcr.thebrpi.org/journals/Vol_3_No_11_Novembe_2013/14.pdf" },
  { crop: "eggplant", figure: "8,764 SDG/ha", basis: variable, season: "2017/18", place: darfur, source: "EAS Journal (2019)", url: DARFUR },
  { crop: "citrus", figure: "251,704 SDD/feddan", basis: variable, season: "2005/06", place: { ar: "مشروع الكتياب، نهر النيل، ريّ بالطلمبات", en: "Elketiab scheme, River Nile, pump irrigation" }, source: "Journal of Scientific Research & Reports (2014)", url: "https://doi.org/10.9734/jsrr/2014/9946" },
];

export const publishedCostsFor = (crop: string) => PUBLISHED_COSTS.filter((c) => c.crop === crop);
