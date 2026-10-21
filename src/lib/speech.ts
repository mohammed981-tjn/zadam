import { tr, type Locale } from "@/lib/i18n";

/**
 * «قُل سؤالك» (البند ١١٩): الميكروفون بدل الكتابة، بمحرّك التعرّف الذي في المتصفّح نفسه.
 *
 * Chrome on Android hands the audio to its own recogniser and returns text:
 * no key, no bill, and nothing passes through Sudagri. Firefox has no
 * recogniser and the button hides where there is none. The recogniser has no
 * Sudanese locale (docs/studies/what-sudagri-lacks-ar.md), so the nearest
 * Arabic it knows is asked for, and what it heard lands in the box for the
 * farmer to correct before sending — a misheard word is a wrong answer.
 */

export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionCtor = new () => RecognitionLike;

/** The browser's recogniser, under either of its two names, or null where it has none. */
export function recognitionCtor(w: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  if (!w || typeof w !== "object") return null;
  const g = w as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/**
 * Egyptian Arabic is the recogniser's nearest dialect to Sudanese; the
 * Gulf locales are further. English stays British, as the site's English is.
 */
export function speechLang(locale: Locale): string {
  return locale === "en" ? "en-GB" : "ar-EG";
}

/** The best alternative of every result so far, joined — interim ones too, so the box fills while the farmer speaks. */
export function collectTranscript(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.length > 0) parts.push(r[0].transcript);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** What to tell the farmer when the recogniser gives up; empty when there is nothing worth saying. */
export function speechErrorText(code: string, locale: Locale): string {
  switch (code) {
    case "aborted":
      return "";
    case "no-speech":
      return tr(locale, "لم أسمع شيئاً. اضغط الميكروفون وتكلّم بعد الضغط مباشرةً.", "I heard nothing. Press the microphone and speak right after pressing.");
    case "not-allowed":
    case "service-not-allowed":
      return tr(locale, "اسمح للموقع باستعمال الميكروفون من إعدادات المتصفّح ثمّ جرّب مرّةً أخرى.", "Allow the site to use the microphone in the browser settings, then try again.");
    case "audio-capture":
      return tr(locale, "لم أجد ميكروفوناً على هذا الجهاز.", "No microphone was found on this device.");
    case "network":
      return tr(locale, "الإملاء بالصوت يحتاج إلى اتّصال بالشبكة. تحقّق منها ثمّ جرّب.", "Voice dictation needs a network connection. Check it and try again.");
    default:
      return tr(locale, "تعذّر الإملاء بالصوت الآن. اكتب سؤالك.", "Voice dictation is not working right now. Type your question.");
  }
}
