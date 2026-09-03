/**
 * صادرات السودان — الوقائع ومصادرها في مكانٍ واحد.
 *
 * WHY THE FIGURES LIVE HERE AND NOT IN THE PAGE
 *
 * The same reason the guide reads the platform instead of describing it: a
 * number written into a paragraph drifts. A tariff arrangement is revised, a
 * regulation's date moves, a share is restated — and prose keeps saying what
 * used to be true, which is worse than saying nothing, because the reader has
 * no way to tell.
 *
 * So every figure on the export page comes from this file, each one carrying
 * the source it came from, and the page renders the source beside it. Updating
 * a fact is one line here, and no paragraph anywhere can disagree with another.
 *
 * AND WHAT IS DELIBERATELY NOT HERE
 *
 * No figure of our own. Nothing on this page is measured by this platform — it
 * is all read from published sources and attributed. That is the opposite of
 * the canal study, where the arithmetic is ours and is stated as ours, and the
 * distinction matters: a reader should never have to guess which they are
 * looking at.
 */

export interface Source {
  label: string;
  url: string;
}

export interface Fact {
  /** الرقم كما يُعرض — نصّاً لا عدداً، فبعضه مدى لا قيمة. */
  value: string;
  label: string;
  note?: string;
  source: Source;
}

const EC_EBA: Source = {
  label: "المفوضية الأوروبية — «كل شيء عدا السلاح»",
  url: "https://trade.ec.europa.eu/access-to-markets/en/content/everything-arms-eba",
};
const EC_GSP_2027: Source = {
  label: "المفوضية الأوروبية — لائحة الأفضليات الجديدة، سارية 2027",
  url: "https://policy.trade.ec.europa.eu/news/new-generalised-scheme-preferences-approved-application-2027-2026-04-28_en",
};
const EC_ORIGIN: Source = {
  label: "الاتحاد الأوروبي — الضرائب والجمارك: إثبات المنشأ",
  url: "https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin/proof-origin_en",
};
const RASFF_STUDY: Source = {
  label: "دراسة رفض الحدود في نظام الإنذار السريع 2008–2023",
  url: "https://doi.org/10.3390/su17072923",
};
const CBOS_2026: Source = {
  label: "بنك السودان المركزي — سياسات 2026",
  url: "https://cbos.gov.sd/en/content/central-bank-sudan-policies-year-2026",
};
const CBOS_WITHDRAWN: Source = {
  label: "سحبُ تعديل لائحة حصيلة الصادر بعد اعتراض المصدِّرين",
  url: "https://sudanhorizon.com/cbos-reverses-export-proceeds-regulation-amendment-as-exporters-criticize-move/",
};
const LC_AFRICA: Source = {
  label: "تأكيد الاعتمادات السودانية — Trade Finance Africa",
  url: "https://tradefinance.africa/sudan-letter-of-credit-confirmation/",
};
const EUDR_GUIDE: Source = {
  label: "دليل الماشية والجلود — لائحة منع إزالة الغابات 2026",
  url: "https://eudr-navigator.com/blog/eudr-cattle-leather-compliance-guide",
};
const GUM_AJ: Source = {
  label: "الجزيرة — الصمغ العربي والحرب في السودان",
  url: "https://www.aljazeera.com/news/2026/1/6/how-is-gum-arabic-fuelling-the-war-in-sudan",
};
const GUM_CBI: Source = {
  label: "مركز CBI الهولندي — دخول السوق الأوروبية للصموغ",
  url: "https://www.cbi.eu/market-information/natural-food-additives/gums/market-entry",
};
const SHEEP_2026: Source = {
  label: "صادرات الضأن إلى السعودية، يناير–مطلع مايو 2026",
  url: "https://sudannabaa.com/en/news-en/sudan-exports-128690-sheep-to-saudi-arabia-between-january-and-early-may-2026/80986/",
};
const SASO: Source = {
  label: "المواصفات السعودية والاستيراد — trade.gov",
  url: "https://www.trade.gov/country-commercial-guides/saudi-arabia-standards-trade",
};
const BASKET: Source = {
  label: "بيانات تجارية — Volza (تقديرات لا أرقام رسمية)",
  url: "https://www.volza.com/global-trade-data/sudan-export-trade-data/top-export-products-of-sudan/",
};

