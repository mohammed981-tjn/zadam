import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/Explain";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginHrefHere } from "@/lib/loginHere";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "عقود الخدمات | سوداقري", "Service contracts | Sudagri") };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  proposed: "معروض",
  active: "سارٍ",
  completed: "منجز",
  cancelled: "ملغى",
  disputed: "متنازع عليه",
};

const STATUS_LABEL_EN: Record<string, string> = {
  draft: "Draft",
  proposed: "Proposed",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export default async function ContractsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

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
    <div className="mx-auto max-w-3xl px-4 py-10 lg:max-w-6xl xl:max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("عقود الخدمات", "Service contracts")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              "كل عقد مقسّم إلى مراحل، وكل مرحلة تُدفع بعد إثبات تنفيذها.",
              "Every contract is split into phases, and each phase is paid after proof that it was delivered.",
            )}
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("عقد جديد", "New contract")}
        </Link>
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          title={t("لا توجد عقود بعد", "No contracts yet")}
          action={
            <Link
              href="/contracts/new"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("أنشئ أول عقد", "Create your first contract")}
            </Link>
          }
        >
          {t(
            "عقد الخدمات يربطك بمكتب هندسة زراعية أو مزوّد موثّق، ويقسّم العمل إلى مراحل لكل منها تاريخ ومبلغ. لا تدفع مرحلة قبل أن ترى إثبات تنفيذها.",
            "A service contract links you with an agricultural engineering office or a verified provider, and splits the work into phases, each with a date and an amount. You never pay for a phase before you see proof it was delivered.",
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {contracts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contracts/${c.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50"
              >
                <span>
                  <span className="font-medium" dir="auto">{c.title}</span>
                  <span className="mt-1 block text-xs text-muted">
                    <bdi>{c.service_providers?.name ?? t("مقدّم خدمة", "Service provider")}</bdi> —{" "}
                    {(locale === "en" ? STATUS_LABEL_EN : STATUS_LABEL)[c.status] ?? c.status}
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
