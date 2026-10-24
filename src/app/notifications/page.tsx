import Link from "next/link";
import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";
import PushToggle from "@/components/PushToggle";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "الإشعارات — سوداقري", "Notifications — Sudagri") };
}

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, string> = {
  land_submitted: "🗂️",
  land_verified: "✅",
  land_rejected: "📝",
  opportunity_submitted: "🗂️",
  opportunity_approved: "✅",
  opportunity_rejected: "📝",
  lead_received: "📞",
  locust_near: "🦗",
  animal_disease: "🐄",
  stage_due: "📅",
  price_alert: "💹",
  investor_interest: "🤝",
  investor_decision: "🤝",
  agreement_update: "✍️",
  agreement_signed: "📜",
  inspection_update: "🔎",
  inspection_report: "📋",
  message: "💬",
  ledger_inspection: "🔎",
  ledger_link: "🤝",
};

export default async function NotificationsPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  // Notices are written in Arabic when they are created; they keep their direction here.
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/notifications"));

  // Scoped to the caller by row-level security, not by a filter written here.
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as Notification[];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("الإشعارات", "Notifications")}</h1>
          <p className="mt-1 text-sm text-muted">
            {en
              ? unread > 0
                ? `${unread} unread`
                : "Nothing unread"
              : unread > 0
                ? `${unread} إشعار غير مقروء`
                : "لا يوجد إشعار غير مقروء"}
          </p>
        </div>

        {unread > 0 && (
          <form action={markAllRead}>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
            >
              {t("تعليم الكل كمقروء", "Mark all as read")}
            </button>
          </form>
        )}
      </div>

      <PushToggle />

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {t("تعذّر تحميل الإشعارات", "Could not load notifications")}: {error.message}
        </p>
      )}

      {!error && notifications.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          <p className="mb-2 font-medium text-foreground">{t("لا توجد إشعارات بعد.", "No notifications yet.")}</p>
          <p>
            {t(
              "ستصلك هنا إشعارات عند اعتماد أرضك أو طلب استكمال مستنداتها، وعند البتّ في أي فرصة ترفعها، وإن رصدت الفاو جراداً قرب أرضك أو مرضَ ماشيةٍ في ولايتها.",
              "You will be notified here when your land is approved or its documents need completing, when a decision is made on any opportunity you submit, and when FAO records locusts near your land or a livestock disease in its state.",
            )}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((n) => {
          const card = (
            <div
              className={`rounded-xl border p-4 ${
                n.read_at
                  ? "border-border bg-card"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-lg leading-none">
                  {KIND_ICON[n.kind] ?? "🔔"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p {...arText} className="font-medium">{n.title}</p>
                    <span className="text-xs text-muted">
                      {timeAgo(n.created_at, locale)}
                    </span>
                  </div>
                  {n.body && (
                    <p {...arText} className="mt-1 text-sm text-muted">{n.body}</p>
                  )}
                </div>
                {!n.read_at && (
                  <span
                    aria-label={t("غير مقروء", "Unread")}
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </div>
            </div>
          );

          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} className="block">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
