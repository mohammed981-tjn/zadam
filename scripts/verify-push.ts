/**
 * إشعارات الجوّال (البند ٢٠٧): مفتاح Google لا يغادر الخادم، ومسارات التطبيق بجلسة صاحبها، والمُرسِل لا يفعل شيئاً بلا
 * مفتاح، ولا يخرج في الإشعار غير عنوانه ونصّه ورابطه، والرمز الميّت يُحذف، والتطبيق يُبنى بلا google-services.json.
 *
 *   npx tsx scripts/verify-push.ts
 *
 * The SQL side — tokens filed under their owner, each notification handed out once — is scripts/verify-push-devices.sh.
 */
import { generateKeyPairSync, createVerify } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { dispatchPushes, fcmMessage, readOutcome, readServiceAccount, signedAssertion, _resetForTests } from "../src/lib/fcm";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === "build" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

async function main() {
  console.log("\nأ) مفتاح Google في الخادم وحده");
  const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
  const reads = src
    .filter((f) => /process\.env(\.FCM_SERVICE_ACCOUNT|\[["']FCM_SERVICE_ACCOUNT)/.test(read(f)))
    .map((f) => relative(ROOT, join(ROOT, f)));
  ok(reads.length === 1 && reads[0] === join("src", "lib", "fcm.ts"), `FCM_SERVICE_ACCOUNT يُقرأ في src/lib/fcm.ts وحده (${reads.join(", ")})`);
  ok(!src.some((f) => /NEXT_PUBLIC_FCM|NEXT_PUBLIC_[A-Z_]*SERVICE_ACCOUNT/.test(read(f))), "ولا متغيّر NEXT_PUBLIC_ يحمله إلى المتصفّح");
  const clientFiles = src.filter((f) => /^\s*["']use client["']/m.test(read(f)));
  ok(clientFiles.length > 0, `قُرئت ملفّات المتصفّح (${clientFiles.length})`);
  ok(!clientFiles.some((f) => /@\/lib\/fcm|lib\/fcm"|supabase\/admin/.test(read(f))), "ولا ملفّ متصفّحٍ يستورد المُرسِل أو مفتاح الخدمة");
  ok(!/^\s*["']use client["']/m.test(read("src/lib/fcm.ts")) && !/^\s*["']use client["']/m.test(read("src/components/AppPushSetting.tsx")),
    "المُرسِل ومفتاح الصفحة يعملان في الخادم");
  const mobile = walk("mobile").filter((f) => /\.(dart|yaml|kts|gradle|xml|json|plist)$/.test(f));
  ok(!mobile.some((f) => /FCM_SERVICE_ACCOUNT|BEGIN PRIVATE KEY|"private_key"/.test(read(f))), "ولا شيء منه في التطبيق");
  const everywhere = [...src, ...walk("docs"), ...walk("scripts"), ...walk(".github"), ...mobile];
  ok(!everywhere.some((f) => /"type"\s*:\s*"service_account"/.test(read(f))), "ولا ملفّ حساب خدمةٍ في المستودع");
  const gitignore = read(".gitignore") + read("mobile/.gitignore") + read("mobile/android/.gitignore");
  ok(/google-services\.json/.test(gitignore), "google-services.json لا يُرفع إلى المستودع بالخطأ");

  console.log("\nب) مسارات التطبيق بجلسة صاحبها، بلا مفتاح الخدمة");
  for (const f of ["src/app/api/app/push/route.ts", "src/app/api/app/push/forget/route.ts", "src/app/api/app/push/settings/route.ts"]) {
    const s = read(f);
    ok(/clientFromBearer\(req\)/.test(s), `${f}: clientFromBearer`);
    ok(s.includes("انتهت جلستك. ادخل من جديد.") && /status: 401/.test(s), `${f}: ‎401 «انتهت جلستك. ادخل من جديد.»`);
    ok(!/supabase\/admin|SERVICE_ROLE|createAdminClient/.test(s), `${f}: لا مفتاح خدمة`);
  }
  const route = read("src/app/api/app/push/route.ts");
  ok(/rpc\("push_device_register"/.test(route) && /rpc\("push_app_status"/.test(route), "التسجيل والحالة بدالّتي القاعدة");
  ok(/rpc\("push_device_forget"/.test(read("src/app/api/app/push/forget/route.ts")), "والنسيان بدالّته");
  ok(/rpc\("push_app_set"/.test(read("src/app/api/app/push/settings/route.ts")), "والمفتاح بدالّته");
  const dispatch = read("src/app/api/push/dispatch/route.ts");
  ok(/bearerMatches\(header, cron/.test(dispatch) && /from\("push_hook"\)/.test(dispatch) && /status: 401/.test(dispatch),
    "المُرسِل مغلقٌ بسرّ الجرس أو CRON_SECRET");
  ok(/dispatchPushes\(supabase/.test(read("src/app/api/field-alerts/route.ts")), "والمهمّة اليوميّة تفرغ ما فات");

  console.log("\nج) بلا FCM_SERVICE_ACCOUNT لا يفعل شيئاً، ويقول ذلك مرّةً");
  {
    _resetForTests();
    const warns: unknown[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => warns.push(a);
    let touched = 0;
    const admin = new Proxy({}, { get: () => () => { touched++; throw new Error("touched"); } });
    let fetched = 0;
    const f = (async () => { fetched++; throw new Error("fetched"); }) as unknown as typeof fetch;
    const a = await dispatchPushes(admin as never, { raw: undefined, fetchImpl: f });
    const b = await dispatchPushes(admin as never, { raw: "", fetchImpl: f });
    const c = await dispatchPushes(admin as never, { raw: "{not json", fetchImpl: f });
    console.warn = warn;
    ok(a.off && b.off && c.off, "يعود «off»");
    ok(touched === 0 && fetched === 0, "لا يمسّ القاعدة ولا الشبكة");
    ok(warns.length === 1, `ويكتب في السجلّ مرّةً واحدة (${warns.length})`);
  }

  console.log("\nد) حساب الخدمة يُقرأ كما يعطيه Google، أو base64");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const account = { project_id: "sudagri-test", client_email: "fcm@sudagri-test.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" };
  const raw = JSON.stringify(account);
  ok(readServiceAccount(raw)?.projectId === "sudagri-test", "JSON كما هو");
  ok(readServiceAccount(Buffer.from(raw).toString("base64"))?.clientEmail === account.client_email, "وbase64");
  ok(readServiceAccount(JSON.stringify({ ...account, private_key: pem.replace(/\n/g, "\\n") }))?.privateKey === pem, "و\\n الحرفيّة تصير أسطراً");
  ok(readServiceAccount(JSON.stringify({ ...account, private_key: "x" })) === null, "ومفتاحٌ ليس مفتاحاً يُرفض");
  ok(readServiceAccount(JSON.stringify({ ...account, project_id: "../evil" })) === null, "ومعرّف مشروعٍ غريب يُرفض");
  {
    const sa = readServiceAccount(raw)!;
    const jwt = signedAssertion(sa, 1_800_000_000);
    const [h, c, sig] = jwt.split(".");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    ok(v.verify(publicKey, Buffer.from(sig, "base64url")), "التوقيع RS256 يتحقّق بالمفتاح العامّ");
    ok(claims.scope === "https://www.googleapis.com/auth/firebase.messaging" && claims.aud === sa.tokenUri && claims.exp - claims.iat === 3600,
      "بصلاحيّة الإرسال وحدها ولساعة");
  }

  console.log("\nهـ) ما يخرج في الإشعار: عنوانه ونصّه ورابطه، لا غير");
  {
    const m = fcmMessage({ id: "n1", token: "t1", locale: "ar", title: "رسالة جديدة", body: "ب".repeat(400), link: "https://evil.example/x" }).message;
    ok(JSON.stringify(Object.keys(m).sort()) === JSON.stringify(["android", "apns", "data", "notification", "token"]), "مفاتيح الرسالة معدودة");
    ok(JSON.stringify(Object.keys(m.data).sort()) === JSON.stringify(["link", "notification_id"]), "والبيانات: الرابط ومعرّف الإشعار");
    ok(m.data.link === "/notifications", "ورابطٌ خارج التطبيق يصير صندوق الإشعارات");
    ok(m.notification.body.length <= 160, "والنصّ مقصوص كما في تنبيهات المتصفّح");
    ok(m.android.notification.visibility === "PRIVATE", "وعلى القفل: كما يقرّر إعداد الجوّال (PRIVATE)");
    ok(fcmMessage({ id: "n2", token: "t", locale: "ar", title: "", body: "", link: "/messages/abc" }).message.data.link === "/messages/abc", "ورابط التطبيق يمرّ");
  }
  ok(readOutcome(200, {}) === "sent" && readOutcome(404, {}) === "gone" && readOutcome(401, {}) === "expired", "قراءة الردّ: وصل، ميّت، انتهى الإذن");
  ok(readOutcome(403, { error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } }) === "gone", "ورمز مشروعٍ آخر ميّت");
  ok(readOutcome(400, { error: { details: [{ errorCode: "INVALID_ARGUMENT" }] } }) === "failed", "وخطأ الرسالة لا يحذف الرمز");

  console.log("\nو) الإرسال: كلٌّ إلى جهازه، والميّت يُحذف، وانتهاء الإذن يُجدَّد مرّة");
  {
    _resetForTests();
    const calls: { url: string; body: string; auth: string }[] = [];
    let tokens = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const body = typeof init.body === "string" ? init.body : String(init.body);
      calls.push({ url, body, auth: String((init.headers as Record<string, string>).authorization ?? "") });
      if (url.startsWith("https://oauth2.googleapis.com/")) {
        tokens++;
        return new Response(JSON.stringify({ access_token: `at-${tokens}`, expires_in: 3600 }), { status: 200 });
      }
      const token = JSON.parse(body).message.token as string;
      const auth = String((init.headers as Record<string, string>).authorization);
      if (token === "tok-expire" && auth === "Bearer at-1") return new Response("{}", { status: 401 });
      if (token === "tok-gone") return new Response(JSON.stringify({ error: { details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
      if (token === "tok-other") return new Response(JSON.stringify({ error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } }), { status: 403 });
      if (token === "tok-err") return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ name: "projects/x/messages/1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const rpcs: string[] = [];
    const deleted: string[] = [];
    const seen: string[] = [];
    const send = (token: string) => ({ id: "n1", token, locale: "ar", title: "تنبيه سعر", body: "السمسم فوق ما حدّدت", link: "/market" });
    let round = 0;
    const admin = {
      rpc: async (name: string) => {
        rpcs.push(name);
        round++;
        return round === 1
          ? { data: { claimed: 3, sends: ["tok-ok", "tok-gone", "tok-other", "tok-err", "tok-expire"].map(send) }, error: null }
          : { data: { claimed: 0, sends: [] }, error: null };
      },
      from: () => ({
        delete: () => ({ in: async (_c: string, v: string[]) => { deleted.push(...v); return { error: null }; } }),
        update: () => ({ in: async (_c: string, v: string[]) => { seen.push(...v); return { error: null }; } }),
      }),
    };
    const err = console.error;
    console.error = () => {};
    const r = await dispatchPushes(admin as never, { raw, fetchImpl });
    console.error = err;
    ok(!r.off && r.claimed === 3, "أخذ ما ينتظر");
    ok(rpcs.length === 1 && rpcs[0] === "push_claim", "بدالّة الأخذ وحدها، ومرّةً حين أخذ أقلّ من مئة");
    ok(calls[0].url.startsWith("https://oauth2.googleapis.com/"), "الإذن من Google قبل الأخذ");
    ok(calls.filter((c) => c.url === "https://fcm.googleapis.com/v1/projects/sudagri-test/messages:send").length === 6, "إلى FCM v1 لمشروعه، رسالةً لكلّ جهاز (والمنتهي مرّتين)");
    ok(r.sent === 2 && r.dropped === 2 && r.failed === 1, `وصل ٢ وحُذف ٢ وتعذّر ١ (${r.sent}/${r.dropped}/${r.failed})`);
    ok(JSON.stringify(deleted.sort()) === JSON.stringify(["tok-gone", "tok-other"]), "والرمزان الميّتان حُذفا، والمتعذّر بقي");
    ok(JSON.stringify(seen.sort()) === JSON.stringify(["tok-expire", "tok-ok"]), "وعُلّم ما وصل");
    ok(tokens === 2, "وانتهاء الإذن جدّده مرّةً واحدة");
  }
  {
    _resetForTests();
    let claimed = 0;
    const admin = { rpc: async () => { claimed++; return { data: { claimed: 0, sends: [] }, error: null }; } };
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    const err = console.error;
    console.error = () => {};
    const r = await dispatchPushes(admin as never, { raw, fetchImpl });
    console.error = err;
    ok(claimed === 0 && r.claimed === 0 && !r.off, "مفتاحٌ يرفضه Google: لا يُؤخذ شيء، فلا يضيع دور إشعار");
  }

  console.log("\nز) التطبيق يُبنى بلا google-services.json");
  const gradle = read("mobile/android/app/build.gradle.kts");
  ok(/if \(file\("google-services\.json"\)\.exists\(\)\)\s*\{\s*apply\(plugin = "com\.google\.gms\.google-services"\)/.test(gradle),
    "إضافة google-services تُطبَّق حين يوجد الملفّ وحده");
  ok(!/^\s*id\("com\.google\.gms\.google-services"\)\s*$/m.test(gradle), "ولا تُطبَّق دائماً في plugins {}");
  ok(/id\("com\.google\.gms\.google-services"\) version "[\d.]+" apply false/.test(read("mobile/android/settings.gradle.kts")),
    "وتُعلَن في settings.gradle.kts بلا تطبيق");
  const wf = read(".github/workflows/mobile.yml");
  ok(/GOOGLE_SERVICES_JSON/.test(wf) && /if \[ -n "\$GOOGLE_SERVICES_JSON" \]/.test(wf), "والبناء يكتب الملفّ من السرّ إن وُجد فقط");
  const pushDart = read("mobile/lib/push.dart");
  ok(/initializeApp\(\)/.test(pushDart) && /try\s*\{\s*available = await _platform\.init\(\);\s*\}\s*catch \(_\)\s*\{[\s\S]*?available = false;/.test(pushDart),
    "وتهيئة Firebase في التطبيق محاطةٌ بما يُطفئ الإشعارات إن فشلت");
  ok(/'\/api\/app\/push'/.test(pushDart) && /'\/api\/app\/push\/forget'/.test(pushDart), "والتطبيق يسجّل رمزه وينساه بمساري الجلسة");
  ok(/POST_NOTIFICATIONS/.test(read("mobile/android/app/src/main/AndroidManifest.xml")), "وإذن الإشعارات لأندرويد ١٣+");
  ok(existsSync(join(ROOT, "docs/push-setup-ar.md")) && /com\.google\.gms|sd\.sudagri\.sudagri/.test(read("docs/push-setup-ar.md")),
    "ودليل المالك موجود باسم الحزمة");

  if (failed) {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
