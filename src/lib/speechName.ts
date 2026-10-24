/**
 * اسم المنصّة كما يُنطق (البند ١٤٥). المالك اختار من ستّ كتاباتٍ للاسم «سُودَاكْرِي»
 * (٢٣ أكتوبر) وطلب أن تُعتمد في المنصّة كلّها: الكتابة العاديّة «سوداقري» يقرؤها صوتُ
 * الهاتف بقافٍ فصيحة، والنطق السودانيّ للقاف قريبٌ من الكاف.
 *
 * The name stays «سوداقري» wherever it is written on screen; only what is handed to a
 * voice is respelled, with every vowel and without tanween, as the investors' film says it
 * (tts/lines.json, line 61). A letter stuck to the front of the name («بسوداقري») is untouched.
 */
export const SPOKEN_BRAND = "سُودَاكْرِي";

/** Arabic text with the brand respelled for a voice. */
export function brandForSpeech(text: string): string {
  return text.replaceAll("سوداقري", SPOKEN_BRAND);
}
