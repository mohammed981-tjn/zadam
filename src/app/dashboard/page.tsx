import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/format";
import type { Investment, Project } from "@/types/database";

type InvestmentRow = Investment & { projects: Project | null };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ invested?: string }>;
}) {
  const { invested } = await searchParams;
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
      <h1 className="text-2xl font-bold">محفظتي الاستثمارية</h1>

      {invested === "1" && (
        <p className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          تم تسجيل طلب استثمارك بنجاح، بانتظار التأكيد من فريق سودجري.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">إجمالي الاستثمار</p>
          <p className="mt-1 text-xl font-bold">{formatUsd(totalInvested)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">إجمالي الحصص</p>
          <p className="mt-1 text-xl font-bold">{totalShares}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">عدد المشاريع</p>
          <p className="mt-1 text-xl font-bold">
            {new Set(rows.map((r) => r.project_id)).size}
          </p>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">تفاصيل الاستثمارات</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          لا توجد استثمارات بعد.{" "}
          <Link href="/" className="text-primary underline">
            تصفّح المشاريع المتاحة
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
                >
                  {row.projects?.name ?? "مشروع محذوف"}
                </Link>
                <p className="text-xs text-muted">
                  {row.shares} حصة · {formatUsd(row.amount)} ·{" "}
                  {new Date(row.created_at).toLocaleDateString("ar-EG")}
                </p>
              </div>
              <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs">
                {row.status === "pending"
                  ? "بانتظار التأكيد"
                  : row.status === "confirmed"
                    ? "مؤكد"
                    : "ملغى"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
