import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";

export const metadata = { title: "الإشعارات — سودجري" };

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
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "الآن";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;

  return new Date(iso).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
          <h1 className="text-2xl font-bold">الإشعارات</h1>
          <p className="mt-1 text-sm text-muted">
            {unread > 0
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
              تعليم الكل كمقروء
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          تعذّر تحميل الإشعارات: {error.message}
        </p>
      )}

      {!error && notifications.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          <p className="mb-2 font-medium text-foreground">لا توجد إشعارات بعد.</p>
          <p>
            ستصلك هنا إشعارات عند اعتماد أرضك أو طلب استكمال مستنداتها، وعند
            البتّ في أي فرصة ترفعها.
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
                    <p className="font-medium">{n.title}</p>
                    <span className="text-xs text-muted">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-sm text-muted">{n.body}</p>
                  )}
                </div>
                {!n.read_at && (
                  <span
                    aria-label="غير مقروء"
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
