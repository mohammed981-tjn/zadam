import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">تسجيل الدخول</h1>
      <p className="mb-6 text-sm text-muted">ادخل إلى محفظتك الاستثمارية.</p>

      {message && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={login} className="flex flex-col gap-4">
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
            className="rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          دخول
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        ليس لديك حساب؟{" "}
        <Link href="/signup" className="text-primary underline">
          أنشئ حساباً جديداً
        </Link>
      </p>
    </div>
  );
}
