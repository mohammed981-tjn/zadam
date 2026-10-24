"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { enter, resendConfirmation, type EntryState } from "@/app/login/actions";
import { useLocale } from "@/components/LocaleProvider";
import { COUNTRIES } from "@/lib/phone";
import { MIN_PASSWORD } from "@/lib/authEntry";
import { tr } from "@/lib/i18n";

const field =
  "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

/**
 * الدخول والتسجيل في شاشةٍ واحدة (البند ١٤٢).
 *
 * One box for a number or an email, a password with «أظهر», and one button.
 * When the server finds no account for what was typed, the name and role open
 * here, under the same password, and the button becomes «أنشئ حسابي» — the
 * visitor never has to know in advance which of two pages they needed.
 *
 * The fields are controlled so that nothing typed is lost between the two
 * presses: a form action resets uncontrolled fields when it returns.
 */
export default function AuthForm({
  next,
  startNew = false,
  startRole = "farmer",
  phoneSignup = true,
}: {
  /** A path on this site to return to, already checked by the page. */
  next?: string | null;
  /** Opened from «أنشئ حساباً»: the name and role are shown from the start. */
  startNew?: boolean;
  /** «أستثمر» already chosen, for someone who came from an opportunity. */
  startRole?: "farmer" | "investor";
  /** False when this deployment cannot create phone accounts (no service key). */
  phoneSignup?: boolean;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const [state, formAction, pending] = useActionState<EntryState, FormData>(enter, { kind: "idle" });
  const [mode, setMode] = useState<"signin" | "new">(startNew ? "new" : "signin");
  const [ident, setIdent] = useState("");
  const [dial, setDial] = useState("249");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"farmer" | "investor">(startRole);

  // The server's answer decides which of the two the screen is now.
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    if (state.kind === "new") setMode("new");
    else if (state.kind === "error" || state.kind === "sent") setMode("signin");
  }

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === "new" && state.kind === "new") nameRef.current?.focus();
  }, [mode, state]);

  const typed = ident.trim();
  const isEmail = typed.includes("@");
  const international = typed.startsWith("+") || typed.startsWith("00");
  const creating = mode === "new";

  const tone =
    state.kind === "error"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-primary/30 bg-primary/10 text-primary";

  return (
    <div className="flex flex-col gap-4">
      {state.message && (
        <p role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
          {state.message}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value={mode} />
        {next && <input type="hidden" name="next" value={next} />}

        <label className="flex flex-col gap-1 text-sm">
          {t("رقم الجوال أو البريد", "Mobile number or email")}
          <div className="flex gap-2" dir="ltr">
            {!isEmail && !international && (
              <select
                name="dial_code"
                value={dial}
                onChange={(e) => setDial(e.target.value)}
                aria-label={t("مفتاح الدولة", "Country code")}
                className={`${field} w-28 shrink-0`}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.dial}>
                    +{c.dial} {locale === "en" ? c.nameEn : c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              name="ident"
              value={ident}
              onChange={(e) => setIdent(e.target.value)}
              required
              autoFocus={!startNew}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="0912345678"
              className={`${field} min-w-0 flex-1`}
            />
          </div>
          <span className="text-xs text-muted">
            {isEmail
              ? t("بالبريد: تصل رسالة تفعيلٍ عند إنشاء الحساب.", "By email: a confirmation message is sent when the account is created.")
              : t(
                  "اكتب رقمك كما تكتبه عادةً — الصفر في أوّله لا يهمّ. أو اكتب بريدك بدله.",
                  "Type your number the way you usually write it — a leading zero doesn't matter. Or type your email instead.",
                )}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("كلمة المرور", "Password")}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={creating ? MIN_PASSWORD : undefined}
              autoComplete={creating ? "new-password" : "current-password"}
              className={`${field} w-full pe-20`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 end-0 px-3 text-xs font-bold text-primary"
            >
              {showPassword ? t("أخفِها", "Hide") : t("أظهرها", "Show")}
            </button>
          </div>
          {creating && (
            <span className="text-xs text-muted">
              {t(`${MIN_PASSWORD} أحرف على الأقلّ.`, `At least ${MIN_PASSWORD} characters.`)}
            </span>
          )}
        </label>

        {creating && (
          <>
            {!phoneSignup && !isEmail && (
              <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted">
                {t(
                  "إنشاء حسابٍ برقم الجوال غير متاح على هذه النسخة من الموقع. اكتب بريدك بدل الرقم — الحساب واحد في الحالتين.",
                  "Creating an account with a mobile number is not available on this version of the site. Type your email instead — it is the same account either way.",
                )}
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm">
              {t("الاسم الكامل", "Full name")}
              <input
                ref={nameRef}
                type="text"
                name="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                autoFocus={startNew}
                className={field}
              />
            </label>

            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1">{t("بماذا تبدأ؟", "Where do you start?")}</legend>
              {/* البند ١٥١: حسابٌ واحد للجانبين؛ هذا الاختيار يحدّد أوّل صفحة فقط. */}
              <p className="-mt-1 mb-1 text-xs text-muted">
                {t(
                  "حسابٌ واحد للاثنين: تعرض أرضك وتستثمر متى شئت، وتبدّل بينهما من القائمة.",
                  "One account does both: offer your land and invest whenever you like, switching from the menu.",
                )}
              </p>
              <label className="flex items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name="role"
                  value="farmer"
                  checked={role === "farmer"}
                  onChange={() => setRole("farmer")}
                  className="mt-1"
                />
                <span>
                  <strong>{t("بأرضي: أزرع أو أملك أرضاً", "With my land: I farm or own land")}</strong>
                  <span className="block text-xs text-muted">
                    {t(
                      "أسجّل أرضي وأوثّق مواسمي. ولا تُعرض أرضي لأحدٍ قبل أن تعتمدها الإدارة بمستندات الحيازة.",
                      "I register my land and record my seasons. My land is shown to no one before the administration approves it with the ownership papers.",
                    )}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name="role"
                  value="investor"
                  checked={role === "investor"}
                  onChange={() => setRole("investor")}
                  className="mt-1"
                />
                <span>
                  <strong>{t("بالاستثمار: أستثمر", "With investing: I invest")}</strong>
                  <span className="block text-xs text-muted">
                    {t(
                      "أبحث عن أرضٍ موثّقة أشارك صاحبها، بعقدٍ مكتوبٍ على المنصّة.",
                      "I look for verified land to partner with its owner, under an agreement written on the platform.",
                    )}
                  </span>
                </span>
              </label>
            </fieldset>
          </>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("لحظة…", "One moment…") : creating ? t("أنشئ حسابي", "Create my account") : t("ادخل", "Sign in")}
        </button>
      </form>

      <div className="flex flex-col items-center gap-3 text-sm">
        {creating ? (
          <button type="button" onClick={() => setMode("signin")} className="text-primary underline">
            {t("لي حساب — أريد الدخول", "I have an account — sign me in")}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setMode("new")} className="font-bold text-primary underline">
              {t("ليس لي حساب — أنشئ حساباً", "I have no account — create one")}
            </button>
            <Link href="/reset" className="text-muted underline">
              {t("نسيت كلمة المرور؟", "Forgot your password?")}
            </Link>
          </>
        )}
      </div>

      {/*
        The way out of the confirmation trap, for an email account only: a
        phone account has no inbox and nothing to resend.
      */}
      {isEmail && !creating && (
        <form action={resendConfirmation}>
          <input type="hidden" name="email" value={typed} />
          <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted">
              {t("لم تصلك رسالة التفعيل؟", "Didn't get the confirmation message?")}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="submit"
                className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary"
              >
                {t("أعد إرسالها إلى ", "Send it again to ")}
                <span dir="ltr">{typed}</span>
              </button>
              <span className="text-xs text-muted">
                {t(
                  "تحقّق من مجلد الرسائل غير المرغوبة أيضاً — الرسالة تصل باسم مزوّد الخدمة لا باسم سوداقري.",
                  "Check your spam folder too — the message comes in the name of our service provider, not Sudagri.",
                )}
              </span>
            </div>
          </details>
        </form>
      )}
    </div>
  );
}
