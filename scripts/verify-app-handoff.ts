/**
 * تسليم الجلسة إلى التطبيق بعد الدخول بـGoogle (البند ١٧٣): الختم لا يفتحه إلا من يحمل السرّ، خلال دقيقتين.
 *
 *   npx tsx scripts/verify-app-handoff.ts
 */
import { randomBytes } from "node:crypto";

let failed = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) failed++;
};

async function main() {
  const prior = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-one";
  const { sealSession, openSession, challengeOf, CHALLENGE } = await import("../src/lib/appHandoff");

  const verifier = randomBytes(32).toString("base64url");
  const challenge = challengeOf(verifier);
  // Long enough that a random seal cannot contain them by chance ("r1" did, one run in eight).
  const session = { access_token: "access.token.that-must-not-show", refresh_token: "refresh-token-that-must-not-show", expires_at: 1_900_000_000 };
  const now = 1_800_000_000_000;

  console.log("\nأ) من يحمل السرّ يأخذ جلسته");
  ok(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
     "البصمة بصمة PKCE نفسها (RFC 7636، الملحق ب)، كما يحسبها التطبيق (mobile/test/oauth_test.dart)");
  ok(CHALLENGE.test(challenge), "البصمة ٤٣ حرفاً base64url");
  const sealed = sealSession(session, challenge, now)!;
  ok(typeof sealed === "string" && !sealed.includes(session.access_token) && !sealed.includes(session.refresh_token), "الختم لا يُظهر الجلسة");
  const opened = openSession(sealed, verifier, now + 60_000);
  ok(opened.ok && opened.session.refresh_token === session.refresh_token && opened.session.expires_at === 1_900_000_000, "ويُفتح بالسرّ خلال دقيقة");

  console.log("\nب) ومن لا يحمله لا يأخذ شيئاً");
  const other = randomBytes(32).toString("base64url");
  const r1 = openSession(sealed, other, now + 1000);
  ok(!r1.ok && r1.reason === "verifier", "تطبيقٌ آخر التقط الرابط بلا السرّ: يُردّ");
  const r2 = openSession(sealed, verifier, now + 2 * 60_000 + 1);
  ok(!r2.ok && r2.reason === "expired", "وبعد دقيقتين لا يُفتح ولو بالسرّ");
  const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  ok(!openSession(tampered, verifier, now).ok, "والختم المعبوث به لا يُفتح");
  ok(!openSession("x", verifier, now).ok && !openSession("", verifier, now).ok, "ولا نصٌّ ليس ختماً");
  ok(!openSession(sealed, "short", now).ok, "ولا سرٌّ أقصر من ٤٣ حرفاً");
  ok(sealSession(session, "not-a-challenge", now) === null, "ولا يُختم لبصمةٍ غير صالحة");

  console.log("\nج) المفتاح من سرّ الخادم");
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-two";
  ok(!openSession(sealed, verifier, now).ok, "خادمٌ بسرٍّ آخر لا يفتح ختم هذا");
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  ok(sealSession(session, challenge, now) === null, "وبلا سرٍّ لا يُختم شيء");

  if (prior === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prior;

  console.log("");
  if (failed > 0) {
    console.error(`${failed} فحصاً فشل`);
    process.exit(1);
  }
  console.log("OK");
}

main();
