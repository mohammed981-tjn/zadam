/**
 * Supabase speaks about accounts in terms of email, because that is the flow the
 * platform signs people up through. A visitor who registered with their phone
 * number never saw an email, and would read "البريد الإلكتروني غير صحيح" as
 * being about something they never entered — so the identifier is named after
 * the way the person actually signed in.
 */
export type AuthMethod = "phone" | "email";

export function translateAuthError(
  message: string,
  method: AuthMethod = "email",
) {
  const byPhone = method === "phone";
  const identifier = byPhone ? "رقم الجوال" : "البريد الإلكتروني";

  const map: Record<string, string> = {
    "Invalid login credentials": `${identifier} أو كلمة المرور غير صحيحة.`,
    "User already registered": byPhone
      ? "هذا الرقم مسجّل بالفعل. جرّب تسجيل الدخول بدلاً من ذلك."
      : "هذا البريد الإلكتروني مسجّل بالفعل. جرّب تسجيل الدخول بدلاً من ذلك.",
    "Password should be at least 6 characters":
      "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
    /*
     * Only reachable while email confirmations are switched on. A phone account
     * has no inbox to check, so the message says what is actually wrong rather
     * than sending the user to look for a message that cannot arrive.
     */
    "Email not confirmed": byPhone
      ? "الحساب لم يُفعّل. تفعيل الحسابات ما يزال مطلوباً في إعدادات المنصة — تواصل معنا لتفعيل حسابك."
      : "لم يتم تفعيل بريدك الإلكتروني بعد. تحقق من رسالة التفعيل التي أُرسلت إليك.",
  };

  return map[message] ?? message;
}
