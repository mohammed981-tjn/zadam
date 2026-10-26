"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { button, field } from "@/lib/ui";

/**
 * الرمز الثاني للإدارة (AUTH-04، البند ١٤١). مرّةً واحدة: يُمسح رمز QR بتطبيق مصادقة (Google Authenticator أو
 * Microsoft Authenticator)، ويُكتب الرقم الذي يظهر فيه. وبعدها في كلّ دخول: يُكتب الرقم وحده. فتصير الجلسة `aal2`
 * وتعمل صفحات الإدارة؛ والقاعدة هي التي تشترط ذلك، لا هذه الشاشة.
 */
export default function SecondFactor({ mode }: { mode: "enroll" | "verify" }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // A start that was never finished leaves an unverified factor behind; it would block a new one of the same name.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Sudagri ${Date.now()}` });
    setBusy(false);
    if (e || !data) {
      setError(t("تعذّر البدء. أعد المحاولة بعد قليل.", "Could not start. Try again shortly."));
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let id = factorId;
    if (!id) {
      const { data: list } = await supabase.auth.mfa.listFactors();
      id = list?.totp?.find((f) => f.status === "verified")?.id ?? null;
    }
    if (!id) {
      setBusy(false);
      setError(t("لا تطبيق مصادقة مربوطٌ بحسابك بعد.", "No authenticator app is linked to your account yet."));
      return;
    }
    const { error: v } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (v) {
      setError(t("الرقم غير صحيح أو انتهى وقته. اكتب الرقم الظاهر الآن في التطبيق.", "The code is wrong or expired. Enter the code showing in the app now."));
      return;
    }
    router.refresh();
  }

  const codeForm = (
    <form onSubmit={confirm} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        {t("الرقم من التطبيق (٦ أرقام)", "The code from the app (6 digits)")}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          dir="ltr"
          className={`${field} w-40 text-center tracking-widest`}
        />
      </label>
      <button disabled={busy} className={button}>
        {busy ? t("لحظة…", "One moment…") : t("تحقّق", "Verify")}
      </button>
    </form>
  );

  return (
    <div>
      {mode === "verify" || factorId ? null : (
        <button onClick={start} disabled={busy} className={button}>
          {busy ? t("لحظة…", "One moment…") : t("اربط تطبيق المصادقة", "Link an authenticator app")}
        </button>
      )}
      {qr && (
        <div className="mt-4">
          <p className="text-sm leading-7">
            {t(
              "افتح تطبيق المصادقة على هاتفك، واختر «إضافة حساب» ثمّ «مسح رمز QR»، وامسح هذا الرمز:",
              "Open the authenticator app on your phone, choose «Add account» then «Scan a QR code», and scan this:",
            )}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL made on the spot, nothing to optimise */}
          <img src={qr} alt={t("رمز QR لتطبيق المصادقة", "QR code for the authenticator app")} className="mt-3 size-48 rounded-xl bg-white p-2" />
          {secret && (
            <p className="mt-2 text-xs text-muted">
              {t("أو اكتب هذا المفتاح في التطبيق بيدك: ", "Or type this key into the app by hand: ")}
              <code dir="ltr" className="select-all break-all">
                {secret}
              </code>
            </p>
          )}
        </div>
      )}
      {(mode === "verify" || factorId) && codeForm}
      {error && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
