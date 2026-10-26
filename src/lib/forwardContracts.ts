/** العقد الآجل (البند ١٧٠): الحالات والوحدات كما في `forward_contracts`. */
import type { OfferUnit } from "./marketOffers";

export type ForwardStatus =
  | "proposed"
  | "declined"
  | "withdrawn"
  | "signed"
  | "delivered"
  | "completed"
  | "cancel_requested"
  | "cancelled"
  | "disputed";

export interface ForwardContract {
  id: string;
  ref: string;
  buyer_id: string;
  farmer_id: string;
  proposed_by: string;
  phone_tail: string;
  crop: string;
  grade: string;
  quantity: number;
  unit: OfferUnit;
  tolerance_percent: number;
  price: number;
  currency: "SDG" | "USD";
  delivery_from: string;
  delivery_to: string;
  delivery_place: string;
  payment_terms: string;
  advance_percent: number | null;
  notes: string | null;
  season_id: string | null;
  offer_id: string | null;
  /** «اشترِ لأهلك» (backlog 172): who receives for the buyer. */
  consignee_name: string | null;
  consignee_phone: string | null;
  /** The penalty clause (owner, 26 Oct 2026), as shares of the contract's value. */
  late_penalty_pct_week: number;
  late_penalty_cap_pct: number;
  breach_penalty_pct: number;
  force_majeure: boolean;
  penalty_awarded: number | null;
  penalty_payer: "buyer" | "farmer" | null;
  status: ForwardStatus;
  proposed_at: string;
  signed_at: string | null;
  delivered_quantity: number | null;
  delivered_on: string | null;
  grade_met: boolean | null;
  delivery_note: string | null;
  cancel_requested_by: string | null;
  closed_at: string | null;
}

export interface ForwardEvent {
  id: number;
  actor_id: string | null;
  event: string;
  note: string | null;
  at: string;
}

export const FORWARD_STATUS_LABEL: Record<ForwardStatus, [string, string]> = {
  proposed: ["ينتظر توقيع الطرف الآخر", "Awaiting the other side's signature"],
  declined: ["اعتذر الطرف الآخر", "Declined"],
  withdrawn: ["سُحب قبل التوقيع", "Withdrawn before signing"],
  signed: ["موقَّع: ينتظر التسليم", "Signed: awaiting delivery"],
  delivered: ["سُجّل التسليم: ينتظر تأكيد المزارع", "Delivery recorded: awaiting the farmer's confirmation"],
  completed: ["تمّ وأُقفل", "Done and closed"],
  cancel_requested: ["طُلب إلغاؤه", "Cancellation requested"],
  cancelled: ["أُلغي", "Cancelled"],
  disputed: ["نزاعٌ عند الإدارة", "In dispute with the administration"],
};

export const FORWARD_EVENT_LABEL: Record<string, [string, string]> = {
  proposed: ["اقتُرح ووقّعه مقترحه", "Proposed, and signed by its proposer"],
  signed: ["وقّعه الطرف الآخر", "Signed by the other side"],
  declined: ["اعتذر الطرف الآخر", "Declined by the other side"],
  withdrawn: ["سحبه مقترحه", "Withdrawn by its proposer"],
  delivered: ["سجّل المشتري التسليم", "The buyer recorded the delivery"],
  completed: ["أكّد المزارع التسليم", "The farmer confirmed the delivery"],
  cancel_requested: ["طُلب الإلغاء", "Cancellation requested"],
  cancel_refused: ["رُفض طلب الإلغاء", "Cancellation refused"],
  cancelled: ["أُلغي بالاتّفاق", "Cancelled by agreement"],
  disputed: ["رُفع نزاعٌ إلى الإدارة", "Dispute raised with the administration"],
  resolved: ["فصلت الإدارة", "The administration decided"],
};

export const FORWARD_OPEN: ForwardStatus[] = ["proposed", "signed", "delivered", "cancel_requested", "disputed"];
