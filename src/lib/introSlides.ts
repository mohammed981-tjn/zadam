/**
 * شاشاتُ التعريف بعد الشعار (البند ٢٠٠؛ المالك، 25 أكتوبر 2026: «ثلاث او
 * أربعة… تشرح ماتقدمه المنصة، ستكتب النص»). Four screens, one for each thing a
 * newcomer should know before the first page: the land, the investor, the
 * market, and the services up to export. Each claim is one the platform makes
 * good on today; the pictures are the platform's own (public/photos).
 */
export type IntroSlide = {
  photo: string;
  title: [ar: string, en: string];
  body: [ar: string, en: string];
};

export const SLIDES: IntroSlide[] = [
  {
    photo: "/photos/land-survey.webp",
    title: ["أرضك موثّقة ومعروفة", "Your land, verified and known"],
    body: [
      "سجّل أرضك مجّاناً، يوثّقها معاينٌ من سوداقري، وتعرف تربتها ومطرها وماءها من الأقمار الصناعيّة.",
      "Register your land free. A Sudagri inspector verifies it, and satellites tell you its soil, rain and water.",
    ],
  },
  {
    photo: "/photos/irrigated-plain.webp",
    title: ["للمستثمر: شراكةٌ بعقدٍ ودليل", "For investors: a partnership with a contract and proof"],
    body: [
      "فرصٌ على أراضٍ موثّقة، وعقدٌ يُوقَّع على المنصّة، ولا يُدفع نصيب مرحلةٍ قبل أن تُثبَت.",
      "Opportunities on verified land, a contract signed on the platform, and no stage paid before it is proved.",
    ],
  },
  {
    photo: "/photos/grain-soil.webp",
    title: ["السوق والأسعار كلّ يوم", "The market and its prices, every day"],
    body: [
      "أسعار بورصة القضارف وسوق الأبيض، وصرف الجنيه، والمدخلات والوقود، وعروض البيع والشراء.",
      "Gedaref and El Obeid crop prices, the pound's exchange rate, inputs and fuel, and offers to buy and sell.",
    ],
  },
  {
    photo: "/photos/export-store.webp",
    title: ["من البذرة إلى الصادر", "From seed to export"],
    body: [
      "شركاتٌ موثّقة للحراثة والريّ والحصاد والنقل، وملفّ الصادر، ومساعدٌ ذكيّ يجيبك بالعربيّة.",
      "Verified companies for ploughing, irrigation, harvest and transport, the export file, and an assistant that answers you.",
    ],
  },
];
