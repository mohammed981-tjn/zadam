/**
 * مساعدة في مكانها — بديل دليل المستخدم المنفصل.
 *
 * There are three ways to explain a platform, and two of them fail.
 *
 * One long manual fails because nobody reads a manual before using a form, and
 * because it drifts: it says what used to be true, and the reader has no way to
 * tell which parts. A help page per screen fails for the same reason multiplied
 * by the number of screens, and it clutters every page with a door most
 * visitors never open.
 *
 * What works is three layers, each doing one job and no more:
 *
 *   1. The screen explains itself, in one plain sentence at the point of the
 *      decision. That is <Explain> and the teaching empty states.
 *   2. The assistant answers whatever the sentence did not cover — and it
 *      already exists, already reads the knowledge base, and is already the
 *      thing a confused visitor reaches for. It only lacked one thing: knowing
 *      which page the question was asked from.
 *   3. /guide stays the single reference, and it derives its numbers from the
 *      code it documents, so it cannot go stale.
 *
 * This file is layer 2. It maps a path to a short description of what that
 * screen is for and the questions people actually ask on it, so "ما هذا؟" typed
 * on the contract builder is answered about contracts rather than in general.
 *
 * Kept deliberately short: this is context for a model, not documentation for a
 * human. Anything a human needs to read belongs on the screen itself.
 */

export interface PageHelp {
  /** What this screen is for, in one sentence. */
  purpose: string;
  /** The questions visitors actually ask here, to steer a vague one. */
  common: string[];
}

const HELP: Record<string, PageHelp> = {
  "/services": {
    purpose:
      "كتالوج الخدمات الزراعية التعاقدية: مسح بالدرون، تسوية، تصميم وتنفيذ ري حديث، ميكنة، إرشاد، وخدمات بيطرية. يعرض تعريف كل خدمة ووحدة قياسها والمزوّدين الموثّقين لها.",
    common: [
      "كيف يُحسب سعر الخدمة؟",
      "ما معنى أن الكمية تُشتق من الموسم؟",
      "كيف أصبح مقدّم خدمة موثّقاً؟",
    ],
  },
  "/services/register": {
    purpose:
      "تسجيل جهة تقدّم خدمات زراعية. التسجيل لا يعني التوثيق — الإدارة تراجع الجهة قبل ظهورها في الكتالوج.",
    common: [
      "ما الفرق بين التسجيل والتوثيق؟",
      "ما البيانات المطلوبة؟",
      "متى أستطيع استقبال طلبات تعاقد؟",
    ],
  },
  "/contracts": {
    purpose:
      "عقود الخدمات الخاصة بالمستخدم، سواء كان طرفاً طالباً للخدمة أو مقدّماً لها. كل عقد مقسّم إلى مراحل لكل منها تاريخ ومبلغ وإثبات.",
    common: [
      "لماذا لا أستطيع اعتماد مرحلة؟",
      "متى تُدفع كل مرحلة؟",
      "ما الفرق بين مسودة وعقد سارٍ؟",
    ],
  },
  "/contracts/new": {
    purpose:
      "بناء عقد خدمات على موسم قائم. الكميات تُشتق من الموسم — المساحة بالفدان، والاحتياج المائي بمعادلة FAO-56 — والتواريخ من مراحل المحصول، ولا تُكتب يدوياً.",
    common: [
      "لماذا لا أستطيع تعديل الكمية؟",
      "من أين جاء رقم المتر المكعب؟",
      "هل العقد يلزمني فور إنشائه؟",
    ],
  },
  "/seasons": {
    purpose:
      "المواسم الزراعية للمستخدم، بخططها المشتقة من نموذج FAO-56: تواريخ المراحل، واحتياج كل مرحلة من الماء، وحصتها من الميزانية.",
    common: [
      "كيف أضيف موسماً؟",
      "لماذا لا أستطيع اعتماد مرحلة؟",
      "كيف أربط الموسم بمشروع؟",
    ],
  },
  "/seasons/new": {
    purpose:
      "إنشاء موسم زراعي. يولّد النظام خطة المراحل وتواريخها واحتياجها المائي من المحصول والمنطقة وتاريخ الزراعة.",
    common: [
      "ما معنى المحطة المناخية؟",
      "كيف يُحسب الاحتياج المائي؟",
      "هل يجب ربط الموسم بمشروع؟",
    ],
  },
};

/**
 * The help entry for a path, matching the most specific prefix first.
 *
 * `/contracts/new` must not be answered as `/contracts`, so the longer key
 * wins; an unknown path returns null and the assistant answers as it always
 * has, with no page context and no invented one.
 */
export function helpForPath(pathname: string): PageHelp | null {
  const keys = Object.keys(HELP).sort((a, b) => b.length - a.length);
  const match = keys.find((k) => pathname === k || pathname.startsWith(`${k}/`));
  return match ? HELP[match] : null;
}

/** The page context as one line for the model, or empty when there is none. */
export function pageContextLine(pathname: string): string {
  const help = helpForPath(pathname);
  if (!help) return "";

  return [
    `الزائر يسأل من صفحة: ${pathname}`,
    `وظيفة الصفحة: ${help.purpose}`,
    `أسئلة شائعة هنا: ${help.common.join(" / ")}`,
    "إن كان السؤال عاماً أو غامضاً، فسّره في سياق هذه الصفحة أولاً.",
  ].join("\n");
}
