import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import type { Investment, Project } from "@/types/database";

type InvestmentRow = Investment & { projects: Project | null };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ invested?: string }>;
}) {
  const { invested } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: investments } = await supabase
    .from("investments")
    .select("*, projects(*)")
    .eq("investor_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (investments ?? []) as unknown as InvestmentRow[];
  const totalInvested = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalShares = rows.reduce((sum, row) => sum + row.shares, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("محفظتي الاستثمارية", "My investment portfolio")}</h1>

      {/* البند ١٥١: الجانب الآخر من الحساب نفسه. */}
      <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        {t("تملك أرضاً؟ سجّلها واعرضها على المستثمرين بالحساب نفسه: ", "Own land? Register it and offer it to investors with the same account: ")}
        <Link href="/lands" className="font-bold text-primary underline">
          {t("أراضيّ", "My land")}
        </Link>
        {" · "}
        <Link href="/invest" className="font-bold text-primary underline">
          {t("فرص الاستثمار", "Investment opportunities")}
        </Link>
      </p>

      {invested === "1" && (
        <p className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {t(
            "تم تسجيل طلب استثمارك بنجاح، بانتظار التأكيد من فريق سوداقري.",
            "Your investment request has been recorded and is awaiting confirmation from the Sudagri team.",
          )}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{t("إجمالي الاستثمار", "Total invested")}</p>
          <p className="mt-1 text-xl font-bold">{formatUsd(totalInvested, locale)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{t("إجمالي الحصص", "Total shares")}</p>
          <p className="mt-1 text-xl font-bold">{totalShares}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{t("عدد المشاريع", "Number of projects")}</p>
          <p className="mt-1 text-xl font-bold">
            {new Set(rows.map((r) => r.project_id)).size}
          </p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">{t("تفاصيل الاستثمارات", "Investment details")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {t("لا توجد استثمارات بعد.", "No investments yet.")}{" "}
          <Link href="/" className="text-primary underline">
            {t("تصفّح المشاريع المتاحة", "Browse available projects")}
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div>
                <Link
                  href={`/projects/${row.projects?.slug}`}
                  className="font-semibold hover:text-primary"
                  {...(row.projects ? arText : {})}
                >
                  {row.projects?.name ?? t("مشروع محذوف", "Deleted project")}
                </Link>
                <p className="text-xs text-muted">
                  {row.shares} {t("حصة", row.shares === 1 ? "share" : "shares")} · {formatUsd(row.amount, locale)} ·{" "}
                  {new Date(row.created_at).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG")}
                </p>
              </div>
              <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs">
                {row.status === "pending"
                  ? t("بانتظار التأكيد", "Awaiting confirmation")
                  : row.status === "confirmed"
                    ? t("مؤكد", "Confirmed")
                    : t("ملغى", "Cancelled")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
