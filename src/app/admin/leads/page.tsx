import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/database";

const roleLabel: Record<string, string> = {
  investor: "مستثمر",
  farmer: "مزارع",
  other: "أخرى",
};

export default async function LeadsPage() {
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

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء المحتملون</h1>
        <Link href="/admin" className="text-sm text-primary underline">
          العودة للوحة الإدارة
        </Link>
      </div>

      {!leads || leads.length === 0 ? (
        <p className="text-sm text-muted">
          لا يوجد عملاء محتملون بعد — تظهر هنا فور تواصل أي زائر عبر المساعد.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(leads as Lead[]).map((lead) => (
            <li
              key={lead.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{lead.full_name}</p>
                  <p className="text-sm text-muted">{lead.contact}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {roleLabel[lead.role] ?? lead.role}
                </span>
              </div>
              {lead.interest && (
                <p className="mt-2 text-sm text-foreground/80">
                  الاهتمام: {lead.interest}
                </p>
              )}
              <time className="mt-2 block text-xs text-muted">
                {new Date(lead.created_at).toLocaleString("ar-EG")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
