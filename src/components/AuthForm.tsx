"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { enter, resendConfirmation, signInWithProvider, type EntryState } from "@/app/login/actions";
import type { OAuthProvider } from "@/lib/oauth";
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
  providers = [],
}: {
  /** A path on this site to return to, already checked by the page. */
  next?: string | null;
  /** Opened from «أنشئ حساباً»: the name and role are shown from the start. */
  startNew?: boolean;
  /** «أستثمر» already chosen, for someone who came from an opportunity. */
  startRole?: "farmer" | "investor";
  /** False when this deployment cannot create phone accounts (no service key). */
  phoneSignup?: boolean;
  /** Google and Facebook, those switched on in Supabase (backlog 153). */
  providers?: OAuthProvider[];
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

      {/* «تابِع بحساب Google / Facebook» (البند ١٥٣): ضغطةٌ واحدة، بلا كلمة مرور. */}
      {providers.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <form key={p} action={signInWithProvider}>
                <input type="hidden" name="provider" value={p} />
                <input type="hidden" name="role" value={role} />
                {next && <input type="hidden" name="next" value={next} />}
                <button
                  className={`flex w-full items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 font-bold transition hover:opacity-90 ${
                    p === "facebook" ? "border-[#1877F2] bg-[#1877F2] text-white" : "border-border bg-card text-foreground"
                  }`}
                >
                  {p === "google" ? <GoogleMark /> : <FacebookMark />}
                  {p === "google"
                    ? t("تابِع بحساب Google (جيميل)", "Continue with Google")
                    : t("تابِع بحساب Facebook", "Continue with Facebook")}
                </button>
              </form>
            ))}
          </div>
          <p className="flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            {t("أو برقم جوالك أو بريدك", "or with your mobile number or email")}
            <span className="h-px flex-1 bg-border" />
          </p>
        </>
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

/** Google's «G», as its sign-in guidelines ask the button to carry it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Facebook's «f». */
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.27h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
