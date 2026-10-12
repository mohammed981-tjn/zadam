/**
 * احتياجات الفدان لكلّ محصول — من توصيات هيئة البحوث الزراعية والدراسات المنشورة.
 *
 * The owner approved this on 12 October 2026: seed per feddan, urea and
 * phosphate bags and when they go on, sprays, and the field operations.
 *
 * Every number below was read in the source listed with it; nothing is filled
 * in from memory. Where no source gave a figure the field is null and the page
 * says so, because a missing number is information and an invented one is not.
 * One feddan is 0.42 ha, and figures published per hectare were converted with
 * that factor and nothing else. A bag is 50 kg.
 *
 * Sources are uneven in age. The World Bank's 1983 Gezira report records the
 * Agricultural Research Corporation's packages of the time and is still the
 * fullest single list; newer ARC figures override it where they exist.
 */

export interface InputSource {
  label: string;
  url: string;
}

export interface CropInputs {
  /** Seed per feddan, kg: [low, high]. null when no source gave it. */
  seedKg: [number, number] | null;
  seedNote?: { ar: string; en: string };
  /** Urea (46% N), kg per feddan. */
  ureaKg: [number, number] | null;
  /** Phosphate fertiliser per feddan. */
  phosphate: { kind: "DAP" | "TSP" | "NPK"; kg: [number, number] } | null;
  /** When the fertiliser goes on. */
  timing: { ar: string; en: string } | null;
  /** Sprays and herbicides as the source states them. */
  sprays: { ar: string; en: string } | null;
  /** Field operations in season order. */
  operations: { ar: string; en: string };
  system: { ar: string; en: string };
  sources: InputSource[];
}

const WB1983: InputSource = {
  label: "World Bank, Gezira Rehabilitation Project, Annex 1 (ARC recommendations), 1983",
  url: "https://documents1.worldbank.org/curated/en/475491533569413631/txt/129256-SAR-v1-PUBLIC-wbg-archives-72795I.txt",
};

