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

export const INVESTOR_MODELS = ["sharecrop", "lease", "finance"] as const;
export type InvestorModel = (typeof INVESTOR_MODELS)[number];

export const INVESTOR_MODEL_LABEL: Record<InvestorModel, Bi> = {
  sharecrop: { ar: "مشاركة بالمحصول", en: "Crop sharing" },
  lease: { ar: "إيجار الأرض", en: "Land lease" },
  finance: { ar: "تمويل المدخلات مقابل حصّة", en: "Input finance for a share" },
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
};

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
}
