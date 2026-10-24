import type { Bi } from "@/lib/partners";

/**
 * المستثمر وصاحب الأرض (البند ١٢٤).
 *
 * The database is the boundary (supabase/migrations/20261021210000_investor_
 * partnerships.sql): `INVESTOR_MODELS` mirrors the CHECK on `lands.investor_
 * models` and `investor_interests.model`, so a form built from it cannot offer
 * what the table would refuse.
 *
 * Nothing here moves money or promises a return. The share, the rent and the
 * term are agreed between the two people; the platform verifies the land,
 * keeps both names hidden until the owner agrees, and offers the supervision
 * and the stage reports it already runs. It does not hold the money — the
 * owner's decision of 20 October (backlog 115).
 */

// «musaqah» (backlog 136): standing trees and palms, tended for a share of the
// fruit — supabase/migrations/20261023010000_partnership_trust.sql.
// «managed» (backlog 136): land, capital and a verified partner company that
// manages for a share of the net profit — 20261023020000_partnership_managed.sql.
export const INVESTOR_MODELS = ["sharecrop", "lease", "finance", "musaqah", "managed"] as const;
export type InvestorModel = (typeof INVESTOR_MODELS)[number];

export const INVESTOR_MODEL_LABEL: Record<InvestorModel, Bi> = {
  sharecrop: { ar: "مشاركة بالمحصول", en: "Crop sharing" },
  lease: { ar: "إيجار الأرض", en: "Land lease" },
  finance: { ar: "تمويل المدخلات مقابل حصّة", en: "Input finance for a share" },
  musaqah: { ar: "مساقاة البستان والنخيل", en: "Orchard tending (musaqah)" },
  managed: { ar: "شراكة ثلاثيّة: أرضٌ ومالٌ وإدارة", en: "Three-party: land, capital and management" },
};

/** What each side brings and takes, said plainly — no percentages, they are agreed between the two. */
export const INVESTOR_MODEL_DETAIL: Record<InvestorModel, { investor: Bi; owner: Bi }> = {
  sharecrop: {
    investor: {
      ar: "يموّل الموسم كلّه أو بعضه، ويأخذ حصّةً متّفقاً عليها من المحصول.",
      en: "Finances all or part of the season and takes an agreed share of the harvest.",
    },
    owner: {
      ar: "يقدّم الأرض والماء والعمل، ويأخذ بقيّة المحصول.",
      en: "Brings the land, the water and the work, and takes the rest of the harvest.",
    },
  },
  lease: {
    investor: {
      ar: "يستأجر الأرض مدّةً متّفقاً عليها ويزرعها بنفسه أو بشركةٍ شريكة.",
      en: "Rents the land for an agreed term and farms it directly or through a partner company.",
    },
    owner: {
      ar: "يأخذ أجرةً متّفقاً عليها لا تتغيّر بحجم المحصول.",
      en: "Receives an agreed rent that does not change with the size of the harvest.",
    },
  },
  finance: {
    investor: {
      ar: "يدفع ثمن البذور والسماد والوقود والحرث مباشرةً للمورّد أو الشركة المنفّذة، ويأخذ مقابل ذلك حصّةً متّفقاً عليها من المحصول.",
      en: "Pays for the seed, fertiliser, fuel and ploughing directly to the supplier or service company, and takes an agreed share of the harvest in return.",
    },
    owner: {
      ar: "يزرع أرضه بنفسه، ويعطي المستثمر حصّته المتّفق عليها من المحصول.",
      en: "Farms their own land and gives the investor the agreed share of the harvest.",
    },
  },
  musaqah: {
    investor: {
      ar: "يرعى الشجر والنخيل القائم بالسقي والتقليم والمكافحة والجني، بنفسه أو بشركةٍ شريكة، ويأخذ حصّةً متّفقاً عليها من الثمر.",
      en: "Tends the standing trees and palms — watering, pruning, pest control, picking — directly or through a partner company, and takes an agreed share of the fruit.",
    },
    owner: {
      ar: "يقدّم البستان بشجره وحقّه في الماء، ويأخذ بقيّة الثمر. وإن لم يُثمر الشجر لم يأخذ أحدٌ شيئاً.",
      en: "Brings the orchard with its trees and water rights, and takes the rest of the fruit. If the trees bear nothing, neither takes anything.",
    },
  },
  managed: {
    investor: {
      ar: "يموّل الموسم، وتديره شركةٌ شريكة موثّقة تسجّل كلّ مرحلةٍ ومصروفها — فلا يحتاج أن يزرع بنفسه ولا أن يكون في السودان.",
      en: "Finances the season, which a verified partner company manages and records stage by stage — no need to farm in person, or to be in Sudan.",
    },
    owner: {
      ar: "يقدّم الأرض والماء. تُستردّ التكاليف الموثّقة أوّلاً، ثمّ تأخذ الشركة نسبتها من صافي الربح، ويُقسم الباقي بينه وبين المستثمر.",
      en: "Brings the land and the water. The recorded costs are repaid first, the company takes its share of the net profit, and the rest is split between him and the investor.",
    },
  },
};

