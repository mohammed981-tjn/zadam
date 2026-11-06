import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n";
import { dbMessage } from "@/lib/dbMessages";
import { explain } from "@/lib/supplyActions";

/**
 * The steps that move a contract, one copy for the website and the phone app (backlog 203).
 *
 * The website's actions (src/app/contracts/actions.ts, src/app/market/forward/actions.ts and
 * src/app/invest/agreements/actions.ts) read a form and redirect; the app's routes under /api/app/contracts read
 * JSON and answer JSON. Both hand the request to the functions here, which take the caller's own client — the
 * cookie session on the website, the bearer session in the app — so row-level security, the contract triggers and
 * the database functions decide exactly the same things for both. Nothing here holds an elevated key, and nothing
 * here is a rule: the rules are in the database (enforce_contract_status, service_contracts_status_gate,
 * forward_contract_*, partnership_agreement_sign). What is here is the spelling check and the Arabic sentence.
 *
 * scripts/verify-app-contracts-invest.ts holds the website's actions and the app's routes to these functions.
 */

export type Say = { locale: Locale; t: (ar: string, en: string) => string };
export type StepResult<T = null> = { ok: true; data: T } | { ok: false; message: string; invalid?: boolean };

// ── عقود الخدمة ──────────────────────────────────────────────────────────────

/**
 * The contract states a request may name. Not the rule — `enforce_contract_status` is — but a spelling check that
 * keeps a malformed request from reaching the database as an enum cast error. See the note on setContractStatus.
 */
export const CONTRACT_STATES = ["draft", "proposed", "active", "completed", "cancelled", "disputed"] as const;

/**
 * Moves a service contract from one state to another: propose, accept (the provider's signature), withdraw,
 * cancel, complete, dispute. The trigger says who may take which step and refuses in Arabic.
 *
 * `invalid` marks a request that never reached the database (no contract, or a state that does not exist); the
 * website ignores those silently, as it always did, and the app answers them with a sentence.
 */
export async function moveServiceContract(
  supabase: SupabaseClient,
  contractId: string,
  status: string,
  say: Say,
): Promise<StepResult> {
  if (!contractId || !(CONTRACT_STATES as readonly string[]).includes(status)) {
    return { ok: false, invalid: true, message: say.t("خطوةٌ غير معروفة.", "Unknown step.") };
  }
  const { data, error } = await supabase.from("service_contracts").update({ status }).eq("id", contractId).select("id");
  // رسائلُ الزناد مكتوبةٌ للقارئ لا للمطوّر — «قبولُ العقد من صلاحية مقدّم الخدمة» — فتُمرَّر كما هي.
  if (error) return { ok: false, message: dbMessage(error.message, say.locale) };
  // ورفضُ سياسة الصفوف لا يرفع خطأً ولا يمسّ صفّاً، فيُقرأ نجاحاً. هذا الفرعُ هو الفرقُ بين «لم يحدث شيء» و«حدث».
  if ((data ?? []).length === 0) {
    return {
      ok: false,
      message: say.t("لم يتغيّر العقد — لا صلاحية لك عليه", "The contract did not change — you do not have permission on it"),
    };
  }
  return { ok: true, data: null };
}

// ── العقد الآجل ──────────────────────────────────────────────────────────────

/** What a later step of a forward contract may carry with it. */
export interface ForwardFields {
  reason?: string;
  deliveredQuantity?: number | null;
  deliveredOn?: string | null;
  /** "yes" | "no" | anything else (not said). */
  gradeMet?: string;
  /** A penalty the administration awards in a dispute, within the contract's clause; the database checks the ceiling. */
  penalty?: number | null;
  penaltyPayer?: string | null;
}

export const FORWARD_STEPS = [
  "sign",
  "decline",
  "withdraw",
  "deliver",
  "confirm",
  "cancel",
  "cancel_yes",
  "cancel_no",
  "dispute",
  "resume",
  "close_done",
  "close_cancel",
] as const;
export type ForwardStep = (typeof FORWARD_STEPS)[number];

type RpcCall = () => PromiseLike<{ error: { code?: string; message?: string } | null }>;

/**
 * One step on a forward contract (backlog 170): `step` names it, and the database function behind it decides
 * whether the caller may take it. «أوقّع العقد» is `forward_contract_answer(p_sign => true)`.
 */
