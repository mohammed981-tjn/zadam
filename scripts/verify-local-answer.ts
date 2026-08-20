import {
  answerLocally,
  bestEffortAnswer,
  type CanalFactRow,
  type LocalAnswerInput,
  type MarketRow,
} from "../src/lib/localAnswer";
import {
  getCachedAnswer,
  setCachedAnswer,
  clearAnswerCache,
} from "../src/lib/answerCache";
import type { RetrievableEntry } from "../src/lib/retrieval";
import {
  DEFAULT_CROP,
  TAW_MM_PER_M,
  irrigationInterval,
} from "../src/lib/soilWater";
import { STATIONS } from "../src/lib/agronomy";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const E = (
  crop: string,
  title: string,
  content: string,
  country = "السودان",
): RetrievableEntry => ({
  crop,
  topic: "general",
  title,
  content,
  source_country: country,
  source_note: null,
});

// A base wide enough that inverse document frequency behaves as it does in
// production; a three-entry base makes every term look rare. The two entries the
// knowledge assertions rely on are written at the length real entries run
// (54–167 words in the live base) so the substance gate is exercised honestly
// rather than tuned around.
const kb: RetrievableEntry[] = [
  E(
    "ري",
    "تقنية بونجرو الهندية لحقن مياه الفيضان",
    "بونجرو بئر واسع الفوهة يحفر في أرض المزرعة ويستقبل مياه الجريان السطحي في " +
      "موسم الأمطار بدل أن تضيع، فيحقنها في الطبقة الجوفية الضحلة تحت الحقل. " +
      "يُبطَّن أعلى البئر بطبقة رمل وحصى تعمل مرشحاً يمنع الطمي من سد المسام، " +
      "وتُنظَّف هذه الطبقة قبل كل موسم أمطار وإلا فقد البئر قدرته على الاستيعاب " +
      "خلال موسمين. المياه المحقونة تُسحب في الموسم الجاف من الآبار نفسها أو من " +
      "آبار مجاورة، فيرتفع منسوب الماء الجوفي في المنطقة كلها لا في المزرعة " +
      "وحدها. انتشرت التقنية في ولاية غوجارات حيث نفّذها المزارعون بتكلفة منخفضة " +
      "لأن الحفر يدوي في الغالب، ونجاحها مشروط بوجود طبقة نفاذة تحت التربة " +
      "السطحية، وهو ما يجب التحقق منه بحفرة اختبارية قبل الإنفاق.",
    "الهند",
  ),
  E(
    "بصل",
    "تخزين البصل الهندي في مخازن مهواة",
    "البصل من أسرع المحاصيل فساداً بعد الحصاد، والفقد في التخزين التقليدي قد " +
      "يبلغ نصف المحصول. المخزن المهوى الهندي بناء بسيط بجدران شبكية تسمح بمرور " +
      "الهواء من الجانبين وسقف مزدوج يمنع الحرارة المباشرة، وتُرص فيه البصلات في " +
      "طبقات لا يزيد عمقها عن متر حتى يصل الهواء إلى الوسط. الشرط الأهم قبل " +
      "التخزين هو التجفيف: تُترك البصلات في الظل حتى تجف الرقبة تماماً وتتكون " +
      "قشرة خارجية جافة، ولو خُزنت ورقبتها رطبة تعفنت وأعدت جيرانها. تُستبعد " +
      "البصلات المجروحة أو المزدوجة قبل الرص لأنها بؤرة العفن الأولى، ويُراجع " +
      "المخزن كل أسبوعين لإخراج أي بصلة بدأت تلين.",
    "الهند",
  ),
  E(
    "ثروة حيوانية",
    "نموذج أمول لتجميع الألبان",
    "الحليب يجمع يوميا وتقاس نسبه الدهون امام المربي ويدفع خلال 12 ساعه",
    "الهند",
  ),
  E(
    "أرز",
    "الأرز الهجين الصيني",
    "الارز الهجين يعطي انتاجيه اعلى لكن البذره تشترى كل موسم",
    "الصين",
  ),
  E(
    "تربة",
    "نموذج كوبوتشي لمكافحة التصحر",
    "تثبيت الكثبان بشبكات القش ثم زراعة شجيرات مقاومه للجفاف",
    "الصين",
  ),
  E("قطن", "خدمة القطن", "القطن يحتاج خف وتربيط ومكافحه دوديه اللوز", "السودان"),
  E("سمسم", "حصاد السمسم", "السمسم يحصد قبل تفتح الكبسولات لتقليل الفقد"),
  E("قمح", "تسميد القمح", "القمح يسمد على دفعتين يوريا عند التفريع وعند الطرد"),
  E("ذرة", "دودة الحشد الخريفية", "الحشد تهاجم القلب وتكافح مبكرا صباحا"),
  E("تسويق", "أسواق المزارعين", "التسويق الجماعي يرفع سعر المزارع"),
  E("ماشية", "تحصين الأبقار", "التحصين الدوري ضد الحمى القلاعيه ضروري"),
  E("بستنة", "شتلات الطماطم", "الشتل ينقل بعد اربعه اسابيع"),
];

