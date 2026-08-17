import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/Explain";

export const metadata = { title: "عقود الخدمات | سودجري" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  proposed: "معروض",
  active: "سارٍ",
  completed: "منجز",
  cancelled: "ملغى",
  disputed: "متنازع عليه",
};

export default async function ContractsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // One query for both sides of the relationship: RLS already returns exactly
  // the contracts where the caller is the client, the provider, or an admin, so
  // no role branching is needed here.
  const { data: rows } = await supabase
    .from("service_contracts")
    .select("id, title, status, currency, total_amount, created_at, service_providers(name)")
    .order("created_at", { ascending: false });

  const contracts = (rows ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    currency: string;
    total_amount: number;
    created_at: string;
    service_providers: { name: string } | null;
  }[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">عقود الخدمات</h1>
          <p className="mt-1 text-sm text-muted">
            كل عقد مقسّم إلى مراحل، وكل مرحلة تُدفع بعد إثبات تنفيذها.
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          عقد جديد
        </Link>
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          title="لا توجد عقود بعد"
          action={
            <Link
              href="/contracts/new"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              أنشئ أول عقد
            </Link>
          }
        >
          عقد الخدمات يربطك بمكتب هندسة زراعية أو مزوّد موثّق، ويقسّم العمل إلى
          مراحل لكل منها تاريخ ومبلغ. لا تدفع مرحلة قبل أن ترى إثبات تنفيذها.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {contracts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contracts/${c.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50"
              >
                <span>
                  <span className="font-medium">{c.title}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {c.service_providers?.name ?? "مقدّم خدمة"} —{" "}
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </span>
                <span className="font-bold">
                  {n0(c.total_amount)} {c.currency}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