export const CROP_INPUTS: Record<string, CropInputs> = {
  wheat: {
    system: { ar: "مروي — الجزيرة، حلفا الجديدة، الشمالية", en: "Irrigated — Gezira, New Halfa, Northern" },
    seedKg: [50, 60],
    ureaKg: [80, 100],
    phosphate: { kind: "DAP", kg: [50, 50] },
    timing: {
      ar: "اليوريا عند الزراعة أو بعدها بأسبوعين (مع الريّة الثانية)، والفوسفات مع الزراعة",
      en: "Urea at sowing or two weeks after (with the second irrigation); phosphate with sowing",
    },
    sprays: { ar: "رشّة أو رشّتان للمنّ؛ ومبيد حشائش موصى به (المعدّل غير منشور)", en: "One or two sprays against aphids; herbicide recommended (rate not published)" },
    operations: {
      ar: "حراثة قرصية أو مسلفة، تسوية، تقنين، زراعة بالسطّارة (نوفمبر)، تسميد، ٦–٨ ريّات كلّ ١٤ يوماً، حصاد بالحاصدة",
      en: "Disc ploughing or harrowing, levelling, ridging, drilling (November), fertilising, 6–8 irrigations every 14 days, combine harvest",
    },
    sources: [
      { label: "Ibrahim et al. (ARC Wad Medani) 2024, Sustainability 16:6600 — 119–143 kg seed, 238 kg urea, 119 kg DAP per ha", url: "https://doi.org/10.3390/su16156600" },
      WB1983,
    ],
  },
  cotton: {
    system: { ar: "مروي — الجزيرة والرهد", en: "Irrigated — Gezira and Rahad" },
    seedKg: [9, 10],
    seedNote: { ar: "بذور غير منزوعة الزغب؛ ٥–٦ كجم للمنزوعة بالحمض", en: "Non-delinted seed; 5–6 kg if acid-delinted" },
    ureaKg: [78, 100],
    phosphate: null,
    timing: { ar: "اليوريا بعد ٦ أسابيع من الزراعة، تكبيشاً بالآلة", en: "Urea six weeks after sowing, side-dressed by machine" },
    sprays: { ar: "٦–٧ رشّات في الموسم (توصية 1983)، و٢٫٥–٣٫٥ في 2001–2006؛ ومعاملة حشائش واحدة", en: "6–7 sprays a season (1983 package), 2.5–3.5 in 2001–2006; one herbicide treatment" },
    operations: {
      ar: "حراثة عميقة، تنعيم وتسوية، تقنين، زراعة (٢٠ يوليو – ١٠ أغسطس)، خفّ، تسميد، نظافة، لقيط كلّ ١٤ يوماً، قلع الحطب وحرقه",
      en: "Deep ploughing, harrowing and levelling, ridging, sowing (20 July – 10 August), thinning, fertilising, weeding, picking every 14 days, stalk clean-up",
    },
    sources: [
      { label: "Babiker (ARC Cotton Research Program), ICAC — 9–10 kg/fed seed, 36 kg N/fed", url: "https://icac.org/wp-content/uploads/2025/01/sudan.pdf" },
      WB1983,
    ],
  },
  sorghum: {
    system: { ar: "مطري آلي — القضارف (وفي الجزيرة مروي)", en: "Rainfed mechanised — Gedaref (irrigated in Gezira)" },
    seedKg: [3, 4],
    ureaKg: [20, 40],
    phosphate: null,
    timing: { ar: "اليوريا بعد شهر من الإنبات", en: "Urea one month after emergence" },
    sprays: {
      ar: "عند الزراعة: غلايفوسيت ١٫٠ لتر + دوال قولد ٠٫٥ لتر + قزابريم ٠٫٥ لتر للفدان (حزمة الزراعة الحافظة)",
      en: "At sowing: glyphosate 1.0 L + Dual Gold 0.5 L + Gesaprim 0.5 L per feddan (conservation-agriculture package)",
    },
    operations: {
      ar: "مسلفة قرصية عريضة أو زراعة مباشرة بالبلانتر، زراعة (منتصف يونيو – منتصف يوليو)، تسميد، نظافة، حصاد يدوي غالباً",
      en: "Wide-level disc harrowing or direct planting, sowing (mid-June – mid-July), fertilising, weeding, mostly manual harvest",
    },
    sources: [
      { label: "Yousif & Babiker (ARC) 2015 — 95.2 kg urea/ha, herbicide rates", url: "http://files.aiscience.org/journal/article/html/70030045.html" },
      { label: "Sudan sorghum forecasting, AJMS 2016 — 3–3.5 kg/feddan", url: "http://article.sapub.org/10.5923.j.ajms.20160604.06.html" },
      WB1983,
    ],
  },
  groundnut: {
    system: { ar: "مروي — الجزيرة", en: "Irrigated — Gezira" },
    seedKg: [50, 50],
    ureaKg: null,
    phosphate: null,
    timing: { ar: "لا يُسمَّد في الغالب", en: "Usually not fertilised" },
    sprays: { ar: "رونستار 25EC بمعدل ٢ لتر للفدان بعد الزراعة مباشرة", en: "Ronstar 25EC at 2 L per feddan right after planting" },
    operations: {
      ar: "حراثة قرصية، تنعيم، تسوية، تقنين على ٦٠ سم، زراعة (يونيو)، نظافة بعد شهر، ريّ كلّ أسبوعين، قلع وتجفيف",
      en: "Disc ploughing, harrowing, levelling, ridging at 60 cm, sowing (June), weeding after a month, irrigation every two weeks, lifting and drying",
    },
    sources: [WB1983],
  },
  sesame: {
    system: { ar: "مطري — القضارف وكردفان", en: "Rainfed — Gedaref and Kordofan" },
    seedKg: null,
    seedNote: { ar: "المصدر المتاح يطبع «١–٥ كجم» ولم نحسمه", en: "The available source prints “1–5 kg”, which we could not settle" },
    ureaKg: null,
    phosphate: null,
    timing: { ar: "استجابته للنيتروجين ضعيفة، فلا يُسمَّد في المطري غالباً", en: "Weak response to nitrogen, so rainfed sesame is usually not fertilised" },
    sprays: null,
    operations: {
      ar: "إزالة الشجيرات، زراعة بالبلانتر، نظافتان (بعد أسبوعين وأربعة)، حصاد يدوي",
      en: "Clearing shrubs, planter sowing, two weedings (at two and four weeks), manual harvest",
    },
    sources: [
      { label: "Arab Trade Financing Program, Sudan – Sesame, 2011", url: "https://atfp.org.ae/english/studies/sudan-tp/sdntp-sesame2011.pdf" },
      { label: "El Naim et al. 2012, Kordofan sesame seed rates", url: "http://article.sapub.org/10.5923.j.ijaf.20120204.08.html" },
    ],
  },
  maize: {
    system: { ar: "مروي — الجزيرة والرهد", en: "Irrigated — Gezira and Rahad" },
    seedKg: null,
    seedNote: { ar: "المنشور مسافة ٨٠×٢٠ سم ونبات في الجورة، لا كيلوجرامات", en: "Published as 80×20 cm, one plant per hill — not in kilograms" },
    ureaKg: [78, 78],
    phosphate: null,
    timing: { ar: "اليوريا على دفعتين: بعد أسبوعين من الزراعة، وعند التزهير", en: "Urea in two splits: two weeks after sowing, and at flowering" },
    sprays: null,
    operations: { ar: "تقنين، زراعة، تسميد، نظافتان على الأقل، ريّ كلّ ١٠–١٤ يوماً", en: "Ridging, sowing, fertilising, at least two weedings, irrigation every 10–14 days" },
    sources: [{ label: "Alhessein 2022, maize under irrigation in central Sudan — 86 kg N/ha", url: "https://exa.ai/library/publication/3nrj4bw4fym" }],
  },
  onion: {
    system: { ar: "مروي — الشمالية ونهر النيل وكسلا", en: "Irrigated — Northern, River Nile, Kassala" },
    seedKg: null,
    seedNote: { ar: "للفصّوص (الأنتاج للتقاوي): ٥٠ كجم للفدان؛ وللبصل الجافّ لم نجد رقماً", en: "For sets: 50 kg per feddan; no figure found for the bulb crop" },
    ureaKg: [39, 39],
    phosphate: null,
    timing: { ar: "اليوريا على دفعتين متساويتين", en: "Urea in two equal doses" },
    sprays: null,
    operations: { ar: "مشتل ٧–٨ أسابيع، شتل في أكتوبر، تسميد، ريّ كلّ ٤–٨ أيام، قلع", en: "Nursery 7–8 weeks, transplanting in October, fertilising, irrigation every 4–8 days, lifting" },
    sources: [{ label: "ARC Shambat 2022, onion sets — 43 kg N/ha in two doses", url: "https://openaccesspub.org/agronomy-research/article/effects-of-seed-bed-cultivars-and-seed-rates-on-yield-and-quality-of-onion-sets-allium-cepa-l-1893" }],
  },
  tomato: {
    system: { ar: "مروي — الجزيرة والخرطوم", en: "Irrigated — Gezira and Khartoum" },
    seedKg: [0.42, 0.42],
    seedNote: { ar: "للزراعة المباشرة (١ كجم للهكتار)", en: "Direct-seeded (1 kg per hectare)" },
    ureaKg: null,
    phosphate: null,
    timing: { ar: "بالمعدّل الموصى به حسب تحليل التربة (لم يُنشر رقم)", en: "At the recommended rate by soil test (no figure published)" },
    sprays: { ar: "مبيد بيرثرويد (دانيتول أو سوميسيدين) ٠٫٢٩ لتر للفدان كلّ أسبوع ضدّ الذبابة البيضاء", en: "Pyrethroid (Danitol or Sumicidine) 0.29 L per feddan weekly against whitefly" },
    operations: { ar: "مشتل ٦ أسابيع أو زراعة مباشرة، شتل، خفّ، نظافة يدوية، ريّ كلّ ٥ أيام، جني كلّ ٣ أيام", en: "Six-week nursery or direct sowing, transplanting, thinning, hand weeding, irrigation every 5 days, picking every 3 days" },
    sources: [{ label: "Gezira Research Station shelterbelt study — 1 kg seed/ha, 0.7 L insecticide/ha weekly", url: "https://core.ac.uk/download/479050258.pdf" }],
  },
  sugarcane: {
    system: { ar: "مروي — كنانة والجنيد", en: "Irrigated — Kenana and Guneid" },
    seedKg: null,
    ureaKg: [200, 200],
    phosphate: { kind: "TSP", kg: [50, 50] },
    timing: { ar: "اليوريا دفعة واحدة قبل الريّة الثانية", en: "Urea in one dose before the second irrigation" },
    sprays: null,
    operations: { ar: "حراثة بالمحراث الحفّار، تنعيم، تسوية، فتح سراب، زراعة العقل، تسميد، ردم بعد ثلاثة أشهر، حصاد", en: "Chisel ploughing, harrowing, levelling, furrowing, planting setts, fertilising, earthing up at three months, harvest" },
    sources: [{ label: "Abdel Wahab 2014, Kenana standard practice — 200 kg urea and 50 kg TSP per feddan", url: "https://www.scirp.net/pdf/as_2014091616204218.pdf" }],
  },
  millet: {
    system: { ar: "مطري تقليدي — كردفان ودارفور", en: "Traditional rainfed — Kordofan and Darfur" },
    seedKg: null,
    seedNote: { ar: "٢–٣ بذور في الجورة على ٧٥×٥٠ سم", en: "2–3 seeds per hill at 75×50 cm" },
    ureaKg: null,
    phosphate: { kind: "NPK", kg: [3.4, 3.4] },
    timing: { ar: "جرعة دقيقة ٠٫٣ جم في الجورة من NPK عند الزراعة", en: "Micro-dose of 0.3 g NPK per hill at sowing" },
    sprays: null,
    operations: { ar: "حراثة بالحفّار، معاملة البذور، زراعة يدوية (يونيو – يوليو)، نظافتان، خفّ", en: "Chisel tillage, seed dressing, hand sowing (June – July), two weedings, thinning" },
    sources: [{ label: "Hassan, Bakhit & Ahmed (ARC El-Obeid) 2020", url: "https://doiserbia.nb.rs/img/doi/1450-8109/2020/1450-81092001037H.pdf" }],
  },
  alfalfa: {
    system: { ar: "مروي — الخرطوم ونهر النيل والشمالية", en: "Irrigated — Khartoum, River Nile, Northern" },
    seedKg: [18, 18],
    seedNote: { ar: "٤٣٫٢ كجم للهكتار، أمثل معدّل للعلف", en: "43.2 kg/ha, the optimum for fodder" },
    ureaKg: null,
    phosphate: null,
    timing: null,
    sprays: null,
    operations: { ar: "حراثة قرصية، تنعيم، تسوية، تقنين على ٧٠ سم، نثر البذور، نظافة يدوية، حشّ كلّ ٢١–٣٥ يوماً", en: "Disc ploughing, harrowing, levelling, ridging at 70 cm, broadcasting, hand weeding, cutting every 21–35 days" },
    sources: [{ label: "Abdel-Rahman & Abu-Suwar 2012, citing Elkarouri 1977", url: "https://wasdlibrary.org/download/ijsr-v2-n2-2012-seeding-rate-alfalfa/" }],
  },
  dates: {
    system: { ar: "مروي — الشمالية ونهر النيل", en: "Irrigated — Northern and River Nile" },
    seedKg: null,
    seedNote: { ar: "فسائل على ٣–٤ أمتار، وذكر لكلّ ٥٠ أنثى", en: "Offshoots at 3–4 m, one male per 50 females" },
    ureaKg: null,
    phosphate: { kind: "NPK", kg: [0.5, 0.5] },
    timing: { ar: "سنوياً للنخلة الواحدة: ٠٫٥ كجم NPK و٣٠ كجم سماد عضوي", en: "Per palm per year: 0.5 kg NPK and 30 kg organic manure" },
    sprays: null,
    operations: { ar: "ريّ كلّ ١٠ أيام، تلقيح يدوي، خفّ العراجين، جني", en: "Irrigation every 10 days, hand pollination, bunch thinning, harvest" },
    sources: [{ label: "Yagoub 2013 (SUST), date palm in Northern Sudan — per palm", url: "https://repository.sustech.edu/handle/123456789/10879" }],
  },
};
