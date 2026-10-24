/**
 * الترويسات الأمنيّة (SEC-11 وAUTH-22، البند ١٦٣): كلّ صفحةٍ تمنع الإطار ونوعَ الملف المخمَّن وتحدّ المُحيل،
 * والصلاحيّات التي يستعملها الموقع (الموقع والميكروفون والكاميرا) مسموحةٌ للموقع نفسه، وعاملُ الخدمة
 * يبقى بسياسته الأشدّ، ولا يعلن الخادمُ اسمَ الإطار.
 *
 *   npx tsx scripts/verify-security-headers.ts
 */
import config from "../next.config";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

async function main() {
  const rules = await config.headers!();
  const everyPage = rules.find((r) => r.source === "/:path*");
  const header = (name: string) => everyPage?.headers.find((h) => h.key === name)?.value ?? "";

  ok(!!everyPage, "there is a rule for every page");
  ok(header("X-Content-Type-Options") === "nosniff", "nosniff");
  ok(header("X-Frame-Options") === "DENY", "X-Frame-Options: DENY (older browsers)");
  ok(header("Content-Security-Policy") === "frame-ancestors 'none'", "frame-ancestors 'none' — and nothing more, so no script or tile is blocked");
  ok(header("Referrer-Policy") === "strict-origin-when-cross-origin", "the referrer is cut to the origin for other sites");
  const perms = header("Permissions-Policy");
  ok(/geolocation=\(self\)/.test(perms), "the site may ask for the location (land, maps)");
  ok(/microphone=\(self\)/.test(perms), "the site may ask for the microphone (the assistant by voice)");
  ok(/camera=\(self\)/.test(perms), "the site may ask for the camera (evidence photos)");
  ok(/payment=\(\)/.test(perms) && /usb=\(\)/.test(perms), "payment and usb are shut");

  // The service worker's own rule comes after, so its stricter CSP and no-store win for the same key.
  const swIndex = rules.findIndex((r) => r.source === "/sw.js");
  ok(swIndex > rules.indexOf(everyPage!), "the service worker's rule comes after the general one");
  ok(
    rules[swIndex].headers.some((h) => h.key === "Content-Security-Policy" && h.value.includes("script-src 'self'")),
    "and keeps its own script-src 'self'",
  );
  ok(config.poweredByHeader === false, "the server does not announce Next.js");

}

main().then(() => {
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK");
});
