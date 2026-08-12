import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? null;
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-primary"
        >
          🌾 سودجري
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:text-primary">
            المشاريع
          </Link>
          <Link href="/tools/water" className="hover:text-primary">
            حاسبة المياه
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="hover:text-primary">
                محفظتي
              </Link>
              <Link href="/plan" className="hover:text-primary">
                خطط استثمارك
              </Link>
              {role === "admin" && (
                <Link href="/admin" className="hover:text-primary">
                  لوحة الإدارة
                </Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-primary">
                دخول
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
              >
                ابدأ الاستثمار
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