export async function forwardStep(
  supabase: SupabaseClient,
  id: string,
  step: string,
  f: ForwardFields,
  say: Say,
): Promise<StepResult> {
  const reason = f.reason ?? "";
  const penalty = f.penalty ? { p_penalty: f.penalty, p_penalty_payer: f.penaltyPayer || null } : {};
  const calls: Record<ForwardStep, RpcCall> = {
    sign: () => supabase.rpc("forward_contract_answer", { p_id: id, p_sign: true }),
    decline: () => supabase.rpc("forward_contract_answer", { p_id: id, p_sign: false }),
    withdraw: () => supabase.rpc("forward_contract_withdraw", { p_id: id }),
    deliver: () =>
      supabase.rpc("forward_contract_deliver", {
        p_id: id,
        p_quantity: f.deliveredQuantity ?? null,
        p_on: f.deliveredOn || null,
        p_grade_met: f.gradeMet === "yes" ? true : f.gradeMet === "no" ? false : null,
        p_note: reason || null,
      }),
    confirm: () => supabase.rpc("forward_contract_confirm", { p_id: id }),
    cancel: () => supabase.rpc("forward_contract_cancel_request", { p_id: id, p_reason: reason }),
    cancel_yes: () => supabase.rpc("forward_contract_cancel_answer", { p_id: id, p_agree: true }),
    cancel_no: () => supabase.rpc("forward_contract_cancel_answer", { p_id: id, p_agree: false }),
    dispute: () => supabase.rpc("forward_contract_dispute", { p_id: id, p_reason: reason }),
    resume: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "resume", p_note: reason, ...penalty }),
    close_done: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "completed", p_note: reason, ...penalty }),
    close_cancel: () => supabase.rpc("forward_contract_resolve", { p_id: id, p_outcome: "cancelled", p_note: reason, ...penalty }),
  };
  const call = (FORWARD_STEPS as readonly string[]).includes(step) ? calls[step as ForwardStep] : undefined;
  if (!call) return { ok: false, invalid: true, message: say.t("خطوةٌ غير معروفة.", "Unknown step.") };
  const { error } = await call();
  if (error) return { ok: false, message: explain(say.locale, error) };
  return { ok: true, data: null };
}

// ── عقد الشراكة ──────────────────────────────────────────────────────────────

/** A signature as the pad draws it: move and line commands and whole numbers, the shape the table checks. */
export const SIGNATURE_SHAPE = /^[ML0-9 .-]{20,30000}$/;

export interface AgreementSignInput {
  agreementId: string;
  /** The version and fingerprint the signer was shown; the database refuses a signature on any other. */
  version: number;
  hash: string;
  fullName: string;
  signature: string;
  /** "yes" when the signer ticked «قرأتُ العقد كاملاً وأوافق على بنوده». */
  agree: string;
  userAgent: string | null;
}

/**
 * Signs a partnership agreement (backlog 127): the ticked confirmation, the drawn signature and the full name as on
 * the signer's ID, checked here as the website always checked them, then `partnership_agreement_sign`, which checks
 * the signer is a party, the version and the hash are the ones on record, the land is still verified and its area
 * covers the agreement, and seals it when the last party signs. Returns the reference when it sealed.
 */
export async function signPartnershipAgreement(
  supabase: SupabaseClient,
  input: AgreementSignInput,
  say: Say,
): Promise<StepResult<string | null>> {
  const { t } = say;
  if (input.agree !== "yes") {
    return { ok: false, message: t("أكّد أنّك قرأت العقد ووافقت على بنوده.", "Confirm that you have read the agreement and accept its terms.") };
  }
  if (!SIGNATURE_SHAPE.test(input.signature)) {
    return { ok: false, message: t("ارسم توقيعك بإصبعك في المربّع.", "Draw your signature with your finger in the box.") };
  }
  const fullName = input.fullName.trim();
  if (fullName.length < 5) {
    return { ok: false, message: t("اكتب اسمك الكامل كما في إثبات هويّتك.", "Write your full name as on your ID.") };
  }
  const { data, error } = await supabase.rpc("partnership_agreement_sign", {
    p_agreement: input.agreementId,
    p_version: Number(input.version),
    p_hash: input.hash,
    p_full_name: fullName.slice(0, 120),
    p_signature: input.signature,
    p_user_agent: input.userAgent ? input.userAgent.slice(0, 400) : null,
  });
  if (error) return { ok: false, message: explain(say.locale, error) };
  return { ok: true, data: (data as string | null) ?? null };
}

/** What a signer is told after signing: sealed with its reference, or waiting for the other party. */
export function signedSentence(ref: string | null, t: Say["t"]): string {
  return ref
    ? t(
        `وقّع الطرفان. أُقفل العقد وشهدت عليه سوداقري برقم ${ref}.`,
        `Both parties have signed. The agreement is sealed and witnessed by Sudagri under reference ${ref}.`,
      )
    : t(
        "وُقِّع توقيعك. وصل الطرفَ الآخر إشعار، ويُقفل العقد حين يوقّع.",
        "Your signature is recorded. The other party was notified; the agreement is sealed when they sign.",
      );
}
