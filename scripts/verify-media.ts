import { publicMediaUrl, safeSourceUrl } from "../src/lib/media";

/**
 * The credit link on the canal page is the one place where an administrator's
 * free text becomes an href on a public page. These checks are the boundary.
 */

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

console.log("\nرابط المصدر — ما يمرّ وما لا يمرّ\n");

for (const url of [
  "https://example.org/photo",
  "http://example.org/photo?a=1",
  "https://ar.wikipedia.org/wiki/النيل",
]) {
  ok(safeSourceUrl(url) !== null, `يمرّ: ${url}`);
}

// The whole reason the function exists. An anchor whose href is javascript: is
// stored cross-site scripting the moment a visitor clicks it.
for (const url of [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "  javascript:alert(1)  ",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
]) {
  ok(safeSourceUrl(url) === null, `يُرفض: ${url.trim()}`);
}

// Not a citation, and not an absolute URL either.
for (const url of ["", "   ", "example.org", "/local/path", "ليس رابطاً"]) {
  ok(safeSourceUrl(url) === null, `فارغ أو نسبي يصير null: «${url}»`);
}

console.log("\nروابط الملفات العامّة:");
{
  const url = publicMediaUrl("canal/abc.jpg");
  ok(
    url.endsWith("/storage/v1/object/public/media/canal/abc.jpg"),
    `المسار العام صحيح البنية — ${url}`,
  );
  ok(!url.includes("?token="), "ولا رمز فيه — الدلو عام لا موقّع");
}

console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
process.exit(fail === 0 ? 0 : 1);