const base = (question: string): LocalAnswerInput => ({
  question,
  entries: kb,
  projectCount: 0,
  investmentLive: false,
});

console.log("\nالمُجيب المحلي — بلا نموذج لغوي\n");

console.log("حالة المنصة:");
{
  const a = answerLocally(base("هل أستطيع الاستثمار الآن؟"));
  ok(a?.source === "platform", "سؤال استثماري يُجاب من حالة المنصة");
  ok(
    a?.answer.includes("لا توجد حالياً أي فرصة استثمار") === true,
    "الإجابة تنفي وجود فرص بدل اختلاقها",
  );

  const live = answerLocally({
    ...base("هل أستطيع الاستثمار الآن؟"),
    investmentLive: true,
  });
  ok(
    live?.source !== "platform",
    "عند تفعيل الاستثمار يتنحى المُجيب المحلي عن سؤال العرض",
  );

  const withProjects = answerLocally({
    ...base("هل أستطيع الاستثمار الآن؟"),
    projectCount: 2,
  });
  ok(
    withProjects?.source !== "platform",
    "وجود مشروع منشور يُخرج السؤال من المسار المحلي",
  );

  const finance = answerLocally(base("كيف يعمل تمويل صغار المزارعين في الهند؟"));
  ok(
    finance?.source !== "platform",
    'سؤال "تمويل" لا يُختطف إلى إشعار حالة المنصة',
  );
}

console.log("\nالحاسبة (FAO-56):");
{
  const a = answerLocally(base("كم متر مكعب يحتاج القمح في الجزيرة بالتنقيط؟"));
  ok(a?.source === "calculator", "سؤال مائي عن محصول يُحوَّل للحاسبة");
  ok(a?.answer.includes("الجزيرة") === true, "الموقع المذكور يُستخدم");
  ok(a?.answer.includes("ري بالتنقيط") === true, "طريقة الري المذكورة تُستخدم");
  ok(
    a?.answer.includes("متر مكعب للفدان") === true,
    "الإجابة تحمل رقماً بالمتر المكعب للفدان",
  );
  ok(
    a?.answer.includes("افترضتُ ما لم تذكره") === true,
    "ما لم يُذكر يُعلن كافتراض (شهر الزراعة هنا)",
  );

  const full = answerLocally(
    base("كم يحتاج القطن من مياه في كسلا بالغمر زراعة أغسطس؟"),
  );
  ok(
    full?.answer.includes("افترضتُ ما لم تذكره") === false,
    "حين يُذكر كل شيء لا تُطبع افتراضات",
  );

  // Not "no resolver answers this" any more — the crop calendar does, and
  // should. What must still hold is that it is not answered with a water
  // figure, which is what this check was guarding.
  const noWater = answerLocally(base("متى يُحصد القمح؟"));
  ok(
    noWater?.answer.includes("متر مكعب للفدان") !== true,
    "سؤال غير مائي لا يُجاب برقم ريّ",
  );

  const noCrop = answerLocally(base("كم يبلغ استهلاك المياه عموماً؟"));
  ok(noCrop?.source !== "calculator", "سؤال مائي بلا محصول لا يذهب للحاسبة");

  const alias = answerLocally(base("الاحتياج المائي للذرة الشامية"));
  ok(
    alias?.answer.includes("ذرة شامية") === true,
    'الاسم الأطول يفوز: "الذرة الشامية" لا "الذرة"',
  );
}