/** الأرقام الأربعة التي تُلخّص الموقف. */
export const HEADLINE: Fact[] = [
  {
    value: "٧٠–٨٠٪",
    label: "حصّة السودان من الصمغ العربي عالمياً",
    note: "قبل حرب أبريل 2023. سلعةٌ لا بديلَ صناعيّ كامل لها.",
    source: GUM_AJ,
  },
  {
    value: "٠٪",
    label: "رسوم على صادرات السودان إلى الاتحاد الأوروبي",
    note: "ترتيب «كل شيء عدا السلاح» — بلا رسوم وبلا حصص، وبلا تاريخ انتهاء.",
    source: EC_EBA,
  },
  {
    value: "٣٠ يوماً",
    label: "مهلة إعادة حصيلة الصادر من تاريخ الشحن",
    note: "والتحصيل باعتمادٍ مستندي أو دفعٍ مقدَّم لا غير.",
    source: CBOS_2026,
  },
  {
    value: "١٢٨٬٦٩٠",
    label: "رأس ضأن صُدِّرت إلى السعودية",
    note: "من يناير إلى مطلع مايو 2026 — التجارة قائمة اليوم لا غداً.",
    source: SHEEP_2026,
  },
];

export interface Commodity {
  name: string;
  share: string | null;
  markets: string;
  gate: string;
}

/**
 * سلّة الصادرات. الحصص تقديراتُ بياناتٍ تجارية لعام 2025 لا حساباتٌ رسمية،
 * وتُقرأ ترتيباً لا ميزانية — وهذا مكتوبٌ على الصفحة لا مطويٌّ هنا.
 */
export const BASKET_SOURCE = BASKET;
export const COMMODITIES: Commodity[] = [
  { name: "النفط الخام", share: "٦٠٫٥٪", markets: "آسيا", gate: "عبورٌ وبنية تحتية — خارج نطاق هذه الدراسة" },
  { name: "الذهب", share: "١٤٫٧٪", markets: "الإمارات", gate: "سلسلة عهدةٍ وخلوٌّ من تمويل النزاع" },
  { name: "الثروة الحيوانية", share: "٨٫٩٪", markets: "السعودية", gate: "شهادةٌ بيطرية · حجرٌ صحي · تتبُّعُ المواقع" },
  { name: "السمسم", share: "٥٫٦٪", markets: "الصين · تركيا · أوروبا", gate: "سالمونيلا · أفلاتوكسين · اكتمالُ المستندات" },
  { name: "الذرة الرفيعة", share: "٣٫٢٪", markets: "الخليج · شرق أفريقيا", gate: "حجرٌ نباتي · رطوبةٌ وسمومٌ فطرية" },
  { name: "القطن", share: "٢٫٨٪", markets: "آسيا", gate: "تدريجٌ وفرزٌ موثَّق" },
  { name: "الصمغ العربي", share: null, markets: "أوروبا · الولايات المتحدة", gate: "تتبُّعُ المنشأ — القيد الأشدّ اليوم" },
];

/** وما وراء السلّة: الأبواب نفسها تفتح لها جميعاً. */
export const BEYOND = [
  "الفول السوداني",
  "الكركديه",
  "بذور البطيخ",
  "التوابل والحبهان",
  "الجلود",
  "الصموغ الأخرى",
];

export interface Gate {
  n: string;
  title: string;
  body: string[];
  holder: string;
  source: Source;
}

