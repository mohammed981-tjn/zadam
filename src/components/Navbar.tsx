import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import NavMenu, { type NavGroup } from "./NavMenu";

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

  const groups: NavGroup[] = [
    {
      title: "الزراعة",
      items: [
        { href: "/", label: "الرئيسية" },
        { href: "/tools/water", label: "حاسبة الاحتياج المائي" },
      ],
    },
    {
      title: "التعدين",
      items: [
        { href: "/mining", label: "قسم التعدين" },
        { href: "/mining/registry", label: "سجلّ إثبات المنشأ" },
      ],
    },
  ];

  if (user) {
    groups.push({
      title: "أرضي",
      items: [
        { href: "/lands", label: "أراضيّ" },
        { href: "/seasons", label: "مواسمي" },
        { href: "/opportunities/new", label: "ارفع فرصة" },
      ],
    });
    groups.push({
      title: "استثماري",
      items: [
        { href: "/dashboard", label: "محفظتي" },
        { href: "/plan", label: "خطط استثمارك" },
      ],
    });
    if (role === "admin") {
      groups.push({
        title: "الإدارة",
        items: [
          { href: "/admin", label: "لوحة المشاريع" },
          { href: "/admin/review", label: "مراجعة الفرص" },
          { href: "/admin/analytics", label: "التحليلات" },
          { href: "/admin/leads", label: "العملاء المحتملون" },
        ],
      });
    }
  } else {
    groups.push({
      title: "حسابك",
      items: [
        { href: "/login", label: "تسجيل الدخول" },
        { href: "/signup", label: "إنشاء حساب" },
      ],
    });
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-primary"
        >
          🌾 سودجري
        </Link>

        <div className="flex items-center gap-3">
          {!user && (
            <Link
              href="/signup"
              className="hidden rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 sm:inline-block"
            >
              ابدأ الآن
            </Link>
          )}
          <NavMenu
            groups={groups}
            signOut={user ? <SignOutButton /> : undefined}
          />
        </div>
      </div>
    </header>
  );
}