console.log("\nقاعدة المعرفة:");
{
  const a = answerLocally(base("ما هي تقنية بونجرو؟"));
  ok(a?.source === "knowledge", "سؤال يقع على مادة مُنسَّقة يُجاب منها");
  ok(a?.answer.includes("بونجرو") === true, "الإجابة تنقل نص المادة نفسها");
  ok(a?.answer.includes("الهند") === true, "الدولة المرجعية مذكورة");

  const storage = answerLocally(base("كيف أخزن البصل؟"));
  ok(storage?.source === "knowledge", "سؤال التخزين يجد مادته");

  const off = answerLocally(base("ما رأيك في أسعار العقارات في دبي؟"));
  ok(off === null, "سؤال خارج النطاق يُترك للنموذج بدل تلفيق إجابة");

  const vague = answerLocally(base("أخبرني عن الزراعة"));
  ok(
    vague === null || vague.confidence >= 0.6,
    "لا تُرجَع إجابة محلية دون عتبة الثقة",
  );

  // "الحشد" is a rare term, so it matches strongly — but the entry behind it is
  // a stub. A strong match on thin material must still go to the model.
  const thin = answerLocally(base("ما هي دودة الحشد الخريفية؟"));
  ok(thin === null, "مادة قصيرة لا تصلح إجابة قائمة بذاتها مهما قوي التطابق");
}

console.log("\nالمسار المتدهور (النموذج غير متاح):");
{
  const d = bestEffortAnswer("ما هي تقنية بونجرو؟", kb);
  ok(d !== null, "يُرجع أقرب المواد حين يتعذّر النموذج");
  ok(
    d?.answer.includes("لم أستطع الوصول") === true,
    "الإجابة المتدهورة تُعلن عن نفسها بوضوح",
  );
  ok(
    bestEffortAnswer("عقارات دبي والبورصة", kb) === null,
    "لا يُرجع مواد غير ذات صلة لمجرد ملء الفراغ",
  );
}

console.log("\nذاكرة الإجابات:");
{
  clearAnswerCache();
  const t0 = 1_000_000;
  setCachedAnswer("ما هو أفضل موعد لزراعة القمح؟", "نوفمبر", t0);

  ok(
    getCachedAnswer("ما هو أفضل موعد لزراعة القمح؟", t0 + 1000) === "نوفمبر",
    "السؤال نفسه يُخدم من الذاكرة",
  );
  ok(
    getCachedAnswer("ما هو افضل موعد لزراعه القمح", t0 + 1000) === "نوفمبر",
    "اختلاف الهمزة والتاء المربوطة وعلامة الاستفهام لا يُنشئ سؤالاً جديداً",
  );
  ok(
    getCachedAnswer("ما هو أفضل موعد لزراعة القمح؟", t0 + 31 * 60 * 1000) ===
      null,
    "الإجابة تنتهي صلاحيتها بعد ثلاثين دقيقة",
  );

  clearAnswerCache();
  for (let i = 0; i < 250; i++) setCachedAnswer(`سؤال رقم ${i}`, `جواب ${i}`, t0);
  ok(
    getCachedAnswer("سؤال رقم 0", t0) === null,
    "الأقدم يُطرد عند تجاوز السعة",
  );
  ok(
    getCachedAnswer("سؤال رقم 249", t0) === "جواب 249",
    "الأحدث باقٍ بعد الطرد",
  );
}


/* ------------------------------------------------------------------ *
 * The resolvers added to keep questions away from the model
 * ------------------------------------------------------------------ */

const CANAL_FACTS: CanalFactRow[] = [
  {
    key: "route_length",
    label: "طول المسار",
    value: "94",
    unit: "كم",
    status: "derived",
    source: "هندسة الطرفين",
    note: "نصف دائرة على الوتر بين الطرفين.",
  },
  {
    key: "static_lift",
    label: "الرفع الساكن من الخزان إلى القمّة",
    value: "64",
    unit: "م",
    status: "derived",
    source: "قياس SRTM ٣٠ م",
    note: null,
  },
  {
    key: "terminus_above_source",
    label: "ارتفاع النهاية فوق المصدر",
    value: "32",
    unit: "م",
    status: "derived",
    source: "قياس SRTM ٣٠ م",
    note: null,
  },
  {
    key: "pilot_design",
    label: "تصميم النواة الجنوبية",
    value: "قناة ١٫٩ م × محطة واحدة",
    unit: null,
    status: "derived",
    source: "حساب سودجري",
    note: null,
  },
  {
    key: "soil_survey",
    label: "مسح التربة وتصنيفها الزراعي",
    value: "طميية طينية · طين ٣٣٪",
    unit: null,
    status: "measured",
    source: "ISRIC SoilGrids",
    note: "عشر نقاط على طول المسار.",
  },
  {
    key: "water_permit",
    label: "إذن المياه من وزارة الري",
    value: null,
    unit: null,
    status: "unknown",
    source: "—",
    note: "قرارٌ لا قياس.",
  },
];

