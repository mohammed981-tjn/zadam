/**
 * محاصيل جديدة على السودان — ما الدليل على أنّها تُزرع هنا، وما الذي يحذَر منه.
 *
 * The owner, 12 October 2026, asked for crops not grown in Sudan that could
 * be, kept apart from the Sudanese ones, and for visitors to be encouraged to
 * try them. "Encouraged" here means an honest case: the trial evidence from
 * Sudan where it exists, a warning where the climate works against the crop,
 * and a link that opens the feasibility study already set to that crop.
 * Evidence read in the sources named; nothing is claimed beyond them.
 */

export interface NewCrop {
  key: string;
  ar: string;
  en: string;
  /** True when the water engine can cost it (FAO-56 stages and Kc both published). */
  inStudy: boolean;
  evidence: { ar: string; en: string };
  caution?: { ar: string; en: string };
  sources: { label: string; url: string }[];
}

export const NEW_CROP_INFO: NewCrop[] = [
  {
    key: "soybean",
    ar: "فول الصويا",
    en: "Soybean",
    inStudy: true,
    evidence: {
      ar: "جرّبته محطة بحوث الجزيرة: أعطت الأصناف حتى ٢٫٧ طن للهكتار مروياً، ونضجت في ٧١–٨٦ يوماً. وفي الشمالية أُوصي بزراعته في أوّل يوليو.",
      en: "Gezira Research Station trials gave up to 2.7 t/ha under irrigation, maturing in 71–86 days. In the Northern State, sowing on 1 July is recommended.",
    },
    sources: [
      { label: "Ibrahim et al. 2017, Gezira Research Station", url: "http://www.intagrijournal.org/journal/article.php?code=58915" },
      { label: "Gezira soybean variability trial (RUFORUM)", url: "http://repository.ruforum.org/documents/genetic-variability-soybean-yield-and-yield-components-under-irrigation-conditions-gezira" },
    ],
  },
  {
    key: "grapes",
    ar: "العنب",
    en: "Grapes",
    inStudy: true,
    evidence: {
      ar: "دخل السودان منذ 1896، وقام إنتاج تجاري حول الخرطوم منذ 2007 (كدرو وجبل أولياء) بصنفي كاردينال وكريمسون.",
      en: "Introduced in 1896; commercial vineyards around Khartoum since 2007 (Kadaru, Jabal Awlia), with Cardinal and Crimson.",
    },
    caution: { ar: "سُجّل فيه مرض البياض الزغبي في السودان، فيحتاج برنامج رشّ.", en: "Downy mildew has been recorded in Sudan, so it needs a spray programme." },
    sources: [{ label: "Abbo 2019, downy mildew on grapevine in Sudan", url: "https://biomedres.us/pdfs/BJSTR.MS.ID.003307.pdf" }],
  },
  {
    key: "olive",
    ar: "الزيتون",
    en: "Olive",
    inStudy: true,
    evidence: {
      ar: "لم نجد تجربة منشورة في السودان. في مصر يُزرع على ٦×٥ أمتار (١٤٠ شجرة للفدان) بالتنقيط.",
      en: "No published trial in Sudan was found. In Egypt it is grown at 6×5 m (140 trees per feddan) under drip.",
    },
    caution: {
      ar: "قد يقلّ إزهاره وإثماره دون خطّ عرض ٣٠ لقلّة البرودة، والسودان بين ١٠ و٢٢ شمالاً. جرّبه على نطاق صغير أولاً.",
      en: "Flowering and fruiting may fall below latitude 30° for lack of chilling, and Sudan lies at 10–22°N. Try it small first.",
    },
    sources: [{ label: "Torres et al. 2017, olive at low latitudes", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5663689/" }],
  },
  {
    key: "quinoa",
    ar: "الكينوا",
    en: "Quinoa",
    inStudy: false,
    evidence: {
      ar: "جرّبتها هيئة البحوث الزراعية (شمبات) منذ 2013 في خمسة مواقع: متوسّط ٢٫١ طن للهكتار عند الزراعة في منتصف نوفمبر، وأفضل سلالة ٤ أطنان.",
      en: "ARC Shambat has trialled it since 2013 at five sites: 2.1 t/ha on average when sown in mid-November, the best line 4 t/ha.",
    },
    caution: { ar: "الزراعة المتأخّرة (يناير) خفّضت الإنتاج ٦٨٪. لم نجد أطوار نموّ منشورة لحساب مائها.", en: "Late sowing (January) cut yield by 68%. No published growth stages were found to cost its water." },
    sources: [{ label: "Mohammed & Mohamed (ARC Shambat), ICBA quinoa conference", url: "https://quinoaconference.biosaline.org/sites/default/files/Maarouf-Sudan.pdf" }],
  },
  {
    key: "guar",
    ar: "القوار",
    en: "Guar",
    inStudy: false,
    evidence: {
      ar: "دخل السودان في الستينات، ويُزرع تجارياً على نطاق محدود قرب سنجة والقضارف. أعطى في الفاشر ٧٨١ كجم للهكتار مطرياً، ومروياً في حلفا الجديدة حتى ٢٫٣ طن.",
      en: "Introduced in the 1960s and grown commercially on a small scale near Singa and Gedaref. 781 kg/ha rainfed at El Fasher, up to 2.3 t/ha irrigated at New Halfa.",
    },
    sources: [{ label: "ARC El Fasher, guar for rainfed western Sudan", url: "http://awww.senassudan.com/index.php/2017-05-25-11-16-00/143-Evaluation-of-Guar-as-a-Proposed-New-Crop-for-Rainfed-Semiarid-Regions-of-Western-Sudan" }],
  },
  {
    key: "canola",
    ar: "الكانولا",
    en: "Canola",
    inStudy: false,
    evidence: {
      ar: "لم نجد تجربة في السودان. في مصر يُزرع في نوفمبر بثلاثة كيلوجرامات بذور للفدان ويُحصد بعد نحو ١٦٥ يوماً.",
      en: "No Sudanese trial found. In Egypt it is sown in November at 3 kg seed per feddan and harvested after about 165 days.",
    },
    caution: { ar: "ليست له أطوار نموّ في جداول الفاو، فلا نحسب ماءه بعد.", en: "FAO tables give no growth stages for it, so its water is not costed yet." },
    sources: [{ label: "Moursi et al. 2015, canola at Sakha, Egypt", url: "https://exa.ai/library/publication/q1cwkh14xty" }],
  },
];
