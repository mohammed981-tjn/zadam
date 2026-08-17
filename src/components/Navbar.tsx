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
  let unread = 0;
  if (user) {
    // Row-level security scopes the count to this user's own inbox, so no
    // recipient filter is needed here — and adding one would imply the filter
    // is what keeps inboxes apart.
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);
    role = profile?.role ?? null;
    unread = count ?? 0;
  }

  const groups: NavGroup[] = [
    {
      title: "الزراعة",
      items: [
        { href: "/", label: "الرئيسية" },
        { href: "/tools/water", label: "حاسبة الاحتياج المائي" },
        { href: "/services", label: "الخدمات التعاقدية" },
        { href: "/guide", label: "دليل الاستخدام" },
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
        { href: "/herds", label: "دورات الإنتاج الحيواني" },
        { href: "/contracts", label: "عقود الخدمات" },
        { href: "/services/mine", label: "جهتي كمقدّم خدمة" },
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
          {user && (
            <Link
              href="/notifications"
              aria-label={
                unread > 0 ? `الإشعارات، ${unread} غير مقروء` : "الإشعارات"
              }
              className="relative rounded-lg border border-border px-2.5 py-2 text-sm hover:border-primary"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -end-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[0.65rem] font-bold leading-5 text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
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
