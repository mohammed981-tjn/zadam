import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import SideSwitch from "@/components/SideSwitch";
import NavMenu, { type NavGroup } from "./NavMenu";
import DesktopSidebar from "./DesktopSidebar";
import LangToggle from "./LangToggle";
import BottomNav from "./BottomNav";
import OutboxProvider from "./OutboxProvider";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { adminPendingTotal } from "@/lib/adminQueue";

export default async function Navbar() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  let fullName: string | null = null;
  let unread = 0;
  let unreadMessages = 0;
  if (user) {
    // Row-level security scopes the count to this user's own inbox, so no
    // recipient filter is needed here — and adding one would imply the filter
    // is what keeps inboxes apart.
    const [{ data: profile }, { count }, { data: messageCount }] = await Promise.all([
      supabase.from("profiles").select("role, full_name").eq("id", user.id).single(),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      // صندوق الرسائل (البند ١٤٤): the unread messages in the threads one is a
      // party to. Before the migration is applied this errors and reads as 0.
      supabase.rpc("my_unread_message_count"),
    ]);
    role = profile?.role ?? null;
    fullName = profile?.full_name ?? null;
    unread = count ?? 0;
    unreadMessages = typeof messageCount === "number" ? messageCount : 0;
  }

  /*
   * بأيّ حسابٍ أنت داخل (البند ١٣٩).
   *
   * The owner has more than one account — an email one and a phone one — and
   * on 22 October he was signed in with the ordinary one and read the missing
   * «الإدارة» section as the administration being broken. Nothing on the page
   * said which account he was in. The menu now does, above «خروج», with the
   * account's kind, so "I am in the wrong account" is something one can see.
   */
  // Only the administrator's account is named a kind now: farmer and investor
  // are two sides of one account, switched below (backlog 151).
  const roleLabel = role === "admin" ? t("مدير", "Administrator") : null;

  // ما ينتظر قرار الإدارة (البند ١٢٤): المالكُ وجد الأرض في الإشعارات وحدها،
  // والإشعارُ يُقرأ فيختفي ولا يقول إن قُرّر في الأمر شيء. فالعدد هنا من
  // القوائم نفسها، ويُحسب للمدير وحده.
  const pending = role === "admin" ? await adminPendingTotal(supabase) : 0;

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
  /*
   * Twelve links under «الرئيسية» was not a section, it was the rest of the
   * site (backlog 121). They split by what the reader came to do: start and
   * read; check a price; work out something for the farm. And each page is in
   * the menu once — /guide sat under «الرئيسية» and again under «مزرعتك»,
   * /export/market under «مزرعتك» and again under the studies, and a visitor
   * saw /signup in two sections. The second copies are gone, not the pages.
   */
  const groups: NavGroup[] = [
    {
      title: t("الرئيسية", "Home"),
      hint: t("ابدأ من هنا", "Start here"),
      icon: "home",
      items: [
        { href: "/", label: t("الصفحة الرئيسية", "Home page") },
        // الأخبار خرجت من الرئيسيّة إلى صفحتها (طلب المالك، 25 سبتمبر)، فبابُها
        // هنا ثانياً، بعد الرئيسيّة مباشرةً.
        { href: "/news", label: t("الأخبار — جديد سوداقري", "News — what's new at Sudagri") },
        { href: "/guide", label: t("دليل الاستخدام", "User guide") },
        // كانت تُوعَد من الصفحة الأولى مرّتين ولا توجد. ووجودُها في القائمة
        // يجعلها قابلةً للوصول من كلّ صفحة، لا من الأولى وحدها.
        { href: "/knowledge", label: t("قاعدة المعرفة", "Knowledge base") },
        { href: "/feedback", label: t("ملاحظات واقتراحات", "Feedback and suggestions") },
      ],
    },
    {
      title: t("السوق والأسعار", "Market and prices"),
      hint: t("المحاصيل والعروض والسماد والوقود والعملات", "Crops, offers, fertiliser, fuel and currencies"),
      icon: "chart",
      items: [
        { href: "/market", label: t("سوق المحاصيل اليوم", "Crop market today") },
        { href: "/market/offers", label: t("عروض البيع والشراء", "Buy and sell offers") },
        { href: "/market/forward", label: t("العقود الآجلة: سعرٌ قبل الحصاد", "Forward contracts: a price before harvest") },
        { href: "/market/inputs", label: t("أين السماد والجازولين وبكم", "Where fertiliser and diesel are, and at what price") },
        { href: "/rates", label: t("أسعار العملات", "Exchange rates") },
      ],
    },
    {
      title: t("أدوات المزرعة", "Farm tools"),
      hint: t("المطر والماء والجدوى ومحاصيل جديدة", "Rain, water, feasibility and new crops"),
      icon: "droplet",
      items: [
        // The live map (البند ١٤٧): every layer on one map, with the satellite.
        { href: "/map", label: t("الخرائط: خريطةٌ حيّة وقمرٌ صناعيّ", "Maps: a live map and satellite") },
        { href: "/rain", label: t("توقّع الأمطار والخرائط", "Rain forecast and maps") },
        { href: "/tools/water", label: t("حاسبة الاحتياج المائي", "Crop water calculator") },
        { href: "/tools/feasibility", label: t("دراسة الجدوى المرحلية", "Staged feasibility study") },
        { href: "/tools/new-crops", label: t("محاصيل جديدة تستحق التجربة", "New crops worth trying") },
      ],
    },
    {
      title: t("الخدمات التعاقدية", "Contract services"),
      hint: t("مسح ورَي وميكنة وإرشاد وخدمات بيطرية", "Surveying, irrigation, machinery, extension and veterinary services"),
      icon: "wrench",
      items: [
        { href: "/how-we-work", label: t("إجراءات العمل: من البذرة إلى السوق", "How we work: from seed to market") },
        { href: "/services", label: t("كتالوج الخدمات", "Services catalogue") },
        { href: "/partners", label: t("الشركات الزراعيّة الشريكة", "Partner farming companies") },
        { href: "/services/register", label: t("سجّل جهتك كمقدّم خدمة", "Register as a service provider") },
        { href: "/suppliers", label: t("الموردون والمدخلات", "Suppliers & inputs") },
        { href: "/suppliers/orders", label: t("الطلبات الجماعية", "Group orders") },
        { href: "/verify", label: t("تحقّق من منتج", "Check a product") },
        ...(user
          ? [
              { href: "/contracts", label: t("عقودي", "My contracts") },
              { href: "/services/mine", label: t("جهتي كمقدّم خدمة", "My provider profile") },
              { href: "/partners/mine", label: t("شركتي الشريكة", "My partner company") },
              { href: "/agent", label: t("مزارعيّ: وضع الوكيل", "My farmers: agent mode") },
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
   *
   * It also carries sign-in now. The visitor had a separate «حسابك» section at
   * the bottom whose first link was the same /signup — two doors to one room.
   */
  if (!user) {
    groups.push({
      title: t("مزرعتك وحسابك", "Your farm and account"),
      hint: t("سجّل أرضك ووثّق موسمك — يحتاج حساباً", "Register your land and record your season — needs an account"),
      icon: "wheat",
      items: [
        { href: "/signup", label: t("أنشئ حساباً وسجّل أرضك", "Create an account and register your land") },
        { href: "/login", label: t("لديك حساب؟ ادخل", "Have an account? Sign in") },
      ],
    });
  }

  if (user) {
    groups.push({
      title: t("مزرعتي", "My farm"),
      hint: t("الأرض والمواسم والقطيع", "Land, seasons and herd"),
      icon: "wheat",
      items: [
        { href: "/lands", label: t("أراضيّ", "My land") },
        { href: "/seasons", label: t("مواسمي", "My seasons") },
        { href: "/books", label: t("دفتر حساباتي", "My books") },
        { href: "/my-project", label: t("مشروعي — قائمة المدخلات", "My project — input list") },
        { href: "/herds", label: t("دورات الإنتاج الحيواني", "Livestock production cycles") },
        { href: "/account/agents", label: t("وكلائي: من يعمل عنّي", "My agents: who acts for me") },
        { href: "/opportunities/new", label: t("ارفع فرصة", "Post an opportunity") },
        { href: "/export/offers", label: t("عروضي للتصدير", "My export offers") },
      ],
    });
  }

  // الاستثمار للجميع (البند ١٢٤): المستثمر يتصفّح قبل أن يسجّل، فالبابُ لا
  // ينتظر الدخول. وما يخصّ صاحب الحساب يُضاف إليه.
  groups.push({
    title: user ? t("الاستثمار واستثماري", "Investment and mine") : t("الاستثمار", "Investment"),
    hint: t("أراضٍ موثّقة تبحث عن شريك، ومشاريع مطروحة", "Verified land looking for a partner, and projects on offer"),
    icon: "spark",
    items: [
      { href: "/invest", label: t("فرص الاستثمار", "Investment opportunities") },
      { href: "/projects", label: t("المشاريع المطروحة", "Open projects") },
      ...(user
        ? [
            { href: "/invest/mine", label: t("طلباتي: الشراكة والمعاينة", "My requests: partnership and inspection") },
            { href: "/messages", label: t("الرسائل وراسل سوداقري", "Messages, and write to Sudagri") },
            { href: "/dashboard", label: t("محفظتي", "My portfolio") },
            { href: "/plan", label: t("خطط استثمارك", "Plan your investment") },
          ]
        : []),
    ],
  });

  // النفير قبل الدراسات: بابٌ عامّ يدخله الزائر قبل أن يسجّل،
  // لأنّ دعوةً إلى حصادٍ هذا الأسبوع هي ما قد يجعله يسجّل.
  groups.push({
    title: t("النفير — العمل المشترك", "Nafir — working together"),
    hint: t("الميثاق والنفير والفزعة والشورى والجودية", "Charter, nafir, faza, shura and judiyya"),
    icon: "people",
    items: [
      { href: "/nafir", label: t("ساحة النفير", "Nafir square") },
      { href: "/nafir/charter", label: t("الميثاق", "The charter") },
      { href: "/nafir/faza", label: t("الفزعة", "Faza (rallying help)") },
      { href: "/nafir/shura", label: t("الشورى", "Shura (consultation)") },
      { href: "/nafir/judiyya", label: t("الجودية", "Judiyya (mediation)") },
      { href: "/nafir/canals", label: t("الترع", "Canals") },
      { href: "/nafir/pulse", label: t("نبض الثقة", "Trust pulse") },
    ],
  });

  groups.push({
    title: t("مشاريع ودراسات", "Projects and studies"),
    hint: t("قراءات في أرقام المشاريع الكبرى والاقتصاد، والصادر", "Readings in the numbers of major projects and the economy, and exports"),
    icon: "book",
    items: [
      { href: "/studies", label: t("كلّ الدراسات", "All studies") },
      { href: "/library", label: t("مكتبة الدراسات والبحوث", "Studies and research library") },
      { href: "/studies/exchange-rate", label: t("أزمة سعر الصرف والتضخم", "The exchange-rate and inflation crisis") },
      { href: "/arc-canal", label: t("القناة القوسية", "The Arc Canal") },
      { href: "/export", label: t("ممرّ الصادر السوداني", "Sudan's export corridor") },
      { href: "/export/market", label: t("عروض التصدير المنشورة", "Published export offers") },
    ],
  });

  groups.push({
    title: t("التعدين", "Mining"),
    hint: t("قسم مستقل عن الزراعة", "A section separate from agriculture"),
    icon: "pickaxe",
    items: [
      { href: "/mining", label: t("قسم التعدين", "Mining section") },
      { href: "/mining/registry", label: t("سجلّ إثبات المنشأ", "Proof-of-origin registry") },
      { href: "/mining/gold", label: t("الذهب: السعر والقواعد", "Gold: price and rules") },
    ],
  });

  if (user && role === "admin") {
    groups.push({
      title: t("الإدارة", "Administration"),
      hint: t("للمشرفين وحدهم", "Administrators only"),
      icon: "shield",
      items: [
        {
          href: "/admin/inbox",
          label: pending > 0 ? t(`قائمة المراجعة (${pending})`, `Review list (${pending})`) : t("قائمة المراجعة", "Review list"),
        },
        { href: "/admin", label: t("لوحة المشاريع", "Projects board") },
        // الشاشةُ التي كان إجراؤها موجوداً وهي مفقودة — وبلاها لا تُوثَّق أرضٌ
        // أبداً، فتقف السلسلةُ كلُّها عند خطوتها الأولى.
        { href: "/admin/lands", label: t("توثيق الأراضي", "Land verification") },
        { href: "/admin/review", label: t("مراجعة الفرص", "Opportunity review") },
        { href: "/admin/analytics", label: t("التحليلات", "Analytics") },
        { href: "/admin/news", label: t("الأخبار", "News") },
        { href: "/admin/export", label: t("مراجعة الصادر", "Export review") },
        // اللوائحُ تتغيّر بإعلانٍ لا بجدول، فلا يملأ تاريخَ المراجعة إلّا إنسان.
        { href: "/admin/export/corridors", label: t("مراجعة قواعد الممرّات", "Corridor rules review") },
        { href: "/admin/export/interests", label: t("طلبات المشترين", "Buyer requests") },
        { href: "/admin/providers", label: t("توثيق مقدّمي الخدمة", "Provider verification") },
        // كانت تُبلغ من لوحة المشاريع وحدها، فلا يجدها المدير من القائمة.
        { href: "/admin/suppliers", label: t("الموردون والناقلون والبلاغات", "Suppliers, carriers and reports") },
        { href: "/admin/partners", label: t("الشركات الشريكة واتّفاقاتها", "Partner companies and agreements") },
        { href: "/admin/inspections", label: t("تقارير المعاينة", "Inspection reports") },
        { href: "/admin/prices", label: t("الأسعار التلقائيّة", "Automatic prices") },
        { href: "/admin/accounts", label: t("إغلاق الحسابات", "Closing accounts") },
        { href: "/admin/resets", label: t("استعادة كلمات المرور", "Password recovery") },
        { href: "/admin/faostat", label: t("بيانات الفاو (غلّة وأسعار منتجين)", "FAOSTAT data (yields, producer prices)") },
        { href: "/admin/land-groups", label: t("فهرس مجموعات المزارع", "Farm groups index") },
        { href: "/admin/feedback", label: t("ملاحظات الزوّار", "Visitor feedback") },
        { href: "/admin/library", label: t("مكتبة الدراسات: المراجعة", "Library: review") },
        { href: "/admin/leads", label: t("العملاء المحتملون", "Leads") },
        { href: "/admin/canal-images", label: t("صور القناة", "Canal images") },
      ],
    });
  }

  const account = user ? (
    <>
      <p className="mb-2 text-xs text-muted">
        {t("أنت داخل بحساب", "Signed in as")}{" "}
        <span className="font-bold text-foreground">
          {fullName || t("بلا اسم", "no name")}
        </span>
        {roleLabel && <> — {roleLabel}</>}
      </p>
      {/* البند ١٥١: حسابٌ واحد للجانبين، يُبدَّل بينهما كما في Airbnb. */}
      <SideSwitch role={role ?? null} locale={locale} />
      <SignOutButton />
    </>
  ) : undefined;

  return (
    <>
    <DesktopSidebar groups={groups} account={account} />
    {/* The header stays on screen (backlog 121): the menu is the way around the
        site, and on a long page it was a scroll back to the top away. Opaque,
        not frosted: a backdrop filter would make the header the frame the
        menu's fixed sheet is placed in, and the sheet has to cover the screen;
        and even 95% let the headings scrolling under it show through. */}
    <header className="sticky top-0 z-40 border-b border-border bg-background print:hidden">
      <div className="brand-edge" aria-hidden />
      {/* From `lg` up the name and the menu are in the side column (DesktopSidebar),
          and the bar keeps the actions, at its end. */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:max-w-none lg:justify-end lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-black text-primary sm:text-xl lg:hidden"
        >
          {/*
            السنبلةُ هنا، والشعارُ في الواجهة — وهذا ما طلبه المالك حرفيّاً.

            This header read `🌾 سوداقري` until the logo was put here, which is
            what «صور السنبله الصفرا التي حزفتها» was about: the sorghum he
            missed was this one, not the one inside the artwork. The same
            sentence asked for the logo to get «مكان أوسع وصورة أكبر», and both
            halves point the same way — a 36px slot is where an illustrated
            badge has least to say, and where a single clear mark has most.

            So the logo moved to the hero and the splash at the size it was
            drawn for, and the sorghum came back to the place it was taken from.

            THE EMOJI IS HERE ON PURPOSE — AND AGAINST THE RULE NEXT DOOR

            `Icon.tsx` is an argument for never doing this: an emoji is drawn by
            the device's own font, so this is a different picture on every
            phone, and on hardware whose font predates the codepoint it is a
            hollow rectangle. I offered a drawn one that avoids all of that and
            the owner chose this, having been told. It is his mark and his
            decision, and «قديمة موجوده من اول» is the whole reason — it is not
            a sorghum he wants, it is *this* sorghum, the one that was here.

            So if it ever needs to stop being an emoji, that is his call to
            make and not a tidy-up. `git log` for `SorghumMark` has the drawn
            version ready to restore.

            `aria-hidden` because a screen reader would otherwise announce
            "sheaf of rice" immediately before the name it decorates. The name
            itself stays real text: it scales with the reader's font size, and
            it survives anything failing to draw.
          */}
          <span aria-hidden="true">🌾</span>
          {t("سوداقري", "Sudagri")}
        </Link>

        <div className="flex items-center gap-3">
          {pending > 0 && (
            <Link
              href="/admin/inbox"
              aria-label={t(`قائمة المراجعة، ${pending} ينتظر`, `Review list, ${pending} waiting`)}
              className="whitespace-nowrap rounded-xl bg-primary px-2.5 py-2 text-xs font-black text-primary-foreground shadow-card transition hover:opacity-90"
            >
              {t("للمراجعة", "Review")} {pending > 99 ? "99+" : pending}
            </Link>
          )}
          {user && (
            <Link
              href="/messages"
              aria-label={
                unreadMessages > 0
                  ? t(`الرسائل، ${unreadMessages} غير مقروءة`, `Messages, ${unreadMessages} unread`)
                  : t("الرسائل", "Messages")
              }
              className="relative rounded-xl border border-border bg-card px-2.5 py-2 text-sm transition hover:border-rose"
            >
              💬
              {unreadMessages > 0 && (
                <span className="absolute -end-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[0.65rem] font-bold leading-5 text-white">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </Link>
          )}
          {user && (
            <Link
              href="/notifications"
              aria-label={
                unread > 0
                  ? t(`الإشعارات، ${unread} غير مقروء`, `Notifications, ${unread} unread`)
                  : t("الإشعارات", "Notifications")
              }
              className="relative rounded-xl border border-border bg-card px-2.5 py-2 text-sm transition hover:border-rose"
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
              className="whitespace-nowrap rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground shadow-card transition hover:opacity-90 active:scale-[0.98]"
            >
              {t("ابدأ الآن", "Get started")}
            </Link>
          )}
          <LangToggle />
          <div className="lg:hidden">
            <NavMenu groups={groups} signOut={account} />
          </div>
        </div>
      </div>
    </header>
    {/* البند ١٦٧: يعرّف صندوق الصادر بصاحب الجلسة، ويُظهر ما حُفظ على الهاتف ولم يُرسل. */}
    <OutboxProvider userId={user?.id ?? null} />
    <BottomNav signedIn={Boolean(user)} />
    </>
  );
}
