import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Explain from "@/components/Explain";
import MilestoneProof from "@/components/MilestoneProof";
import { setMilestoneStatus, setContractStatus } from "@/app/contracts/actions";
import { SERVICE_CATALOGUE, serviceUnitLabel } from "@/lib/services";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { loginHrefHere } from "@/lib/loginHere";
import type {
  ContractMilestone,
  MilestoneEvidence,
  MilestoneStatus,
} from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "عقد خدمات | سوداقري", "Service contract | Sudagri") };
}

/**
 * A phase title in the reader's language. Titles are stored as the catalogue's
 * Arabic name at the time of signing; one that still matches the catalogue is
 * shown in English, anything else as written.
 */
function phaseTitle(title: string, locale: Locale): string {
  if (locale !== "en") return title;
  return SERVICE_CATALOGUE.find((d) => d.name === title)?.nameEn ?? title;
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const STATUS: Record<
  MilestoneStatus,
  { label: string; labelEn: string; className: string }
> = {
  pending: { label: "لم تبدأ", labelEn: "Not started", className: "text-muted" },
  in_progress: { label: "جارية", labelEn: "In progress", className: "text-accent" },
  submitted: {
    label: "سُلّمت — بانتظار الاعتماد",
    labelEn: "Submitted — awaiting approval",
    className: "text-accent",
  },
  approved: { label: "معتمدة", labelEn: "Approved", className: "text-primary" },
  paid: { label: "مدفوعة", labelEn: "Paid", className: "text-primary" },
  rejected: { label: "مرفوضة", labelEn: "Rejected", className: "text-danger" },
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

const EVIDENCE_KIND_LABEL_EN: Record<string, string> = {
  photo: "Photo",
  invoice: "Invoice",
  inspection: "Inspection",
  report: "Report",
  note: "Note",
};

/**
 * The capture date, in Khartoum time.
 *
 * Rendered with an explicit time zone rather than the server's. The date a
 * photograph was taken is the whole point of storing it, and a proof taken at
 * nine in the evening in Khartoum must not read as the following day because
 * the page was rendered in UTC.
 */
function captured(iso: string, locale: Locale = "ar"): string {
  return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MilestoneActor = "provider" | "client";

/** حالُ العقد نفسِه — لا حالُ مراحله. */
const CONTRACT_STATE: Record<
  string,
  { label: string; labelEn: string; className: string; says: string; saysEn: string }
> = {
  draft: {
    label: "مسودة",
    labelEn: "Draft",
    className: "bg-muted/10 text-muted",
    says: "لم يُعرض بعد على مقدّم الخدمة. عدّل ما شئت — المراحل والأسعار ما تزال قابلة للتغيير، ولا عمل يبدأ.",
    saysEn: "Not yet proposed to the service provider. Change what you like — the phases and prices can still be changed, and no work starts.",
  },
  proposed: {
    label: "معروض",
    labelEn: "Proposed",
    className: "bg-accent/10 text-accent",
    says: "بانتظار قبول مقدّم الخدمة. والشروط تجمّدت لحظة العرض: لا يُغيَّر سعر ولا كمية ولا تُضاف مرحلة أو تُحذف، حتى يُسحب العرض.",
    saysEn: "Waiting for the service provider to accept. The terms froze the moment it was proposed: no price or quantity changes, and no phase is added or removed, until the proposal is withdrawn.",
  },
  active: {
    label: "سارٍ",
    labelEn: "Active",
    className: "bg-primary/10 text-primary",
    says: "وقّع الطرفان. المراحل تتحرّك الآن، والدفع يتبع الإثبات.",
    saysEn: "Both parties have signed. The phases now move forward, and payment follows proof.",
  },
  completed: {
    label: "منجز",
    labelEn: "Completed",
    className: "bg-primary/10 text-primary",
    says: "أُقفل بعد اعتماد كل مراحله.",
    saysEn: "Closed after all of its phases were approved.",
  },
  cancelled: {
    label: "ملغى",
    labelEn: "Cancelled",
    className: "bg-danger/10 text-danger",
    says: "أُلغي قبل أن يسري.",
    saysEn: "Cancelled before it took effect.",
  },
  disputed: {
    label: "متنازع عليه",
    labelEn: "Disputed",
    className: "bg-danger/10 text-danger",
    says: "أُعلن عليه نزاع. ولا يتحرّك بعدها إلا بقرار من الإدارة.",
    saysEn: "A dispute has been declared. It moves only on a decision by the administrators.",
  },
};

/**
 * الخطواتُ المتاحةُ لهذا القارئ الآن — والخريطةُ نسخةٌ من خريطة القاعدة.
 *
 * `enforce_contract_status` is the rule. This mirrors it so a person is not
 * offered a button that the database will refuse, which is a worse experience
 * than not seeing the button at all. It is **not** the boundary: a form posted
 * directly still has to get past the trigger, and the trigger's Arabic message
 * is what comes back.
 *
 * Where the two disagree, the database is right and this is a bug.
 */
function contractMoves(
  status: string,
  who: { isClient: boolean; isProvider: boolean; isAdmin: boolean },
  locale: Locale = "ar",
): { status: string; label: string; danger?: boolean }[] {
  const { isClient, isProvider, isAdmin } = who;
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const moves: { status: string; label: string; danger?: boolean }[] = [];

  if (status === "draft") {
    if (isClient) moves.push({ status: "proposed", label: t("اعرضه على مقدّم الخدمة", "Propose it to the service provider") });
    if (isClient) moves.push({ status: "cancelled", label: t("ألغِ المسودة", "Cancel the draft"), danger: true });
  } else if (status === "proposed") {
    if (isProvider) moves.push({ status: "active", label: t("أقبل العقد", "Accept the contract") });
    if (isClient) moves.push({ status: "draft", label: t("اسحب العرض للتعديل", "Withdraw the proposal to edit it") });
    if (isClient || isProvider) {
      moves.push({ status: "cancelled", label: t("ألغِ العقد", "Cancel the contract"), danger: true });
    }
  } else if (status === "active") {
    if (isClient) moves.push({ status: "completed", label: t("أقفل العقد", "Close the contract") });
  } else if (status === "disputed" && isAdmin) {
    moves.push({ status: "active", label: t("أعِده سارياً", "Make it active again") });
    moves.push({ status: "completed", label: t("أقفله منجزاً", "Close it as completed") });
    moves.push({ status: "cancelled", label: t("أقفله ملغى", "Close it as cancelled"), danger: true });
  }

  // والنزاعُ بابٌ لا يُغلق: من «سارٍ» ومن «منجز» ومن «ملغى» سواء، ولأيّ الطرفين.
  // وأكثرُ ما يُكتشف الخللُ بعد الإقفال لا قبله.
  if (
    ["active", "completed", "cancelled"].includes(status) &&
    (isClient || isProvider)
  ) {
    moves.push({ status: "disputed", label: t("أعلن نزاعاً", "Declare a dispute"), danger: true });
  }

  return moves;
}

const NEXT: Partial<
  Record<
    MilestoneStatus,
    { status: string; label: string; labelEn: string; actor: MilestoneActor }
  >
> = {
  pending: { status: "in_progress", label: "ابدأ التنفيذ", labelEn: "Start the work", actor: "provider" },
  in_progress: { status: "submitted", label: "سلّم المرحلة", labelEn: "Submit the phase", actor: "provider" },
  submitted: { status: "approved", label: "اعتمد المرحلة", labelEn: "Approve the phase", actor: "client" },
  approved: { status: "paid", label: "سجّل الدفع", labelEn: "Record the payment", actor: "client" },
};

/** What the other side is waiting for, so a disabled screen still explains itself. */
const WAITING_ON: Record<MilestoneActor, string> = {
  provider: "بانتظار مقدّم الخدمة",
  client: "بانتظار العميل",
};

const WAITING_ON_EN: Record<MilestoneActor, string> = {
  provider: "Waiting for the service provider",
  client: "Waiting for the client",
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
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

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

  const rawState = CONTRACT_STATE[contract.status];
  const state = rawState
    ? {
        label: en ? rawState.labelEn : rawState.label,
        className: rawState.className,
        says: en ? rawState.saysEn : rawState.says,
      }
    : { label: contract.status, className: "bg-muted/10 text-muted", says: "" };
  const moves = contractMoves(contract.status, {
    // `isClient` أعلاه يشمل الإدارة عمداً، فيُستخرج الدورُ الصريحُ هنا حتّى
    // لا يُعرض على المدير زرُّ العميل وزرُّ الإدارة معاً على النزاع نفسه.
    isClient: contract.client_id === user.id,
    isProvider,
    isAdmin,
  }, locale);
  // والعملُ لا يتحرّك إلّا على عقدٍ سارٍ — قاعدةٌ في الزناد، ومرآتُها هنا حتّى
  // لا يُعرض زرٌّ ترفضه القاعدة.
  const contractRunning = contract.status === "active";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold" dir="auto">{contract.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("مع", "With")} <bdi>{contract.service_providers?.name ?? t("مقدّم خدمة", "a service provider")}</bdi> —{" "}
        {milestones.length} {t("مراحل", "phases")}
      </p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">{t("إجمالي العقد", "Contract total")}</p>
          <p className="text-lg font-bold">
            {n0(contract.total_amount)} {contract.currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("المدفوع", "Paid")}</p>
          <p className="text-lg font-bold">{n0(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("المتبقّي", "Remaining")}</p>
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

      {/*
        حالُ العقد، والخطوةُ التالية، في مكانٍ واحد.
        Until this shipped, `contract_status` had six values and the platform
        could write exactly one of them: every contract ever built was born
        `draft` and stayed there, because nothing in `src/` touched the column.
        The page did not show the state either, so there was nothing to notice.
      */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${state.className}`}
          >
            {state.label}
          </span>
          {contract.signed_at && (
            <span className="text-xs text-muted">
              {t("وُقّع", "Signed")} {captured(contract.signed_at, locale)}
            </span>
          )}
        </div>

        <p className="mt-3 text-sm leading-7 text-muted">{state.says}</p>

        {moves.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {moves.map((mv) => (
              <form key={mv.status} action={setContractStatus}>
                <input type="hidden" name="contract_id" value={contract.id} />
                <input type="hidden" name="status" value={mv.status} />
                <button
                  type="submit"
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    mv.danger
                      ? "border border-danger/40 text-danger hover:bg-danger/5"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  {mv.label}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">
            {contract.status === "proposed"
              ? t("بانتظار الطرف الآخر — لا خطوة لك الآن.", "Waiting for the other party — there is nothing for you to do now.")
              : t("لا خطوة متاحة لك على هذا العقد الآن.", "There is no step available to you on this contract right now.")}
          </p>
        )}
      </div>

      <Explain tone="why">
        {/* Stated once, at the top, so nobody has to discover the rule by
            being refused by it. */}
        {t(
          "الدفع يتبع الإثبات: لا تُعتمد مرحلة قبل رفع صورة أو تقرير من الموقع، ولا تُعتمد قبل اعتماد المرحلة التي تسبقها، ولا يُسجَّل دفع قبل الاعتماد. هذه قواعد في قاعدة البيانات نفسها — لا يمكن تجاوزها من أي شاشة.",
          "Payment follows proof: a phase is not approved before a photo or report from the site is uploaded, nor before the phase before it is approved, and no payment is recorded before approval. These rules live in the database itself — no screen can get around them.",
        )}
      </Explain>

      <ol className="mt-6 flex flex-col gap-4">
        {milestones.map((m) => {
          const evidence = proofs.get(m.id) ?? [];
          const next = NEXT[m.status];
          // A person can be both sides at once — a provider contracting a
          // season they own. Checking the entitled side rather than the
          // excluded one keeps that case working.
          const mine =
            contractRunning &&
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
                  {m.seq}. <bdi>{phaseTitle(m.title, locale)}</bdi>
                </h2>
                <span className={`text-sm ${STATUS[m.status].className}`}>
                  {en ? STATUS[m.status].labelEn : STATUS[m.status].label}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted">
                {n0(m.quantity)} {serviceUnitLabel(m.unit, locale)} ×{" "}
                {n0(m.unit_price)} = <strong>{n0(m.amount)}</strong>
                {m.planned_start && (
                  <>
                    {" "}
                    — {t("من", "from")} {m.planned_start}
                    {m.planned_end && ` ${t("إلى", "to")} ${m.planned_end}`}
                  </>
                )}
              </p>

              {evidence.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {m.requires_evidence
                    ? t("لا يوجد إثبات بعد", "No proof yet")
                    : t("لا يتطلب إثباتاً", "No proof required")}
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
                          {(en ? EVIDENCE_KIND_LABEL_EN : EVIDENCE_KIND_LABEL)[p.kind] ?? p.kind}
                        </span>
                        {p.caption && <span dir="auto">{p.caption}</span>}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                        <span>
                          {p.captured_at
                            ? `${t("التُقط", "Taken")} ${captured(p.captured_at, locale)}`
                            : t("بلا تاريخ التقاط", "No capture date")}
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
                          <span>{t("بلا إحداثيات", "No coordinates")}</span>
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
                  {t(
                    "ارفع إثبات تنفيذ واحداً على الأقل قبل الاعتماد.",
                    "Upload at least one proof of delivery before approval.",
                  )}
                </p>
              )}

              {next && !mine && (
                <p className="mt-4 text-xs text-muted">
                  {/* والسببُ الصحيح، لا أقربُ سببٍ في متناول اليد: قبل السريان
                      لا أحدَ منتظَر — العقدُ نفسُه هو ما ينقص. وقولُ «بانتظار
                      مقدّم الخدمة» على مسودّةٍ يرسل العميلَ يطالب رجلاً لم
                      يتّفق معه بعد. */}
                  {contractRunning
                    ? en
                      ? `${WAITING_ON_EN[next.actor]}: ${next.labelEn}.`
                      : `${WAITING_ON[next.actor]}: ${next.label}.`
                    : en
                      ? `Phases do not move while the contract is “${state.label}” — no work before agreement.`
                      : `المراحل لا تتحرّك ما دام العقد «${state.label}» — لا عمل قبل الاتفاق.`}
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
                    {en ? next.labelEn : next.label}
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
            {en
              ? "View the season this contract was built on →"
              : "عرض الموسم الذي بُني عليه هذا العقد ←"}
          </Link>
        </p>
      )}
    </div>
  );
}
