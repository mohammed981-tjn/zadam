"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateAuthError } from "@/lib/auth-errors";
import { toE164 } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { MIN_PASSWORD, readIdentifier, safeNext } from "@/lib/authEntry";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";

/*
 * Phone is the primary identifier, email the fallback.
 *
 * A visitor who tried to register received Supabase's default confirmation
 * email — English, branded by a company they had never heard of — and reported
 * it as a phishing attempt. That is the correct instinct on their part, and it
 * means the email path was costing us the exact users the platform exists for.
 * Most Sudanese users have a phone and use it constantly; email is the less
 * natural identifier here, not the more natural one.
 *
 * The number does not go through Supabase's phone provider, which cannot be
 * enabled without SMS credentials the platform has no way to obtain for Sudan
 * today. It is folded into an internal address instead and the account is
 * created already confirmed through the admin API — see lib/phoneIdentity for
 * the address, lib/supabase/admin for why the elevated key is needed and how it
 * is contained. The short version: the number is an identifier the user chose,
 * not a fact the platform has verified, and nothing may present it as verified
 * until a real SMS route exists.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Reads the country code and number fields into an E.164 identifier. */
function readPhone(formData: FormData, locale: Locale) {
  return toE164(str(formData, "dial_code"), str(formData, "phone"), locale);
}

async function translator() {
  const locale = await getLocale();
  return { locale, t: (ar: string, en: string) => tr(locale, ar, en) };
}

/**
 * أين يصل المرءُ بعد الدخول.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Every path here used to end in `redirect("/dashboard")` — the investment
 * portfolio. A person who arrived by pressing «سجّل أرضك», signed up, and was
 * dropped onto a page about shares they do not own has been answered by a
 * different platform than the one they came to. That is not a small annoyance:
 * it is the first thing the product says to them, and it says "you misread us".
 *
 * The role is orientation, so it decides the doorway and nothing more — the
 * farmer can still open the portfolio from the menu, and the investor can still
 * open the farm. Ownership, not role, is what any of it is actually guarded by.
 *
 * وتعذُّرُ قراءة الدور يُفضي إلى المحفظة كما كان: وجهةٌ خاطئةٌ أهونُ من صفحةِ
 * خطأٍ في اللحظة التي ينجح فيها الدخول.
 */
async function homeAfterAuth(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/dashboard";

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (data as { role: string } | null)?.role === "farmer"
    ? "/lands"
    : "/dashboard";
}

export async function login(formData: FormData) {
  const { locale } = await translator();
  const method = str(formData, "method") || "phone";
  const password = str(formData, "password");
  const supabase = await createClient();

  if (method === "email") {
    const email = str(formData, "email");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      redirect(
        `/login?method=email&error=${encodeURIComponent(
          translateAuthError(error.message, "email", locale),
        )}`,
      );
    }
    redirect(await homeAfterAuth());
  }

  const phone = readPhone(formData, locale);
  if (!phone.ok) {
    redirect(`/login?error=${encodeURIComponent(phone.message)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: phoneToEmail(phone.e164),
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        translateAuthError(error.message, "phone", locale),
      )}`,
    );
  }

  redirect(await homeAfterAuth());
}

