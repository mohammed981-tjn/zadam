"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { translateAuthError } from "@/lib/auth-errors";
import { toE164 } from "@/lib/phone";

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
 * Note what phone signup does and does not give us today. Supabase only sends a
 * confirmation code if an SMS provider is configured, and none is — so the
 * account is created immediately with no message and no waiting. The number is
 * therefore an identifier the user chose, not a fact the platform has verified.
 * Nothing in the product may present it as verified until an SMS route exists.
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
        `/login?error=${encodeURIComponent(translateAuthError(error.message))}`,
      );
    }
    redirect("/dashboard");
  }

  const phone = readPhone(formData);
  if (!phone.ok) {
    redirect(`/login?error=${encodeURIComponent(phone.message)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({
    phone: phone.e164,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(translateAuthError(error.message))}`,
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
        `/signup?method=email&error=${encodeURIComponent(translateAuthError(error.message))}`,
      );
    }

    if (!data.session) {
      redirect(
        `/login?message=${encodeURIComponent(
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

  const { data, error } = await supabase.auth.signUp({
    phone: phone.e164,
    password,
    options: { data: { full_name: fullName, phone: phone.e164 } },
  });

  if (error) {
    redirect(
      `/signup?error=${encodeURIComponent(translateAuthError(error.message))}`,
    );
  }

  /*
   * With no SMS provider there is no code to enter and a session comes back
   * immediately. If one is configured later, signUp returns without a session
   * and this branch is what the visitor sees — so it is written now rather than
   * left as a silent dead end that only appears in production.
   */
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "تم إنشاء الحساب. ستصلك رسالة نصية بكود التفعيل.",
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
