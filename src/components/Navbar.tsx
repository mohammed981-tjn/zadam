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
        // كانت تُوعَد من الصفحة الأولى مرّتين ولا توجد. ووجودُها في القائمة
        // يجعلها قابلةً للوصول من كلّ صفحة، لا من الأولى وحدها.
        { href: "/knowledge", label: "قاعدة المعرفة" },
        { href: "/tools/water", label: "حاسبة الاحتياج المائي" },
        { href: "/tools/feasibility", label: "دراسة الجدوى المرحلية" },
        { href: "/feedback", label: "ملاحظات واقتراحات" },
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

  /*
   * والزائرُ يعرف أنّ للمزرعة باباً، وإن كان يحتاج حساباً ليدخله.
   *
   * The «مزرعتي» group below is pushed only for a signed-in user, so a visitor
   * browsing the menu saw calculators, studies, mining and an account section —
   * and no hint that land, seasons or a farm record existed at all. The whole
   * agricultural spine was invisible to precisely the person it was built for.
   *
   * The links point at `/signup` rather than at `/lands`, and that is
   * deliberate: `/lands` redirects to `/login`, and login always lands on
   * `/dashboard` — the investor portfolio — so a farmer who followed the honest
   * href would arrive somewhere that has nothing to do with what they clicked.
   * Pointing at signup states the requirement instead of walking them into it.
   */
  if (!user) {
    groups.push({
      title: "مزرعتك",
      hint: "سجّل أرضك ووثّق موسمك — يحتاج حساباً",
      items: [
        { href: "/signup", label: "سجّل أرضك" },
        { href: "/guide", label: "كيف تسير الخطوات" },
        { href: "/export/market", label: "عروض التصدير المنشورة" },
      ],
    });
  }

  if (user) {
    groups.push({
      title: "مزرعتي",
      hint: "الأرض والمواسم والقطيع",
      items: [
        { href: "/lands", label: "أراضيّ" },
        { href: "/seasons", label: "مواسمي" },
        { href: "/herds", label: "دورات الإنتاج الحيواني" },
        { href: "/opportunities/new", label: "ارفع فرصة" },
        { href: "/export/offers", label: "عروضي للتصدير" },
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
    items: [
      { href: "/arc-canal", label: "القناة القوسية" },
      { href: "/export", label: "ممرّ الصادر السوداني" },
      { href: "/export/market", label: "عروض التصدير المنشورة" },
    ],
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
        // الشاشةُ التي كان إجراؤها موجوداً وهي مفقودة — وبلاها لا تُوثَّق أرضٌ
        // أبداً، فتقف السلسلةُ كلُّها عند خطوتها الأولى.
        { href: "/admin/lands", label: "توثيق الأراضي" },
        { href: "/admin/review", label: "مراجعة الفرص" },
        { href: "/admin/analytics", label: "التحليلات" },
        { href: "/admin/export", label: "مراجعة الصادر" },
        // اللوائحُ تتغيّر بإعلانٍ لا بجدول، فلا يملأ تاريخَ المراجعة إلّا إنسان.
        { href: "/admin/export/corridors", label: "مراجعة قواعد الممرّات" },
        { href: "/admin/export/interests", label: "طلبات المشترين" },
        { href: "/admin/providers", label: "توثيق مقدّمي الخدمة" },
        { href: "/admin/feedback", label: "ملاحظات الزوّار" },
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
          {/*
           * لا `hidden ... sm:inline-block`.
           *
           * The class was `hidden rounded-lg ... sm:inline-block`: the button
           * does not render below 640px, and a phone is 390px. Signing up was
           * still *possible* — the menu carries a «حسابك» group — but that
           * group is one of six in an accordion that opens one section at a
           * time, so reaching it took opening the menu, finding the section and
           * expanding it: three deliberate taps, with no visible prompt at any
           * point that joining was a thing to do.
           *
           * Sudan browses on phones, and this platform's own owner has no
           * computer. A call to action that renders only on the device the
           * market does not use is a call to action for nobody. Six people ever
           * registered.
           */}
          {!user && (
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
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