/**
 * تنبيه المخاطرة (البند ١٣٦) — يُقَرّ به قبل أن يُرسل طلب الشراكة، ويُحفظ معه.
 * The platforms that collapsed in Nigeria never said this; see
 * docs/studies/partnership-models-ar.md.
 */
export const RISK_NOTICE: Bi = {
  ar: "الزراعة ربحٌ وخسارة: قد يضعف المحصول أو يهلك أو ينخفض سعره، فتخسر بعض ما قدّمت أو كلّه. سوداقري لا تضمن ربحاً ولا عائداً، ولا تمسك مالك؛ المال بينك وبين شريكك مباشرةً.",
  en: "Farming can lose as well as gain: the crop can fail, be destroyed or sell low, and you can lose part or all of what you put in. Sudagri guarantees no profit or return and holds none of your money; it passes between you and your partner directly.",
};

/** land_investor_profiles(): who the investor is, for the owner of the land asked about. */
export interface InvestorProfile {
  interest_id: string;
  dial_code: string | null;
  member_since: string | null;
  requests_sent: number;
  requests_accepted: number;
  agreements_signed: number;
  risk_acknowledged: boolean;
}

export type InterestStatus = "pending" | "accepted" | "declined" | "withdrawn";

export const INTEREST_STATUS_LABEL: Record<InterestStatus, Bi> = {
  pending: { ar: "بانتظار صاحب الأرض", en: "Waiting for the owner" },
  accepted: { ar: "قَبِل — تواصلا", en: "Accepted — get in touch" },
  declined: { ar: "اعتذر صاحب الأرض", en: "The owner declined" },
  withdrawn: { ar: "سحبتَه", en: "Withdrawn" },
};

/** A row of investor_open_lands(): nothing that names the owner or places the land. */
export interface OpenLand {
  land_id: string;
  state: string;
  locality: string | null;
  feddans: number;
  area_band: string | null;
  soil_class: string | null;
  /** From land_soil_estimates() (backlog 180): `point` when the class is a satellite reading at the land's own point. */
  soil_source?: string | null;
  soil_pct?: number | null;
  water_source: string;
  water_per_feddan: number | null;
  station_key: string;
  crop_keys: string[];
  models: InvestorModel[];
  note: string | null;
  documents_on_file: number;
  interest_status: InterestStatus | null;
  mine: boolean;
}

/** A row of investor_my_interests(): the land's name and the owner's phone only once accepted. */
export interface MyInterest {
  interest_id: string;
  land_id: string;
  model: InvestorModel;
  message: string;
  status: InterestStatus;
  state: string;
  locality: string | null;
  feddans: number;
  land_name: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  created_at: string;
  decided_at: string | null;
}

/** A row of land_investor_requests(): the investor's phone only once accepted. */
export interface LandRequest {
  interest_id: string;
  land_id: string;
  model: InvestorModel;
  message: string;
  status: InterestStatus;
  investor_name: string | null;
  investor_phone: string | null;
  created_at: string;
  decided_at: string | null;
  /** From land_investor_profiles(), joined on the page; absent before that migration. */
  profile?: InvestorProfile;
}