const MARKET: MarketRow[] = [
  {
    item: "Sorghum",
    year: 2024,
    sudan_kg_ha: "632.7",
    egypt_kg_ha: "5200",
    peer_median_kg_ha: 2783.4,
    sudan_export_usd_per_tonne: "357.78",
    regional_producer_usd_per_tonne: "321.13",
  },
];

/** The same base, plus the two tables the new resolvers read. */
const withData = (question: string): LocalAnswerInput => ({
  ...base(question),
  canalFacts: CANAL_FACTS,
  market: MARKET,
});

console.log("\nملفّ القناة:");
{
  const a = answerLocally(withData("كم طول القناة القوسية؟"));
  ok(a?.source === "canal", "سؤال عن القناة يُجاب من الملفّ");
  ok(a?.answer.includes("94") === true, "ويحمل الرقم نفسه من الجدول");

  // The blank rows are the ones a model would most confidently invent.
  const permit = answerLocally(withData("هل عندكم إذن المياه للقناة القوسية؟"));
  ok(
    permit?.answer.includes("لم يُحدَّد بعد") === true,
    "وسؤالٌ عن بندٍ فارغ يُجاب بأنه غير محدَّد، لا بصمت",
  );
  ok(
    permit?.answer.includes("غير معروف") === true,
    "وحالة البند معروضة مع الإجابة",
  );

  const vague = answerLocally(withData("حدثني عن القناة القوسية"));
  ok(
    vague?.source === "canal" && vague.answer.includes("أربعة أرقام"),
    "وسؤال عام عن القناة يُجاب بالخلاصة لا بصفوف عشوائية",
  );

  // Without the table the resolver must stand down rather than half-answer.
  ok(
    answerLocally(base("كم طول القناة القوسية؟"))?.source !== "canal",
    "وبلا جدول لا يجيب هذا المُجيب إطلاقاً",
  );
}

console.log("\nالسوق — الغلّة والسعر:");
{
  const a = answerLocally(withData("كم غلة الذرة الرفيعة في السودان؟"));
  ok(a?.source === "market", "سؤال عن الغلّة يُجاب من FAOSTAT");
  ok(a?.answer.includes("633") === true, "بالرقم المنشور لا بتقدير");
  ok(a?.answer.includes("2024") === true, "ومعه سنته");
  ok(
    a?.answer.includes("4.4") === true,
    "ونسبة وسيط الأقران إلى غلّة السودان محسوبة",
  );

  // A water question about the same crop must still reach the calculator.
  const water = answerLocally(withData("كم يحتاج فدان الذرة الرفيعة من الماء؟"));
  ok(
    water?.source === "calculator",
    "وسؤال الماء عن المحصول نفسه يبقى للحاسبة",
  );

  ok(
    answerLocally(base("كم غلة الذرة الرفيعة؟"))?.source !== "market",
    "وبلا بيانات سوق لا يجيب",
  );
}

console.log("\nالتقويم الزراعي:");
{
  const a = answerLocally(withData("متى أزرع القمح؟"));
  ok(a?.source === "calculator", "سؤال الموعد يُجاب من جدول المحاصيل");
  ok(a?.answer.includes("نوفمبر") === true, "بشهر الزراعة المعتاد");
  ok(
    a?.answer.includes("يوماً") === true && a.answer.includes("الحصاد"),
    "وبطول الموسم وشهر الحصاد",
  );

  // The harvest month must come from walking real month lengths.
  const cane = answerLocally(withData("متى أزرع قصب السكر وكم يستغرق؟"));
  ok(cane?.answer.includes("مارس") === true, "والقصب يُزرع في مارس");
}

