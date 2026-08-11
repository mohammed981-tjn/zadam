import Link from "next/link";
import { signup } from "../login/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">إنشاء حساب مستثمر</h1>
      <p className="mb-6 text-sm text-muted">
        سجّل بياناتك لتتمكن من تصفح المشاريع والاستثمار فيها.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          الاسم الكامل
          <input
            type="text"
            name="full_name"
            required
            className="rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          البريد الإلكتروني
          <input
            type="email"
            name="email"
            required
            className="rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          كلمة المرور
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          إنشاء الحساب
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="text-primary underline">
          سجّل الدخول
        </Link>
      </p>
    </div>
  );
}