export async function signup(formData: FormData) {
  const { locale, t } = await translator();
  const method = str(formData, "method") || "phone";
  const password = str(formData, "password");
  const fullName = str(formData, "full_name");

  /*
   * ما يقوله المسجِّلُ عن نفسه — ولا يقول به صلاحية.
   *
   * Narrowed here to the one value that changes anything, and narrowed **again**
   * inside `handle_new_user`, which is where it actually matters: this line runs
   * on our server and the trigger runs in the database, and only the second is
   * out of reach of a hand-crafted request. Anything that is not exactly
   * "investor" — including "admin" — becomes a farmer in both places.
   *
   * والافتراضيُّ مزارع: الاستثمارُ موقوفٌ على المنصّة اليوم (`INVESTMENT_LIVE`),
   * وما يستطيع الواصلُ فعلَه الآنَ هو أرضٌ وموسمٌ وجواز.
   */
  const chosenRole = str(formData, "role") === "investor" ? "investor" : "farmer";

  const supabase = await createClient();

  if (password.length < MIN_PASSWORD) {
    const target = method === "email" ? "/signup?method=email" : "/signup";
    redirect(
      `${target}${target.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        t(
          `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل.`,
          `The password must be at least ${MIN_PASSWORD} characters.`,
        ),
      )}`,
    );
  }

  if (method === "email") {
    const email = str(formData, "email");

    // The confirmation link needs somewhere that can complete it, exactly as
    // the reset link does. Left out, it lands on the project's Site URL — which
    // for a preview deployment is not even this deployment.
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: chosenRole },
        ...(host
          ? { emailRedirectTo: `${proto}://${host}/auth/callback` }
          : {}),
      },
    });

    if (error) {
      redirect(
        `/signup?method=email&error=${encodeURIComponent(
          translateAuthError(error.message, "email", locale),
        )}`,
      );
    }

    /*
     * لم يُنشأ حساب: البريدُ مسجّلٌ من قبل (البند ١٣٩).
     *
     * For an address that already has an account, signUp answers the way it
     * answers a new one — a user and no session — so that the reply does not
     * say who is registered. The tell is an empty `identities`. Without this
     * check the visitor was told «تم إنشاء الحساب… ستصلك رسالة تفعيل», and no
     * message ever came, because nothing was created. That happened to the
     * owner on 22 October with his own admin address; a minute later he made
     * a second, ordinary account with his number and could no longer find the
     * administration. The phone path already says «هذا الرقم مسجّل بالفعل», so
     * saying the same of an email reveals nothing the platform did not.
     */
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      redirect(
        `/login?method=email&error=${encodeURIComponent(
          t(
            "هذا البريد مسجّل من قبل، فلم يُنشأ حسابٌ جديد. ادخل به — وإن نسيت كلمة المرور فاضغط «نسيت كلمة المرور».",
            "This email already has an account, so no new one was created. Sign in with it — or use «Forgot password» if you need to.",
          ),
        )}`,
      );
    }

    if (!data.session) {
      redirect(
        `/login?method=email&message=${encodeURIComponent(
          t(
            "تم إنشاء الحساب. ستصلك رسالة تفعيل على بريدك من خدمة الاستضافة — افتحها واضغط الرابط، ثم عد لتسجيل الدخول.",
            "Your account has been created. A confirmation message will reach your inbox from our hosting provider — open it and click the link, then come back to sign in.",
          ),
        )}`,
      );
    }

    redirect(await homeAfterAuth());
  }

  const phone = readPhone(formData, locale);
  if (!phone.ok) {
    redirect(`/signup?error=${encodeURIComponent(phone.message)}`);
  }

  const email = phoneToEmail(phone.e164);

  /*
   * Created already confirmed, through the admin API.
   *
   * The ordinary signup call would leave the account waiting on a confirmation
   * link sent to an address that cannot receive one — an account nobody could
   * ever sign into. Confirming at creation also means the email path keeps its
   * own confirmation for real addresses: this is not a project-wide setting
   * being switched off, it is one flow that has no inbox to check.
   *
   * The real number goes into user metadata, not left to be recovered from the
   * internal address. A trigger copies it onto the profile, so the platform
   * holds the number in the form a future SMS provider will want when these
   * accounts are migrated onto real verification.
   */
  const admin = createAdminClient();
  if (!admin) {
    /*
     * Reached only if the key vanished between the page rendering and this
     * submission — /signup checks the same capability first and does not offer
     * the phone form without it. Kept as a real branch rather than an assertion
     * because a deployment can change under an open tab, which is precisely how
     * this platform's other silent failures have happened.
     *
     * The log names the variable and the fix. "not configured" in a log at 2am
     * tells whoever is reading it nothing they can act on.
     */
    console.error(
      "signup: phone registration unavailable — SUPABASE_SERVICE_ROLE_KEY is not set " +
        "for this deployment. Set it in the Vercel project's environment " +
        "variables for every environment that serves signups (Production, " +
        "Preview and Development), then redeploy. Value: Supabase dashboard → " +
        "Project Settings → API → service_role key.",
    );
    redirect(
      `/signup?method=email&error=${encodeURIComponent(
        t(
          "التسجيل برقم الجوال غير متاح على هذه النسخة من الموقع. أكملنا لك التسجيل بالبريد الإلكتروني — الحساب واحد في الحالتين.",
          "Signing up with a mobile number is not available on this version of the site. You can sign up by email instead — it is the same account either way.",
        ),
      )}`,
    );
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone.e164, role: chosenRole },
  });

  if (createError) {
    redirect(
      `/signup?error=${encodeURIComponent(
        translateAuthError(createError.message, "phone", locale),
      )}`,
    );
  }

  // The admin client holds no session — the account exists, and this is what
  // actually signs the visitor in.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    redirect(
      `/login?message=${encodeURIComponent(
        t(
          "أُنشئ حسابك بنجاح. سجّل الدخول برقمك وكلمة مرورك.",
          "Your account was created. Sign in with your number and password.",
        ),
      )}`,
    );
  }

  redirect(await homeAfterAuth());
}