/** البوّابات الأربع التي تمرّ بها كل شحنة. تعطّلُ واحدةٍ يوقف الصفقة كلَّها. */
export const GATES: Gate[] = [
  {
    n: "البوّابة ١",
    title: "المنشأ",
    body: [
      "لم تعد أوروبا تقبل شهادة المنشأ الحكومية القديمة. بديلُها نظامُ المصدِّر المسجَّل: يُسجَّل المصدِّر، ثم يشهد بالمنشأ بنفسه على الفاتورة.",
      "والشهادةُ الذاتية لا تعني غيابَ الرقابة، بل نقلَها إلى ما بعد الشحن: فإن دُقِّق عليك ولم تُخرج سجلّاً يُثبت المنشأ، سقطت الأفضلية بأثرٍ رجعيّ.",
    ],
    holder: "المصدِّر نفسه",
    source: EC_ORIGIN,
  },
  {
    n: "البوّابة ٢",
    title: "الصحّة والسلامة",
    body: [
      "الحجر البيطري للحيوان الحيّ واللحوم، والحجر النباتي للحبوب والبذور، وحدودُ الأفلاتوكسين والسالمونيلا للسمسم والفول السوداني.",
      "بوّابةُ مختبرٍ ومنشأةٍ معتمدة — غير أن جزءاً معتبَراً من الرفض سببه الورق لا المختبر: شهادةٌ ناقصة أو غيرُ مطابقةٍ للشحنة.",
    ],
    holder: "الحجر الصحي + المختبر المعتمد",
    source: RASFF_STUDY,
  },
  {
    n: "البوّابة ٣",
    title: "المطابقة",
    body: [
      "للسعودية تحديداً: منظومة «سابر» إلزاميةٌ لكل وارد منذ 2018 — تسجيلُ المنتج، ثم شهادةُ مطابقةٍ لكل إرسالية قبل وصولها الجمرك.",
      "وللغذاء المنظَّم تضيف هيئةُ الغذاء والدواء شهادةَ مطابقةٍ خاصة، مع فحصٍ عند الحدود وسحبِ عيّناتٍ بعد التسويق.",
    ],
    holder: "المستورد السعودي — لا المصدِّر",
    source: SASO,
  },
  {
    n: "البوّابة ٤",
    title: "المال",
    body: [
      "حصيلةُ الصادر تُعاد خلال ثلاثين يوماً من الشحن، والتحصيل باعتمادٍ مستندي أو دفعٍ مقدَّم لا غير.",
      "وفي 2026 رُفعت القيود على استخدام الحصيلة، فصار للمصدِّر أن يموّل بها استيراد ما تُجيزه وزارة التجارة — وهذا يجعلها أصلاً قابلاً للتداول لا التزاماً فحسب.",
    ],
    holder: "المصرف + بنك السودان",
    source: CBOS_2026,
  },
];

export interface Deadline {
  what: string;
  when: string;
  asks: string;
  effect: string;
  source: Source;
}

/** اللوائح القادمة: أوروبا تنقل عبء الإثبات من الجمرك إلى المورِّد، بمواعيد. */
export const DEADLINES: Deadline[] = [
  {
    what: "لائحة منع إزالة الغابات — الشركات الكبرى",
    when: "30 ديسمبر 2026",
    asks: "إحداثيّةُ كل قطعةِ أرضٍ أُنتجت فيها السلعة: نقطةٌ لما دون ٤ هكتارات، ومضلَّعُ حدودٍ كامل لما فوقها",
    effect: "يمسّ الماشية واللحوم مباشرة",
    source: EUDR_GUIDE,
  },
  {
    what: "اللائحة نفسها — المنشآت الصغيرة",
    when: "30 يونيو 2027",
    asks: "بيانُ عنايةٍ واجبة لكل إرسالية يُثبت أن الأرض لم تُزَل غاباتُها بعد 31 ديسمبر 2020",
    effect: "يشمل صغار المشترين — أي أغلب مشتري السودان",
    source: EUDR_GUIDE,
  },
  {
    what: "سلسلةُ حياة الحيوان",
    when: "مع ما سبق",
    asks: "كلُّ موقعٍ مرّ به الحيوان من الولادة إلى الذبح — المولد والمرعى والتسمين والمسلخ — بإحداثيّاته",
    effect: "أصعبُ بنودها عالمياً",
    source: EUDR_GUIDE,
  },
  {
    what: "تتبُّع الصمغ العربي",
    when: "قائمٌ الآن",
    asks: "تدقيقُ مورِّدين وتوثيقُ منشأ، بعد تشدُّدٍ على الصمغ العابر لقنواتٍ غير رسمية",
    effect: "السودان أكبرُ مورِّدٍ في العالم — والتتبّعُ شرطُ بقائه فيه",
    source: GUM_CBI,
  },
];

