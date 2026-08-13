"use server";

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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
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
    console.error("signup: SUPABASE_SERVICE_ROLE_KEY is not set");
    redirect(
      `/signup?error=${encodeURIComponent(
        "التسجيل برقم الجوال غير مُهيّأ على الخادم حالياً. سجّل بالبريد الإلكتروني، أو تواصل معنا.",
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