/**
 * What the one sign-in screen shows after a press (backlog 142).
 *
 * `new` opens the name and role on the same screen: there is no account for
 * this number or email, and the next press creates it with the same password.
 */
export type EntryState = {
  kind: "idle" | "error" | "new" | "sent";
  message?: string;
};

/**
 * دخولٌ وتسجيلٌ في شاشةٍ واحدة (البند ١٤٢).
 *
 * The owner found the old pair confusing: a sign-in page that asked first
 * whether by phone or by email, a separate signup page that asked again, and
 * no way to know which one you needed until one of them failed. Here:
 *
 *  1. The visitor types a number or an email, and a password, and presses.
 *  2. If that signs in, they are where they were going.
 *  3. If it does not, the server asks whether that address has an account at
 *     all. None: the name and role appear, and the same password makes it. One:
 *     the password is wrong, and «نسيت كلمة المرور» is right there.
 *
 * Throttled per connecting address with the app's sign-in (five a minute), and
 * closed when the limiter cannot be asked: this is where passwords are guessed.
 * Telling a visitor that a number has no account says no more than the old
 * signup form did («هذا الرقم مسجّل بالفعل»).
 */
export async function enter(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const { locale, t } = await translator();
  const creating = str(formData, "intent") === "new";
  // A message that is not about which of the two to do keeps the screen as it was.
  const stay = creating ? "new" : "error";

  const verdict = await checkRateLimit("web-auth", clientAddress(await headers()));
  if (!verdict.allowed) {
    return {
      kind: stay,
      message: t(
        "محاولاتٌ كثيرة في وقتٍ قصير. انتظر دقيقةً ثمّ أعد المحاولة.",
        "Too many attempts in a short time. Wait a minute and try again.",
      ),
    };
  }

  const who = readIdentifier(str(formData, "ident"), str(formData, "dial_code"), locale);
  if (!who.ok) return { kind: stay, message: who.message };

  const password = String(formData.get("password") ?? "");
  if (!password) return { kind: stay, message: t("اكتب كلمة المرور.", "Enter your password.") };

  const next = safeNext(str(formData, "next"));
  const supabase = await createClient();

  if (!creating) {
    const { error } = await supabase.auth.signInWithPassword({ email: who.address, password });
    if (!error) redirect(next ?? (await homeAfterAuth()));

    if (error.message !== "Invalid login credentials") {
      return { kind: "error", message: translateAuthError(error.message, who.kind, locale) };
    }

    const admin = createAdminClient();
    const { data: exists, error: lookupError } = admin
      ? await admin.rpc("auth_account_exists", { p_email: who.address })
      : { data: null, error: null };
    if (lookupError) console.error("enter: account lookup failed", lookupError.message);

    if (exists === false) {
      return {
        kind: "new",
        message:
          who.kind === "phone"
            ? t(
                "لا حساب بهذا الرقم بعد. اكتب اسمك واختر صفتك، ثمّ اضغط «أنشئ حسابي» بكلمة المرور نفسها.",
                "There is no account with this number yet. Write your name and choose what you do, then press «Create my account» with the same password.",
              )
            : t(
                "لا حساب بهذا البريد بعد. اكتب اسمك واختر صفتك، ثمّ اضغط «أنشئ حسابي». وستصلك رسالة تفعيل على بريدك.",
                "There is no account with this email yet. Write your name and choose what you do, then press «Create my account». A confirmation message will reach your inbox.",
              ),
      };
    }
    if (exists === true) {
      return {
        kind: "error",
        message: t(
          "كلمة المرور غير صحيحة. أعد كتابتها، أو اضغط «نسيت كلمة المرور».",
          "The password is not right. Type it again, or press «Forgot your password».",
        ),
      };
    }
    // The lookup could not be made: say what is known, and leave the way open.
    return {
      kind: "error",
      message: t(
        "الرقم أو البريد أو كلمة المرور غير صحيحة. وإن لم يكن لك حساب فاضغط «ليس لي حساب».",
        "The number, email or password is not right. If you have no account, press «I have no account».",
      ),
    };
  }

  // ── A new account ──────────────────────────────────────────────────────────
  const fullName = str(formData, "full_name");
  if (fullName.length < 2 || fullName.length > 80) {
    return { kind: "new", message: t("اكتب اسمك الكامل.", "Write your full name.") };
  }
  if (password.length < MIN_PASSWORD) {
    return {
      kind: "new",
      message: t(
        `كلمة المرور للحساب الجديد ${MIN_PASSWORD} أحرف على الأقلّ.`,
        `A new account's password is at least ${MIN_PASSWORD} characters.`,
      ),
    };
  }
  // The same narrowing as signup() above, and again in handle_new_user.
  const chosenRole = str(formData, "role") === "investor" ? "investor" : "farmer";

  if (who.kind === "email") {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const { data, error } = await supabase.auth.signUp({
      email: who.address,
      password,
      options: {
        data: { full_name: fullName, role: chosenRole },
        ...(host ? { emailRedirectTo: `${proto}://${host}/auth/callback` } : {}),
      },
    });
    if (error) return { kind: "new", message: translateAuthError(error.message, "email", locale) };
    // An address that already has an account answers like a new one, with no
    // identities (see signup() above).
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return {
        kind: "error",
        message: t(
          "هذا البريد مسجّل من قبل. ادخل به — وإن نسيت كلمة المرور فاضغط «نسيت كلمة المرور».",
          "This email already has an account. Sign in with it — or press «Forgot your password».",
        ),
      };
    }
    if (!data.session) {
      return {
        kind: "sent",
        message: t(
          "أُنشئ حسابك. افتح رسالة التفعيل التي وصلت بريدك (تأتي باسم خدمة الاستضافة Supabase) واضغط الرابط، ثمّ ادخل.",
          "Your account has been created. Open the confirmation message in your inbox (it comes from our hosting provider, Supabase), click the link, then sign in.",
        ),
      };
    }
    redirect(next ?? (await homeAfterAuth()));
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("enter: phone registration unavailable — SUPABASE_SERVICE_ROLE_KEY is not set for this deployment.");
    return {
      kind: "new",
      message: t(
        "التسجيل برقم الجوال غير متاح على هذه النسخة من الموقع. اكتب بريدك بدل الرقم — الحساب واحد في الحالتين.",
        "Signing up with a mobile number is not available on this version of the site. Type your email instead — it is the same account either way.",
      ),
    };
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email: who.address,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: who.e164, role: chosenRole },
  });
  if (createError) {
    const taken = /already (been )?registered/i.test(createError.message);
    return {
      kind: taken ? "error" : "new",
      message: taken
        ? t(
            "هذا الرقم له حساب. ادخل بكلمة مروره — وإن نسيتها فاضغط «نسيت كلمة المرور».",
            "This number already has an account. Sign in with its password — or press «Forgot your password».",
          )
        : translateAuthError(createError.message, "phone", locale),
    };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: who.address, password });
  if (signInError) {
    return {
      kind: "sent",
      message: t("أُنشئ حسابك. ادخل برقمك وكلمة مرورك.", "Your account was created. Sign in with your number and password."),
    };
  }
  redirect(next ?? (await homeAfterAuth()));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Sends the confirmation email again.
 *
 * The gap this closes is small and traps people completely. Signing up with an
 * email leaves the account unconfirmed until a link is clicked, and a visitor
 * who closes the tab, loses the mail to a spam folder, or simply tries to log
 * in before the message arrives is told "لم يتم تفعيل بريدك الإلكتروني بعد" —
 * true, and with no way out of it on the page. There was no button anywhere on
 * the platform to send that mail a second time.
 *
 * The response never says whether the address is registered. "If an account
 * exists, a message has been sent" is not evasion for its own sake: a form that
 * answers differently for known and unknown addresses is a way to test whether
 * someone has an account here, and on a platform that will hold land records
 * that is worth denying.
 */
