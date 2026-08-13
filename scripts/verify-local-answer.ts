import {
  answerLocally,
  bestEffortAnswer,
  type LocalAnswerInput,
} from "../src/lib/localAnswer";
import {
  getCachedAnswer,
  setCachedAnswer,
  clearAnswerCache,
} from "../src/lib/answerCache";
import type { RetrievableEntry } from "../src/lib/retrieval";

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

  const noWater = answerLocally(base("متى يُحصد القمح؟"));
  ok(noWater?.source !== "calculator", "سؤال غير مائي لا يذهب للحاسبة");

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

console.log(
  `\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`,
);
process.exit(fail === 0 ? 0 : 1);
