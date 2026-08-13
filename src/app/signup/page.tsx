import Link from "next/link";
import { signup } from "../login/actions";
import PhoneField from "@/components/PhoneField";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string }>;
}) {
  const { error, method } = await searchParams;
  const byEmail = method === "email";

  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">إنشاء حساب</h1>
      <p className="mb-6 text-sm text-muted">
        سجّل برقم جوالك — لا حاجة لبريد إلكتروني.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <input type="hidden" name="method" value={byEmail ? "email" : "phone"} />

        <label className="flex flex-col gap-1 text-sm">
          الاسم الكامل
          <input type="text" name="full_name" required className={field} />
        </label>

        {byEmail ? (
          <label className="flex flex-col gap-1 text-sm">
            البريد الإلكتروني
            <input type="email" name="email" required className={field} />
            <span className="text-xs text-muted">
              إن وصلتك رسالة تفعيل فستكون باسم خدمة الاستضافة (Supabase) لا باسم
              سودجري — هذا طبيعي وليست رسالة احتيال. افتحها واضغط الرابط.
            </span>
          </label>
        ) : (
          <PhoneField autoFocus />
        )}

        <label className="flex flex-col gap-1 text-sm">
          كلمة المرور
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={field}
          />
          <span className="text-xs text-muted">ستة أحرف على الأقل.</span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          إنشاء الحساب
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        {byEmail ? (
          <Link href="/signup" className="text-primary underline">
            التسجيل برقم الجوال بدلاً من ذلك
          </Link>
        ) : (
          <Link href="/signup?method=email" className="text-primary underline">
            التسجيل بالبريد الإلكتروني بدلاً من ذلك
          </Link>
        )}
      </p>

      <p className="mt-6 text-sm text-muted">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="text-primary underline">
          سجّل الدخول
        </Link>
      </p>
    </div>
  );
}
