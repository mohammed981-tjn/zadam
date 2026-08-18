"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateAuthError } from "@/lib/auth-errors";
import { toE164 } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";

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
function readPhone(formData: FormData) {
  return toE164(str(formData, "dial_code"), str(formData, "phone"));
}

export async function login(formData: FormData) {
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
          translateAuthError(error.message, "email"),
        )}`,
      );
    }
    redirect("/dashboard");
  }

  const phone = readPhone(formData);
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
        translateAuthError(error.message, "phone"),
      )}`,
    );
  }

  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const method = str(formData, "method") || "phone";
  const password = str(formData, "password");
  const fullName = str(formData, "full_name");
  const supabase = await createClient();

  if (password.length < 6) {
    const target = method === "email" ? "/signup?method=email" : "/signup";
    redirect(
      `${target}${target.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "كلمة المرور يجب أن تكون ستة أحرف على الأقل.",
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
        data: { full_name: fullName },
        ...(host
          ? { emailRedirectTo: `${proto}://${host}/auth/callback` }
          : {}),
      },
    });

    if (error) {
      redirect(
        `/signup?method=email&error=${encodeURIComponent(
          translateAuthError(error.message, "email"),
        )}`,
      );
    }

    if (!data.session) {
      redirect(
        `/login?method=email&message=${encodeURIComponent(
          "تم إنشاء الحساب. ستصلك رسالة تفعيل على بريدك من خدمة الاستضافة — افتحها واضغط الرابط، ثم عد لتسجيل الدخول.",
        )}`,
      );
    }

    redirect("/dashboard");
  }

  const phone = readPhone(formData);
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
        "التسجيل برقم الجوال غير متاح على هذه النسخة من الموقع. أكملنا لك التسجيل بالبريد الإلكتروني — الحساب واحد في الحالتين.",
      )}`,
    );
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone.e164 },
  });

  if (createError) {
    redirect(
      `/signup?error=${encodeURIComponent(
        translateAuthError(createError.message, "phone"),
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
        "أُنشئ حسابك بنجاح. سجّل الدخول برقمك وكلمة مرورك.",
      )}`,
    );
  }

  redirect("/dashboard");
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
  const email = str(formData, "email");

  if (!email || !email.includes("@")) {
    redirect(
      `/login?method=email&error=${encodeURIComponent("أدخل بريداً إلكترونياً صحيحاً.")}`,
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
      "إن كان لهذا البريد حساب، أُرسلت رسالة التفعيل إليه. افتح الرسالة واضغط الرابط ثم عد وسجّل الدخول.",
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
  const email = str(formData, "email");

  if (!email || !email.includes("@")) {
    redirect(
      `/reset?error=${encodeURIComponent("أدخل بريداً إلكترونياً صحيحاً.")}`,
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
      "إن كان لهذا البريد حساب، أُرسل إليه رابط إعادة التعيين. الرابط صالح لفترة قصيرة.",
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
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");

  if (password.length < 6) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent("كلمة المرور يجب أن تكون ٦ أحرف على الأقل.")}`,
    );
  }
  if (password !== confirm) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent("كلمتا المرور غير متطابقتين.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/reset?error=${encodeURIComponent(
        "انتهت صلاحية رابط إعادة التعيين أو استُخدم من قبل. اطلب رابطاً جديداً.",
      )}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `/reset/confirm?error=${encodeURIComponent(
        translateAuthError(error.message, "email"),
      )}`,
    );
  }

  redirect(
    `/login?method=email&message=${encodeURIComponent(
      "تم تغيير كلمة المرور. سجّل الدخول بكلمتك الجديدة.",
    )}`,
  );
}
