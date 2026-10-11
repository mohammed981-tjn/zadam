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
  labelEn: string;
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
  labelEn: "European Commission — “Everything But Arms”",
  url: "https://trade.ec.europa.eu/access-to-markets/en/content/everything-arms-eba",
};
// A source for the 2027 GSP regulation stood here, cited by nothing. Removed
// rather than kept for a fact someone might one day assert: a source without a
// claim is clutter, and the reverse — a claim without a source — is what this
// file exists to prevent. When the new arrangement has something to say about
// Sudan's access, it comes back with the sentence it supports.
const EC_ORIGIN: Source = {
  label: "الاتحاد الأوروبي — الضرائب والجمارك: إثبات المنشأ",
  labelEn: "European Union — Taxation and Customs: proof of origin",
  url: "https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin/proof-origin_en",
};
const RASFF_STUDY: Source = {
  label: "دراسة رفض الحدود في نظام الإنذار السريع 2008–2023",
  labelEn: "Study of border rejections in the Rapid Alert System, 2008–2023",
  url: "https://doi.org/10.3390/su17072923",
};
const CBOS_2026: Source = {
  label: "بنك السودان المركزي — سياسات 2026",
  labelEn: "Central Bank of Sudan — 2026 policies",
  url: "https://cbos.gov.sd/en/content/central-bank-sudan-policies-year-2026",
};
const CBOS_WITHDRAWN: Source = {
  label: "سحبُ تعديل لائحة حصيلة الصادر بعد اعتراض المصدِّرين",
  labelEn: "Export-proceeds regulation amendment withdrawn after exporters objected",
  url: "https://sudanhorizon.com/cbos-reverses-export-proceeds-regulation-amendment-as-exporters-criticize-move/",
};
const LC_AFRICA: Source = {
  label: "تأكيد الاعتمادات السودانية — Trade Finance Africa",
  labelEn: "Confirming Sudanese letters of credit — Trade Finance Africa",
  url: "https://tradefinance.africa/sudan-letter-of-credit-confirmation/",
};
const EUDR_GUIDE: Source = {
  label: "دليل الماشية والجلود — لائحة منع إزالة الغابات 2026",
  labelEn: "Cattle and leather guide — 2026 Deforestation Regulation",
  url: "https://eudr-navigator.com/blog/eudr-cattle-leather-compliance-guide",
};
const GUM_AJ: Source = {
  label: "الجزيرة — الصمغ العربي والحرب في السودان",
  labelEn: "Al Jazeera — gum arabic and the war in Sudan",
  url: "https://www.aljazeera.com/news/2026/1/6/how-is-gum-arabic-fuelling-the-war-in-sudan",
};
const GUM_CBI: Source = {
  label: "مركز CBI الهولندي — دخول السوق الأوروبية للصموغ",
  labelEn: "CBI (Netherlands) — entering the European market for gums",
  url: "https://www.cbi.eu/market-information/natural-food-additives/gums/market-entry",
};
const SHEEP_2026: Source = {
  label: "صادرات الضأن إلى السعودية، يناير–مطلع مايو 2026",
  labelEn: "Sheep exports to Saudi Arabia, January–early May 2026",
  url: "https://sudannabaa.com/en/news-en/sudan-exports-128690-sheep-to-saudi-arabia-between-january-and-early-may-2026/80986/",
};
const SASO: Source = {
  label: "المواصفات السعودية والاستيراد — trade.gov",
  labelEn: "Saudi standards and imports — trade.gov",
  url: "https://www.trade.gov/country-commercial-guides/saudi-arabia-standards-trade",
};
const BASKET: Source = {
  label: "بيانات تجارية — Volza (تقديرات لا أرقام رسمية)",
  labelEn: "Trade data — Volza (estimates, not official figures)",
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

/* ---------------------------------------------------------------------------
 * English. The same facts, in the same order, against the same sources — a
 * figure changed above is changed here in the same commit.
 * ------------------------------------------------------------------------ */

export const HEADLINE_EN: Fact[] = [
  {
    value: "70–80%",
    label: "Sudan's share of the world's gum arabic",
    note: "Before the April 2023 war. A commodity with no complete industrial substitute.",
    source: GUM_AJ,
  },
  {
    value: "0%",
    label: "Duty on Sudan's exports to the European Union",
    note: "The “Everything But Arms” arrangement — no duties, no quotas, and no end date.",
    source: EC_EBA,
  },
  {
    value: "30 days",
    label: "Deadline to repatriate export proceeds from the shipping date",
    note: "And collection by letter of credit or advance payment only.",
    source: CBOS_2026,
  },
  {
    value: "128,690",
    label: "Head of sheep exported to Saudi Arabia",
    note: "From January to early May 2026 — the trade is running today, not tomorrow.",
    source: SHEEP_2026,
  },
];

export const COMMODITIES_EN: Commodity[] = [
  { name: "Crude oil", share: "60.5%", markets: "Asia", gate: "Transit and infrastructure — outside the scope of this study" },
  { name: "Gold", share: "14.7%", markets: "UAE", gate: "Chain of custody and freedom from conflict financing" },
  { name: "Livestock", share: "8.9%", markets: "Saudi Arabia", gate: "Veterinary certificate · quarantine · location tracing" },
  { name: "Sesame", share: "5.6%", markets: "China · Turkey · Europe", gate: "Salmonella · aflatoxin · complete documents" },
  { name: "Sorghum", share: "3.2%", markets: "Gulf · East Africa", gate: "Plant quarantine · moisture and mycotoxins" },
  { name: "Cotton", share: "2.8%", markets: "Asia", gate: "Documented grading and sorting" },
  { name: "Gum arabic", share: null, markets: "Europe · United States", gate: "Origin tracing — the tightest constraint today" },
];

export const BEYOND_EN = [
  "groundnuts",
  "hibiscus (karkadeh)",
  "watermelon seeds",
  "spices and cardamom",
  "hides and skins",
  "other gums",
];

export const GATES_EN: Gate[] = [
  {
    n: "Gate 1",
    title: "Origin",
    body: [
      "Europe no longer accepts the old government certificate of origin. Its replacement is the Registered Exporter system: the exporter registers, then certifies origin themselves on the invoice.",
      "Self-certification does not mean no checks — it moves them to after shipment: if you are audited and cannot produce a record proving origin, the preference is withdrawn retroactively.",
    ],
    holder: "The exporter themselves",
    source: EC_ORIGIN,
  },
  {
    n: "Gate 2",
    title: "Health and safety",
    body: [
      "Veterinary quarantine for live animals and meat, plant quarantine for grains and seeds, and aflatoxin and salmonella limits for sesame and groundnuts.",
      "A gate of accredited laboratories and facilities — yet a significant share of rejections are caused by paperwork, not the laboratory: a certificate that is incomplete or does not match the shipment.",
    ],
    holder: "Quarantine + accredited laboratory",
    source: RASFF_STUDY,
  },
  {
    n: "Gate 3",
    title: "Conformity",
    body: [
      "For Saudi Arabia in particular: the SABER system has been mandatory for every import since 2018 — registering the product, then a certificate of conformity for each shipment before it reaches customs.",
      "For regulated food, the Food and Drug Authority adds its own certificate of conformity, with border inspection and post-market sampling.",
    ],
    holder: "The Saudi importer — not the exporter",
    source: SASO,
  },
  {
    n: "Gate 4",
    title: "Money",
    body: [
      "Export proceeds are repatriated within thirty days of shipment, and collection is by letter of credit or advance payment only.",
      "In 2026 the restrictions on using the proceeds were lifted, so an exporter may use them to finance imports the Ministry of Trade permits — which makes them a tradable asset, not just an obligation.",
    ],
    holder: "The bank + Central Bank of Sudan",
    source: CBOS_2026,
  },
];

export const DEADLINES_EN: Deadline[] = [
  {
    what: "Deforestation Regulation — large companies",
    when: "30 December 2026",
    asks: "The coordinates of every plot where the commodity was produced: a point below 4 hectares, a full boundary polygon above",
    effect: "Directly affects cattle and meat",
    source: EUDR_GUIDE,
  },
  {
    what: "The same regulation — small businesses",
    when: "30 June 2027",
    asks: "A due-diligence statement for every shipment proving the land was not deforested after 31 December 2020",
    effect: "Covers small buyers — that is, most of Sudan's buyers",
    source: EUDR_GUIDE,
  },
  {
    what: "The animal's life chain",
    when: "Together with the above",
    asks: "Every location the animal passed through from birth to slaughter — birthplace, pasture, fattening and abattoir — with coordinates",
    effect: "Its hardest requirement worldwide",
    source: EUDR_GUIDE,
  },
  {
    what: "Gum arabic traceability",
    when: "In force now",
    asks: "Supplier audits and documented origin, after a crackdown on gum moving through informal channels",
    effect: "Sudan is the world's largest supplier — and traceability is the condition for staying so",
    source: GUM_CBI,
  },
];

export const LIMITS_EN = [
  {
    title: "Not legal advice",
    body: "Regulations change in waves, and Sudan's export rules are amended and then reversed — as happened with an amendment to the export-proceeds regulation that was withdrawn after exporters objected. Check before you commit.",
    source: CBOS_WITHDRAWN,
  },
  {
    title: "No figure here is our own measurement",
    body: "Everything on this page is read from published sources and attributed to them. Export shares are trade-data estimates, not official accounts, to be read as a ranking, not a budget.",
    source: BASKET,
  },
  {
    title: "The war is an unpriced variable",
    body: "Port Sudan is working and exports continue, but roads, banks and pastures are in a changing situation. Any planning on this page is conditional on that.",
    source: SHEEP_2026,
  },
];

export const MONEY_KNOT_EN = {
  source: LC_AFRICA,
  paragraphs: [
    "The rules require a letter of credit or advance payment. But a letter of credit needs a foreign bank to confirm it, and confirming Sudanese letters of credit remains rare and expensive: the legacy of decades of banking isolation, the withdrawal of correspondent banks, and branches and payment systems out of action since 2023.",
    "When a letter of credit cannot be had, only advance payment is left — the buyer pays before seeing the goods and carries the risk alone. That explains why foreign buyers apply a risk discount to the Sudanese price, and why they prefer an intermediary in Dubai or Jeddah to dealing directly.",
    "And this is exactly the point: anything that reduces the buyer's risk — proof the goods exist, independent inspection before shipment, holding the price until delivery — turns directly into a higher price for Sudanese produce. Trust here is not a moral value but a measurable difference in price.",
  ],
};

export const REJECTION_EN = {
  source: RASFF_STUDY,
  points: [
    "Border rejections make up about 39% of all notifications in the EU Rapid Alert System for 2008–2023.",
    "Sudan is among the leading countries of origin in salmonella notifications for sesame.",
    "Among the rejections, 65 were caused by missing documents or health certificates — goods sent back because a piece of paper was not with them.",
  ],
};
