/**
 * «صوّر وأسأل»: الصورة تُقبل بصيغها الثلاث وحدها وبحدّ حجمها، وما سواها يُرفض
 * قبل أن يصل إلى نموذج؛ والسلسلة لا ترسل صورةً إلى محرّكٍ لا يراها.
 */
import { PHOTO_MAX_BASE64, PHOTO_SYSTEM_PROMPT, readImage } from "../src/lib/assistantPhoto";
import { generateWithFallback, type Engine } from "../src/lib/engines";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const b64 = "/9j/4AAQSkZJRgABAQ==";
ok(readImage(undefined) === null && readImage(null) === null, "no photo: null, and the text path runs");
const jpeg = readImage({ mime: "image/jpeg", data: b64 });
ok(jpeg !== null && jpeg !== "bad" && jpeg.mime === "image/jpeg", "a JPEG is read");
ok(readImage({ mime: "image/webp", data: b64 }) !== "bad" && readImage({ mime: "image/png", data: b64 }) !== "bad", "PNG and WebP too");
ok(readImage({ mime: "image/gif", data: b64 }) === "bad", "a GIF is refused");
ok(readImage({ mime: "text/html", data: b64 }) === "bad", "a non-image type is refused");
ok(readImage({ mime: "image/jpeg", data: "" }) === "bad", "an empty body is refused");
ok(readImage({ mime: "image/jpeg", data: "a".repeat(PHOTO_MAX_BASE64 + 1) }) === "bad", "a body over the limit is refused");
ok(readImage({ mime: "image/jpeg", data: "not base64 !!" }) === "bad", "a body that is not base64 is refused");
ok(readImage("string") === "bad" && readImage(42) === "bad", "a wrong shape is refused");

ok(PHOTO_SYSTEM_PROMPT.includes("لا تشخيص") && PHOTO_SYSTEM_PROMPT.includes("لا تذكر جرعة"), "the prompt forbids a diagnosis and a dose");
ok(/الطبيب البيطريّ|البيطري/.test(PHOTO_SYSTEM_PROMPT) && /المرشد الزراعيّ|وقاية النباتات/.test(PHOTO_SYSTEM_PROMPT), "and sends the reader to the vet and the extension officer");

// ── السلسلة مع صورة ──
const log: string[] = [];
const textOnly: Engine = { name: "text", generate: async () => { log.push("text"); return "نصّ"; } };
const seeing: Engine = {
  name: "eyes",
  generate: async () => "نصّ",
  generateWithImage: async (_s, _u, img) => { log.push(`eyes:${img.mime}`); return "أرى ورقة"; },
};
const img = { mime: "image/jpeg", data: b64 };

(async () => {
  let r = await generateWithFallback([textOnly, seeing], "s", "u", img);
  ok(r.result?.engine === "eyes" && log.join(",") === "eyes:image/jpeg", "with a photo, the text-only engine is skipped and the seeing one answers");
  r = await generateWithFallback([textOnly], "s", "u", img);
  ok(r.result === null && r.attempts.length === 1 && r.attempts[0].engine === "-", "no seeing engine: null, with the reason recorded as an attempt");
  log.length = 0;
  r = await generateWithFallback([textOnly, seeing], "s", "u");
  ok(r.result?.engine === "text" && log.join(",") === "text", "without a photo the chain is unchanged");

  if (fail) {
    console.error(`\n${fail} check(s) failed`);
    process.exit(1);
  }
  console.log("\nassistant photo: all checks passed");
})();