export async function resendConfirmation(formData: FormData) {
  const { t } = await translator();
  const email = str(formData, "email");

  if (!email || !email.includes("@")) {
    redirect(
      `/login?method=email&error=${encodeURIComponent(t("أدخل بريداً إلكترونياً صحيحاً.", "Enter a valid email address."))}`,
    );
  }

  const supabase = await createClient();

  // Same reason as the reset link: the confirmation has to land somewhere that
  // can complete it. Without this it lands on the project's default Site URL,
  // which has no route to finish the job.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: host
      ? { emailRedirectTo: `${proto}://${host}/auth/callback` }
      : undefined,
  });

  // Logged, not shown. A rate-limit or a provider outage is our problem to
  // read in the logs; to the visitor the answer is the same either way.
  if (error) console.error("resendConfirmation:", error.message);

  redirect(
    `/login?method=email&message=${encodeURIComponent(
      t(
        "إن كان لهذا البريد حساب، أُرسلت رسالة التفعيل إليه. افتح الرسالة واضغط الرابط ثم عد وسجّل الدخول.",
        "If this email has an account, the confirmation message has been sent to it. Open the message, click the link, then come back and sign in.",
      ),
    )}`,
  );
}

/**
 * Starts a password reset.
 *
 * Email only, and the page says so rather than leaving a phone user pressing a
 * button that cannot help them. An account registered by phone has its number
 * folded into an internal @phone.invalid address that reaches no inbox, so
 * there is nowhere to send a link — those users have to be reset by an admin
 * until a real SMS route exists. Offering them a form that silently does
 * nothing would be worse than saying it plainly.
 */
