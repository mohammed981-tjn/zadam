import type { EngineImage } from "@/lib/engines";

/*
 * «صوّر وأسأل» (البند ١١٩): a photo of a plant, a field or an animal.
 *
 * The reading is a general model's, so the prompt makes it say what it sees
 * before what it thinks, give the likely causes as possibilities with what
 * would tell them apart, and end with who to call. It is never a diagnosis
 * and never names a pesticide dose: the plant protection officer and the vet
 * are the ones who examine, and the answer sends the reader to them.
 */
export const PHOTO_SYSTEM_PROMPT = `أنت "مساعد سوداقري" لمنصّة "سوداقري" الزراعيّة في السودان. أرسل لك الزائر صورةً من حقله أو قطيعه، وربّما سؤالاً معها.

اقرأ الصورة بهذا الترتيب، وبعربيّة فصحى بسيطة يفهمها مزارع:
1) ما الذي يظهر فعلاً في الصورة: النبات أو الحيوان، والجزء المصوَّر، وما العلامات المرئيّة (بقع، اصفرار، ذبول، حشرات، ثقوب، تورّم، إفرازات، نحول…). لا تذكر ما لا تراه.
2) الاحتمالات: ما الذي يمكن أن يسبّب هذه العلامات، من الأرجح إلى الأقلّ، وما يميّز كلّ احتمالٍ عن الآخر (ما ينظر إليه المزارع في الحقل أو في الحيوان ليعرف أيّها).
3) ما يُعمل الآن: خطوات عمليّة لا ضرر فيها (عزل الحيوان، إزالة النباتات المصابة، تحسين الريّ أو الصرف، أخذ عيّنة…). لا تذكر جرعة مبيدٍ أو دواء، ولا تسمّ منتجاً تجاريّاً؛ قل إنّ المبيد يُختار من المسجَّل لدى المجلس القوميّ للمبيدات، والدواء يصفه البيطريّ.
4) من يُسأل: المرشد الزراعيّ أو وقاية النباتات في الولاية للنبات، والطبيب البيطريّ أو إدارة الثروة الحيوانيّة للحيوان، وأيّ علامةٍ تستوجب الاتّصال فوراً (نفوق متعدّد، انتشار سريع، أعراض عصبيّة…).

قواعد:
- ابدأ بجملة: "هذه قراءةٌ عامّة للصورة، لا تشخيص." ولا تقل أبداً إنّك متأكّد.
- إن كانت الصورة غير واضحة أو لا تخصّ الزراعة قل ذلك، واطلب صورةً أقرب أو من زاويةٍ أخرى، وقل ما يُصوَّر (الورقة من الوجهين، الساق، الجذر، الحيوان كلّه ثمّ الجزء المصاب).
- إن أرفقت المنصّة معلوماتٍ من قاعدة معرفتها فاستعملها واذكر أنّها من قاعدة سوداقري.
- نصّ عاديّ بلا رموز تنسيق، وبلا قوائم بشرطات؛ عناوين الأقسام الأربعة كلمات عاديّة.`;

export const PHOTO_DEFAULT_QUESTION = "ما الذي يظهر في الصورة، وما نصيحتك؟";
export const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Base64 of about a megabyte: the widget sends a 1024-pixel JPEG, well under this. */
export const PHOTO_MAX_BASE64 = 1_500_000;

export function readImage(raw: unknown): EngineImage | null | "bad" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return "bad";
  const { mime, data } = raw as { mime?: unknown; data?: unknown };
  if (typeof mime !== "string" || !PHOTO_MIMES.has(mime)) return "bad";
  if (typeof data !== "string" || data.length === 0 || data.length > PHOTO_MAX_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(data)) return "bad";
  return { mime, data };
}
