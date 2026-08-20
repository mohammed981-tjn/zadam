import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain from "@/components/Explain";
import MilestoneProof from "@/components/MilestoneProof";
import { setMilestoneStatus } from "@/app/contracts/actions";
import { SERVICE_UNIT_LABEL } from "@/lib/services";
import type {
  ContractMilestone,
  MilestoneEvidence,
  MilestoneStatus,
} from "@/types/database";

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

/**
 * The one action that makes sense next — and whose it is.
 *
 * Approval is the single step that separates "claimed done" from "agreed done",
 * so it belongs to the party being asked to agree. Until now this table did not
 * mention the actor at all, and the page rendered the same button to both
 * sides: a provider looking at its own submitted phase was offered "اعتمد
 * المرحلة", and then "سجّل الدفع" — a contract walked to settled without the
 * client ever acting.
 *
 * `actor` mirrors the database guard exactly rather than approximating it. This
 * is a usability fix, not a boundary: hiding a button stops an honest mistake,
 * and a form POSTed directly still has to get past the trigger. The two must
 * agree or the reader is told one thing and the database enforces another.
 */
/** What each kind of proof is, in words a client reads rather than a column name. */
const EVIDENCE_KIND_LABEL: Record<string, string> = {
  photo: "صورة",
  invoice: "فاتورة",
  inspection: "معاينة",
  report: "تقرير",
  note: "ملاحظة",
};

/**
 * The capture date, in Khartoum time.
 *
 * Rendered with an explicit time zone rather than the server's. The date a
 * photograph was taken is the whole point of storing it, and a proof taken at
 * nine in the evening in Khartoum must not read as the following day because
 * the page was rendered in UTC.
 */
function captured(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MilestoneActor = "provider" | "client";

const NEXT: Partial<
  Record<
    MilestoneStatus,
    { status: string; label: string; actor: MilestoneActor }
  >
> = {
  pending: { status: "in_progress", label: "ابدأ التنفيذ", actor: "provider" },
  in_progress: { status: "submitted", label: "سلّم المرحلة", actor: "provider" },
  submitted: { status: "approved", label: "اعتمد المرحلة", actor: "client" },
  approved: { status: "paid", label: "سجّل الدفع", actor: "client" },
};

/** What the other side is waiting for, so a disabled screen still explains itself. */
const WAITING_ON: Record<MilestoneActor, string> = {
  provider: "بانتظار مقدّم الخدمة",
  client: "بانتظار العميل",
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
    .select(
      "id, title, client_id, status, currency, total_amount, season_id, signed_at, service_providers(name, owner_id)",
    )
    .eq("id", id)
    .single();

  if (!contractRow) notFound();

  const contract = contractRow as unknown as {
    id: string;
    title: string;
    client_id: string;
    status: string;
    currency: string;
    total_amount: number;
    season_id: string | null;
    signed_at: string | null;
    service_providers: { name: string; owner_id: string } | null;
  };

  /*
   * Which side of this contract the viewer is on.
   *
   * An admin counts as the client here because the database guard lets an
   * admin act on either side — dispute resolution is the whole reason that
   * exemption exists, and a screen that hid the button from the one person
   * brought in to unblock the dispute would defeat it.
   *
   * Anyone who is neither is not reading this page: row-level security returns
   * the contract only to its two parties and to admins, so a stranger already
   * landed on notFound above.
   */
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = (viewerProfile as { role: string } | null)?.role === "admin";

  const isClient = contract.client_id === user.id || isAdmin;
  const isProvider = contract.service_providers?.owner_id === user.id;

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

  /*
   * The evidence itself, not just how much of it there is.
   *
   * These four columns — kind, caption, captured_at, latitude/longitude — were
   * already being selected and then thrown away: the page counted the rows and
   * rendered "٣ إثبات مرفوع". That is the one number that cannot tell a
   * reviewer anything, and it made the whole EXIF path pointless. The uploader
   * reads the date and the coordinates off the original *before* compressing,
   * precisely because compression destroys them and because they are what makes
   * a photograph evidence rather than a picture — and then nobody saw them.
   *
   * It matters more now that approval belongs to the client. The party being
   * asked to agree that work was done is the party that needs to see when and
   * where the proof of it was taken.
   */
  const proofs = new Map<string, MilestoneEvidence[]>();
  for (const p of (proofRows ?? []) as MilestoneEvidence[]) {
    proofs.set(p.milestone_id, [...(proofs.get(p.milestone_id) ?? []), p]);
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
          const evidence = proofs.get(m.id) ?? [];
          const next = NEXT[m.status];
          // A person can be both sides at once — a provider contracting a
          // season they own. Checking the entitled side rather than the
          // excluded one keeps that case working.
          const mine =
            next !== undefined &&
            (next.actor === "client" ? isClient : isProvider);
          const blocked =
            m.status === "submitted" && m.requires_evidence && evidence.length === 0;

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

              {evidence.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {m.requires_evidence ? "لا يوجد إثبات بعد" : "لا يتطلب إثباتاً"}
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {evidence.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg bg-background px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">
                          {EVIDENCE_KIND_LABEL[p.kind] ?? p.kind}
                        </span>
                        {p.caption && <span>{p.caption}</span>}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                        <span>
                          {p.captured_at
                            ? `التُقط ${captured(p.captured_at)}`
                            : "بلا تاريخ التقاط"}
                        </span>

                        {/*
                          A link out rather than an embedded map: this is a
                          check a reviewer makes occasionally, and it does not
                          justify loading a map library into every contract
                          page. Coordinates are also printed as text so the
                          record survives without the link.
                        */}
                        {p.latitude !== null && p.longitude !== null ? (
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=15/${p.latitude}/${p.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                            dir="ltr"
                          >
                            {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                          </a>
                        ) : (
                          <span>بلا إحداثيات</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

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

              {next && !mine && (
                <p className="mt-4 text-xs text-muted">
                  {WAITING_ON[next.actor]}: {next.label}.
                </p>
              )}

              {next && mine && (
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
