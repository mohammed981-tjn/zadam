import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain from "@/components/Explain";
import MilestoneProof from "@/components/MilestoneProof";
import { setMilestoneStatus } from "@/app/contracts/actions";
import { SERVICE_UNIT_LABEL } from "@/lib/services";
import type { ContractMilestone, MilestoneStatus } from "@/types/database";

export const metadata = { title: "عقد خدمات | سودجري" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const STATUS: Record<MilestoneStatus, { label: string; className: string }> = {
  pending: { label: "لم تبدأ", className: "text-muted" },
  in_progress: { label: "جارية", className: "text-accent" },
  submitted: { label: "سُلّمت — بانتظار الاعتماد", className: "text-accent" },
  approved: { label: "معتمدة", className: "text-primary" },
  paid: { label: "مدفوعة", className: "text-primary" },
  rejected: { label: "مرفوضة", className: "text-danger" },
};

/** The one action that makes sense next, given where the phase has got to. */
const NEXT: Partial<Record<MilestoneStatus, { status: string; label: string }>> =
  {
    pending: { status: "in_progress", label: "ابدأ التنفيذ" },
    in_progress: { status: "submitted", label: "سلّم المرحلة" },
    submitted: { status: "approved", label: "اعتمد المرحلة" },
    approved: { status: "paid", label: "سجّل الدفع" },
  };

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorMessage } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS returns the contract only to its two parties and to admins, so a
  // stranger's request lands on notFound rather than on a permission message
  // that would confirm the contract exists.
  const { data: contractRow } = await supabase
    .from("service_contracts")
    .select("id, title, status, currency, total_amount, season_id, signed_at, service_providers(name)")
    .eq("id", id)
    .single();

  if (!contractRow) notFound();

  const contract = contractRow as unknown as {
    id: string;
    title: string;
    status: string;
    currency: string;
    total_amount: number;
    season_id: string | null;
    signed_at: string | null;
    service_providers: { name: string } | null;
  };

  const { data: milestoneRows } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("contract_id", id)
    .order("seq");

  const milestones = (milestoneRows ?? []) as ContractMilestone[];

  const { data: proofRows } = await supabase
    .from("milestone_evidence")
    .select("id, milestone_id, kind, caption, latitude, longitude, captured_at")
    .in("milestone_id", milestones.map((m) => m.id));

  const proofCount = new Map<string, number>();
  for (const p of (proofRows ?? []) as { milestone_id: string }[]) {
    proofCount.set(p.milestone_id, (proofCount.get(p.milestone_id) ?? 0) + 1);
  }

  const paid = milestones
    .filter((m) => m.status === "paid")
    .reduce((s, m) => s + Number(m.amount), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{contract.title}</h1>
      <p className="mt-2 text-sm text-muted">
        مع {contract.service_providers?.name ?? "مقدّم خدمة"} —{" "}
        {milestones.length} مراحل
      </p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">إجمالي العقد</p>
          <p className="text-lg font-bold">
            {n0(contract.total_amount)} {contract.currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">المدفوع</p>
          <p className="text-lg font-bold">{n0(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">المتبقّي</p>
          <p className="text-lg font-bold">
            {n0(Number(contract.total_amount) - paid)}
          </p>
        </div>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
          {errorMessage}
        </p>
      )}

      <Explain tone="why">
        {/* Stated once, at the top, so nobody has to discover the rule by
            being refused by it. */}
        الدفع يتبع الإثبات: لا تُعتمد مرحلة قبل رفع صورة أو تقرير من الموقع، ولا
        تُعتمد قبل اعتماد المرحلة التي تسبقها، ولا يُسجَّل دفع قبل الاعتماد. هذه
        قواعد في قاعدة البيانات نفسها — لا يمكن تجاوزها من أي شاشة.
      </Explain>

      <ol className="mt-6 flex flex-col gap-4">
        {milestones.map((m) => {
          const proofs = proofCount.get(m.id) ?? 0;
          const next = NEXT[m.status];
          const blocked = m.status === "submitted" && m.requires_evidence && proofs === 0;

          return (
            <li
              key={m.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">
                  {m.seq}. {m.title}
                </h2>
                <span className={`text-sm ${STATUS[m.status].className}`}>
                  {STATUS[m.status].label}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted">
                {n0(m.quantity)} {SERVICE_UNIT_LABEL[m.unit]} ×{" "}
                {n0(m.unit_price)} = <strong>{n0(m.amount)}</strong>
                {m.planned_start && (
                  <>
                    {" "}
                    — من {m.planned_start}
                    {m.planned_end && ` إلى ${m.planned_end}`}
                  </>
                )}
              </p>

              <p className="mt-2 text-xs text-muted">
                {proofs > 0
                  ? `${proofs} إثبات مرفوع`
                  : m.requires_evidence
                    ? "لا يوجد إثبات بعد"
                    : "لا يتطلب إثباتاً"}
              </p>

              {(m.status === "in_progress" || m.status === "submitted") && (
                <div className="mt-4">
                  <MilestoneProof milestoneId={m.id} contractId={contract.id} />
                </div>
              )}

              {blocked && (
                <p className="mt-3 text-xs text-danger">
                  ارفع إثبات تنفيذ واحداً على الأقل قبل الاعتماد.
                </p>
              )}

              {next && (
                <form action={setMilestoneStatus} className="mt-4">
                  <input type="hidden" name="milestone_id" value={m.id} />
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <input type="hidden" name="status" value={next.status} />
                  <button
                    type="submit"
                    disabled={blocked}
                    className="rounded-lg border border-primary px-4 py-1.5 text-sm font-medium text-primary disabled:opacity-40"
                  >
                    {next.label}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ol>

      {contract.season_id && (
        <p className="mt-8 text-sm">
          <Link
            href={`/seasons/${contract.season_id}`}
            className="text-primary underline"
          >
            عرض الموسم الذي بُني عليه هذا العقد ←
          </Link>
        </p>
      )}
    </div>
  );
}
