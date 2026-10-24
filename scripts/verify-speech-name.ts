/**
 * نطق اسم المنصّة (البند ١٤٥): ما يُعطى للصوت يحمل «سُودَاكْرِي» لا «سوداقري»،
 * وما يُكتب على الشاشة لا يتغيّر. والأسطر المنطوقة في الأفلام (tts/lines.json) لا يبقى فيها
 * الاسمُ بكتابةٍ غير التي اختارها المالك إلا في أسطرٍ لا يستعملها فيلمٌ قائم.
 *
 *   npx tsx scripts/verify-speech-name.ts
 */
import { readFileSync } from "node:fs";
import { SPOKEN_BRAND, brandForSpeech } from "../src/lib/speechName";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

ok(SPOKEN_BRAND === "سُودَاكْرِي", "the spoken name is the one the owner chose (line g5)");
ok(brandForSpeech("مرحباً بك في سوداقري") === "مرحباً بك في سُودَاكْرِي", "the name alone is respelled");
ok(brandForSpeech("أرسلنا إلى فريق سوداقري، ثم سوداقري") === "أرسلنا إلى فريق سُودَاكْرِي، ثم سُودَاكْرِي", "every occurrence is respelled");
ok(brandForSpeech("بسوداقري وللسوداقري").includes("بسُودَاكْرِي"), "a letter stuck to the front is kept");
ok(brandForSpeech("لا اسم هنا") === "لا اسم هنا", "text without the name is untouched");
ok(!brandForSpeech("سوداقري").includes("سوداقري"), "no written form is left");

// The vowelled name is spelled the same everywhere in the narration.
const lines: { id: string; text: string; diac?: boolean }[] = JSON.parse(readFileSync("tts/lines.json", "utf8"));
const g5 = lines.find((l) => l.id === "g5");
ok(!!g5 && g5.text.startsWith(SPOKEN_BRAND), "line g5 (the owner's choice) starts with the spoken name");
const films = JSON.parse(readFileSync("film/investors/shots.json", "utf8")) as { line: string }[];
const used = new Set(films.map((s) => s.line));
const marks = /[ً-ْ]/g;
const spoken = lines.filter((l) => used.has(l.id) && /سودا[كگقڨجغ]ري/.test(l.text.replace(marks, "")));
ok(spoken.length > 0 && spoken.every((l) => l.text.includes(SPOKEN_BRAND)), `every line the investors' film uses that says the name says it as chosen (${spoken.map((l) => l.id).join(", ")})`);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