export async function requestPasswordReset(formData: FormData) {
  const { t } = await translator();
  const email = str(formData, "email");

  if (!email || !email.includes("@")) {
    redirect(
      `/reset?error=${encodeURIComponent(t("أدخل بريداً إلكترونياً صحيحاً.", "Enter a valid email address."))}`,
    );
  }

  const supabase = await createClient();

  /*
   * Where the link lands.
   *
   * Taken from the request's own host rather than a constant, so a preview
   * deployment sends its links back to that preview. A reset link that always
   * jumped to production is how a test on a branch ends up changing a live
   * account's password.
   *
   * Supabase only honours redirect URLs on its allow-list, so an attacker
   * cannot point this anywhere by forging a Host header — an unlisted origin is
   * refused by Supabase and the link falls back to the project's Site URL.
   */
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  /*
   * Pointed at /auth/callback, not at /reset/confirm.
   *
   * This was the bug. The link used to go straight to the form, which asked
   * whether anyone was signed in, found nobody — because nothing had traded the
   * link's one-time credential for a session — and reported the link as
   * expired. The link was fine; the application had nowhere to put it.
   *
   * The callback does the exchange and then forwards here.
   */
  const redirectTo = host
    ? `${proto}://${host}/auth/callback?next=${encodeURIComponent("/reset/confirm")}`
    : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) console.error("requestPasswordReset:", error.message);

  redirect(
    `/reset?message=${encodeURIComponent(
      t(
        "إن كان لهذا البريد حساب، أُرسل إليه رابط إعادة التعيين. الرابط صالح لفترة قصيرة.",
        "If this email has an account, a reset link has been sent to it. The link is valid for a short time.",
      ),
    )}`,
  );
}

/**
 * Completes a reset, for a visitor arriving on the link from their email.
 *
 * Supabase turns the token in that link into a real session before this runs,
 * so the update below is an ordinary authenticated password change. That is
 * also why the session check matters: without a valid recovery session there is
 * nobody to change the password of, and the request must be refused rather than
 * silently doing nothing.
 */
export async function completePasswordReset(formData: FormData) {
  const { locale, t } = await translator();
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");

  if (password.length < MIN_PASSWORD) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent(t(`كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل.`, `The password must be at least ${MIN_PASSWORD} characters.`))}`,
    );
  }
  if (password !== confirm) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent(t("كلمتا المرور غير متطابقتين.", "The two passwords do not match."))}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/reset?error=${encodeURIComponent(
        t(
          "انتهت صلاحية رابط إعادة التعيين أو استُخدم من قبل. اطلب رابطاً جديداً.",
          "The reset link has expired or has already been used. Request a new one.",
        ),
      )}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent(
        translateAuthError(error.message, "email", locale),
      )}`,
    );
  }

  redirect(
    `/login?method=email&message=${encodeURIComponent(
      t(
        "تم تغيير كلمة المرور. سجّل الدخول بكلمتك الجديدة.",
        "Your password has been changed. Sign in with your new password.",
      ),
    )}`,
  );
}
