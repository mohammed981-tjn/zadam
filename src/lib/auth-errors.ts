export function translateAuthError(message: string) {
  const map: Record<string, string> = {
    "Invalid login credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "Email not confirmed": "لم يتم تفعيل بريدك الإلكتروني بعد. تحقق من رسالة التفعيل التي أُرسلت إليك.",
    "User already registered": "هذا البريد الإلكتروني مسجّل بالفعل. جرّب تسجيل الدخول بدلاً من ذلك.",
    "Password should be at least 6 characters": "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
  };

  return map[message] ?? message;
}