console.log("\nالمناخ:");
{
  const a = answerLocally(withData("كم درجة الحرارة في دنقلا؟"));
  ok(a?.source === "climate", "سؤال المناخ يُجاب من المحطات");
  ok(a?.answer.includes("المطر السنوي") === true, "ومعه المطر السنوي");

  const month = answerLocally(withData("كم الحرارة في الخرطوم في يونيو؟"));
  ok(
    month?.answer.includes("يونيو") === true,
    "وشهرٌ مسمّى يُجاب بشهره",
  );

  // A place with no station name in it is not a climate question this can answer.
  ok(
    answerLocally(withData("كم الحرارة في مكان ما؟"))?.source !== "climate",
    "وبلا محطة مسمّاة لا يخترع موقعاً",
  );
}


console.log("\nالتربة والمياه بالعامية — أكبر فجوة في السجلّ:");
{
  /*
   * These are not invented phrasings. Every string below was typed by a real
   * visitor and logged in assistant_questions, misspellings included — twenty
   * of the twenty-six such questions went unanswered before this resolver
   * existed. Testing against the log rather than against tidy Arabic is the
   * whole point: «واسطة» and «عطسانة» are what people actually wrote.
   */
  const fromTheLog = [
    "الواطة العطشانة",
    "الواطة عطشانه",
    "الواطة عطسانة",
    "الواسطة الرويانة",
    "الواطة الرويانة",
    "المويه بتنشف بسرعة في الرملة",
    "بتنشف بسرعة في الرملة",
    "المي بتنشف سريع في الواطة",
    "الواطة العطشانة علاجه شنو",
    "الواطة العطشانة دحين كيف اعالجها",
    "تعمل شنو لو واطاطي عطشت شديد",
    "الموية عطشانه",
    "الرويانة العطشانة",
  ];
  const answered = fromTheLog.filter((q) => answerLocally(base(q)) !== null);
  ok(
    answered.length === fromTheLog.length,
    `${answered.length}/${fromTheLog.length} من أسئلة السجلّ الحقيقية تُجاب بلا نموذج`,
  );

  const a = answerLocally(base("الواطة العطشانة"));
  ok(
    a?.answer.includes("لا تحتاج ماءً أكثر") === true,
    "والجواب يبدأ بالنتيجة المضادّة للحدس: الكمية نفسها بوتيرة أقرب",
  );
  ok(
    /ريّة كل \d/.test(a?.answer ?? ""),
    "ويحمل فترةً محسوبة بالأيام لا نصيحة عامة",
  );

  // The finding only holds if the two intervals really differ by roughly the
  // ratio of what the two soils hold. If that stops being true the answer's
  // whole argument is wrong.
  const sand = irrigationInterval(DEFAULT_CROP, STATIONS[0], 6, "flood", "sand");
  const clay = irrigationInterval(DEFAULT_CROP, STATIONS[0], 6, "flood", "clay loam");
  ok(
    sand !== null && clay !== null && clay.days > sand.days * 2,
    `الطينية تصبر ${clay!.days.toFixed(1)} يوماً والرملية ${sand!.days.toFixed(1)} — الفارق أكثر من الضعف`,
  );
  const ratio = clay!.days / sand!.days;
  const holdRatio = TAW_MM_PER_M["clay loam"] / TAW_MM_PER_M["sand"];
  ok(
    Math.abs(ratio - holdRatio) < 0.01,
    `ونسبة الفترتين ${ratio.toFixed(2)} هي نسبة ما تمسكه التربتان ${holdRatio.toFixed(2)}`,
  );

  // A bare noun is not a question, and guessing at it would be worse than
  // passing it on.
  ok(
    answerLocally(base("الواطة")) === null,
    "و«الواطة» وحدها لا تُجاب — اسمٌ بلا سؤال",
  );
}

console.log("\nماذا يستطيع المساعد:");
{
  const a = answerLocally(base("ماهي إمكانياتك"));
  ok(a?.source === "platform", "سؤال القدرات يُجاب من المنصّة");
  ok(
    a?.answer.includes("FAO-56") === true,
    "بقائمة مبنيّة على ما تفعله المُجيبات فعلاً",
  );

  // The one that used to be answered with a menu instead of an answer.
  const trap = answerLocally(base("تعمل شنو لو واطاطي عطشت شديد"));
  ok(
    trap?.source === "calculator",
    "و«تعمل شنو لو واطاطي عطشت» سؤال تربة لا سؤال قدرات",
  );
}

console.log(
  `\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`,
);
process.exit(fail === 0 ? 0 : 1);
