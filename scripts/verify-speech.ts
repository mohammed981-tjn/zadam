/**
 * «قُل سؤالك»: المحرّك يُلتقط باسميه أو لا يُلتقط، والنصّ يُجمع من كلّ النتائج،
 * والعربيّة تُطلب بأقرب لهجةٍ يعرفها المحرّك، والخطأ يُقال بما يفيد.
 */
import { collectTranscript, recognitionCtor, speechErrorText, speechLang } from "../src/lib/speech";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

class Fake {}
ok(recognitionCtor(undefined) === null && recognitionCtor(null) === null && recognitionCtor({}) === null, "no recogniser: null, and the button hides");
ok(recognitionCtor({ webkitSpeechRecognition: Fake }) === Fake, "Chrome's prefixed name is found");
ok(recognitionCtor({ SpeechRecognition: Fake }) === Fake, "and the standard one");
ok(recognitionCtor({ SpeechRecognition: Fake, webkitSpeechRecognition: class {} }) === Fake, "the standard one first when both exist");

ok(speechLang("ar") === "ar-EG" && speechLang("en") === "en-GB", "Arabic is asked for as Egyptian, the nearest dialect; English as British");

ok(collectTranscript([]) === "", "nothing heard: empty");
ok(collectTranscript([[{ transcript: "كم " }], [{ transcript: " ماء يحتاج" }, { transcript: "x" }], [{ transcript: "القمح" }]]) === "كم ماء يحتاج القمح", "the best alternative of every result, joined and trimmed");
ok(collectTranscript([[{ transcript: "a" }], []]) === "a", "an empty result is skipped");

ok(speechErrorText("aborted", "ar") === "", "a cancelled dictation says nothing");
ok(speechErrorText("not-allowed", "ar").includes("اسمح") && speechErrorText("service-not-allowed", "ar").includes("اسمح"), "a refused microphone asks for permission");
ok(speechErrorText("no-speech", "ar").includes("لم أسمع"), "silence says so");
ok(speechErrorText("network", "en").toLowerCase().includes("network"), "and a dropped network, in the reader's language");
ok(speechErrorText("whatever", "ar").includes("اكتب"), "anything else: type it");

if (fail) {
  console.error(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log("\nspeech: all checks passed");
