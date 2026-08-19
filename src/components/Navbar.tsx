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

  /*
   * Grouped by what the reader is trying to do, not by which table the page
   * reads. Two consequences worth naming, because both were the other way
   * before:
   *
   * The contracted-services links now sit together. "عقود الخدمات" and "جهتي
   * كمقدّم خدمة" used to live under the land section, one step away from the
   * catalogue they belong to, because they happened to require a login. Sign-in
   * is not a subject.
   *
   * And the sections a signed-in reader gains are inserted where they belong
   * rather than appended. Ownership sections come after the public ones and
   * before mining and administration, so the order does not reshuffle on
   * login — the menu should look like the same menu with more in it.
   */
  const groups: NavGroup[] = [
    {
      title: "الرئيسية",
      hint: "ابدأ من هنا",
      items: [
        { href: "/", label: "الصفحة الرئيسية" },
        { href: "/guide", label: "دليل الاستخدام" },
        { href: "/tools/water", label: "حاسبة الاحتياج المائي" },
        { href: "/tools/feasibility", label: "دراسة الجدوى المرحلية" },
      ],
    },
    {
      title: "الخدمات التعاقدية",
      hint: "مسح ورَي وميكنة وإرشاد وخدمات بيطرية",
      items: [
        { href: "/services", label: "كتالوج الخدمات" },
        { href: "/services/register", label: "سجّل جهتك كمقدّم خدمة" },
        ...(user
          ? [
              { href: "/contracts", label: "عقودي" },
              { href: "/services/mine", label: "جهتي كمقدّم خدمة" },
            ]
          : []),
      ],
    },
  ];

  if (user) {
    groups.push({
      title: "مزرعتي",
      hint: "الأرض والمواسم والقطيع",
      items: [
        { href: "/lands", label: "أراضيّ" },
        { href: "/seasons", label: "مواسمي" },
        { href: "/herds", label: "دورات الإنتاج الحيواني" },
        { href: "/opportunities/new", label: "ارفع فرصة" },
      ],
    });
    groups.push({
      title: "استثماري",
      hint: "محفظتك وخططك",
      items: [
        { href: "/dashboard", label: "محفظتي" },
        { href: "/plan", label: "خطط استثمارك" },
      ],
    });
  }

  groups.push({
    title: "مشاريع ودراسات",
    hint: "قراءات في أرقام المشاريع الكبرى",
    items: [{ href: "/arc-canal", label: "القناة القوسية" }],
  });

  groups.push({
    title: "التعدين",
    hint: "قسم مستقل عن الزراعة",
    items: [
      { href: "/mining", label: "قسم التعدين" },
      { href: "/mining/registry", label: "سجلّ إثبات المنشأ" },
    ],
  });

  if (user && role === "admin") {
    groups.push({
      title: "الإدارة",
      hint: "للمشرفين وحدهم",
      items: [
        { href: "/admin", label: "لوحة المشاريع" },
        { href: "/admin/review", label: "مراجعة الفرص" },
        { href: "/admin/analytics", label: "التحليلات" },
        { href: "/admin/providers", label: "توثيق مقدّمي الخدمة" },
        { href: "/admin/leads", label: "العملاء المحتملون" },
      ],
    });
  }

  if (!user) {
    groups.push({
      title: "حسابك",
      hint: "الدخول أو التسجيل",
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
