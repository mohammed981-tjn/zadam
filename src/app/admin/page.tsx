import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, statusLabel } from "@/lib/format";
import type { Project } from "@/types/database";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة إدارة المشاريع</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/analytics"
            className="text-sm text-primary underline"
          >
            التحليلات
          </Link>
          <Link href="/admin/review" className="text-sm text-primary underline">
            مراجعة الفرص
          </Link>
          <Link href="/admin/leads" className="text-sm text-primary underline">
            العملاء المحتملون
          </Link>
          <Link
            href="/admin/projects/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + مشروع جديد
          </Link>
        </div>
      </div>

      {!projects || projects.length === 0 ? (
        <p className="text-sm text-muted">لا توجد مشاريع بعد.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-right">
              <tr>
                <th className="px-4 py-3">المشروع</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">التمويل</th>
                <th className="px-4 py-3">سعر الحصة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(projects as Project[]).map((project) => (
                <tr key={project.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{project.name}</td>
                  <td className="px-4 py-3">{statusLabel(project.status)}</td>
                  <td className="px-4 py-3">
                    {project.shares_sold}/{project.total_shares}
                  </td>
                  <td className="px-4 py-3">
                    {formatUsd(project.price_per_share)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-primary underline"
                    >
                      إدارة
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