/** ما يُقرأ على الصفحة عن حدود هذه الدراسة. */
export const LIMITS = [
  {
    title: "ليست استشارةً قانونية",
    body: "اللوائح تتغيّر بموجاتها، ونصوصُ الصادر السوداني تُعدَّل ثم يُتراجَع عنها — وقد حدث ذلك مع تعديلٍ على لائحة حصيلة الصادر سُحب بعد اعتراض المصدِّرين. تحقّق قبل الالتزام.",
    source: CBOS_WITHDRAWN,
  },
  {
    title: "لا رقمَ هنا من قياسنا",
    body: "كلُّ ما في الصفحة مقروءٌ من مصادر منشورة ومنسوبٌ إليها. وحصصُ الصادرات تقديراتُ بياناتٍ تجارية لا حساباتٌ رسمية، تُقرأ ترتيباً لا ميزانية.",
    source: BASKET,
  },
  {
    title: "الحرب متغيّرٌ لم يُسعَّر",
    body: "بورتسودان يعمل والتصدير قائم، لكن الطرق والمصارف والمراعي في وضعٍ متبدّل. وأيُّ تخطيطٍ على هذه الصفحة مشروطٌ بذلك.",
    source: SHEEP_2026,
  },
];

/** العقدة المالية — الفقرة التي تشرح لماذا الإثبات يساوي سعراً. */
export const MONEY_KNOT = {
  source: LC_AFRICA,
  paragraphs: [
    "النظام يوجب اعتماداً مستندياً أو دفعاً مقدَّماً. لكن الاعتماد يحتاج مصرفاً أجنبياً يؤكّده، وتأكيدُ الاعتمادات السودانية باقٍ نادراً ومكلفاً: إرثُ عقودٍ من العزل المصرفي، وانسحابُ المصارف المراسلة، وتعطّلُ فروعٍ ونظمِ دفعٍ منذ 2023.",
    "فحين يتعذّر الاعتماد لا يبقى إلا الدفع المقدَّم — أي أن المشتري يدفع قبل أن يرى، ويحمل المخاطرة وحده. وهذا يفسّر لماذا يخصم المشتري الأجنبي من السعر السوداني خصمَ مخاطرة، ولماذا يفضّل وسيطاً في دبي أو جدّة على تعاملٍ مباشر.",
    "ومن هنا تحديداً: كلُّ ما يقلّل مخاطرةَ المشتري — إثباتُ وجود البضاعة، وفحصٌ مستقلٌّ قبل الشحن، وحجزُ الثمن حتى الاستلام — يتحوّل مباشرةً إلى سعرٍ أعلى للمنتج السوداني. الثقة هنا ليست قيمةً أخلاقية، بل فرقٌ في السعر قابلٌ للقياس.",
  ],
};

export const REJECTION = {
  source: RASFF_STUDY,
  /** أرقامٌ عن الرفض الأوروبي، تُذكر لأن أحدها ليس عيباً في البضاعة. */
  points: [
    "رفضُ الحدود يمثّل نحو ٣٩٪ من كل إخطارات نظام الإنذار السريع الأوروبي للفترة 2008–2023.",
    "والسودان من أبرز بلدان المنشأ في إخطارات السالمونيلا في السمسم.",
    "ومن بين حالات الرفض ٦٥ حالةً سببها غيابُ المستندات أو الشهادات الصحية — بضاعةٌ رُدَّت لأن ورقةً لم تكن معها.",
  ],
};
