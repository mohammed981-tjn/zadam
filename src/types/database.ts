import type {
  ServiceKind,
  ServiceKey,
  ServiceUnit,
  ProductionKind,
} from "@/lib/services";

export type UserRole = "investor" | "admin" | "field_agent";
export type ProjectStatus =
  | "draft"
  | "open"
  | "funded"
  | "in_progress"
  | "completed";
export type RiskLevel = "low" | "medium" | "high";
export type InvestmentStatus = "pending" | "confirmed" | "cancelled";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  country: string | null;
  /**
   * Whether this person's season history is visible to anyone holding their
   * profile link. Defaults to false; only the owner can change it.
   */
  publish_record: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  location: string;
  description: string | null;
  total_feddans: number;
  price_per_share: number;
  total_shares: number;
  shares_sold: number;
  status: ProjectStatus;
  risk_level: RiskLevel;
  expected_annual_return: number | null;
  cover_image_url: string | null;
  /** Illustrative sample project — must never be presented as a real offer. */
  is_demo: boolean;
  review_status: ReviewStatus;
  submitted_by: string | null;
  review_note: string | null;
  risk_score: number | null;
  crop_key: string | null;
  station_key: string | null;
  planting_month: number | null;
  irrigation: string | null;
  water_source: string | null;
  declared_water_per_feddan: number | null;
  documents_on_file: number;
  documents_required: number;
  km_to_market: number | null;
  created_by: string | null;
  created_at: string;
}

export type ReviewStatus = "submitted" | "approved" | "rejected";

export type StageKeyDb =
  | "land_prep"
  | "planting"
  | "establishment"
  | "vegetative"
  | "flowering"
  | "maturity"
  | "harvest";

export type LedgerCategoryDb =
  | "seeds"
  | "fertiliser"
  | "pesticide"
  | "labour"
  | "irrigation"
  | "transport"
  | "other"
  | "revenue";

export interface Land {
  id: string;
  owner_id: string;
  name: string;
  state: string;
  locality: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  feddans: number;
  station_key: string;
  water_source: string;
  water_per_feddan: number | null;
  soil_note: string | null;
  previous_crops: string | null;
  km_to_market: number | null;
  tenure: "owned" | "leased" | "communal" | "unspecified";
  documents_on_file: number;
  documents_required: number;
  verification: "unverified" | "submitted" | "verified" | "rejected";
  verification_note: string | null;
  listed: boolean;
  created_at: string;
}

export interface Season {
  id: string;
  owner_id: string;
  project_id: string | null;
  name: string;
  location: string | null;
  crop_key: string;
  station_key: string;
  irrigation: string;
  feddans: number;
  budget_per_feddan: number;
  planting_date: string;
  harvest_date: string | null;
  status: "active" | "completed" | "abandoned";
  created_at: string;
}

export interface SeasonStage {
  id: string;
  season_id: string;
  stage_key: StageKeyDb;
  stage_order: number;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  planned_water_m3: number;
  budget: number;
  completed: boolean;
  completed_at: string | null;
  note: string | null;
}

/**
 * Stage evidence, as the table actually is.
 *
 * This interface used to declare `url` — a column that does not exist — and to
 * omit `storage_path`, `captured_at`, `latitude` and `longitude`, which do and
 * which `addStageEvidence` writes on every upload.
 *
 * It was wrong in both directions at once, and `seasons/[id]/page.tsx` reads
 * `select("*")` then casts the rows to this type, so the cast laundered the
 * mistake: `evidence.url` type-checked while being `undefined` at runtime, and
 * the coordinates that make a photo evidence rather than a picture were
 * invisible to anyone reading the type.
 *
 * Latent rather than live — nothing reads `.url` today. But it is the kind of
 * defect that stays harmless until someone trusts the type, and the coordinates
 * are exactly what the export offer needs to carry.
 */
export interface StageEvidence {
  id: string;
  stage_id: string;
  kind: "photo" | "invoice" | "inspection" | "note";
  storage_path: string | null;
  caption: string | null;
  /** Read from the photo's EXIF before compression re-encodes it away. */
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string | null;
  created_at: string;
}

export interface LedgerEntryRow {
  id: string;
  season_id: string;
  stage_id: string | null;
  category: LedgerCategoryDb;
  amount: number;
  description: string | null;
  entry_date: string;
  created_by: string | null;
  created_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  title: string;
  body: string | null;
  image_urls: string[];
  created_by: string | null;
  created_at: string;
}

export interface Investment {
  id: string;
  project_id: string;
  investor_id: string;
  shares: number;
  amount: number;
  status: InvestmentStatus;
  created_at: string;
}

export type KnowledgeTopic =
  | "soil"
  | "pest"
  | "water"
  | "variety"
  | "institutional"
  | "general"
  | "agronomy"
  | "technology"
  | "livestock"
  | "economics";

export interface KnowledgeEntry {
  id: string;
  crop: string;
  topic: KnowledgeTopic;
  title: string;
  content: string;
  source_country: string | null;
  source_note: string | null;
  /**
   * Withheld from the public listings and served only through the assistant.
   * A presentation choice, not access control — the table is world-readable
   * either way, so nothing confidential belongs in it.
   */
  assistant_only: boolean;
  created_by: string | null;
  created_at: string;
}

export type LeadRole = "investor" | "farmer" | "other";

export interface Lead {
  id: string;
  full_name: string;
  contact: string;
  role: LeadRole;
  interest: string | null;
  message: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      projects: {
        Row: Project;
        Insert: Partial<Project>;
        Update: Partial<Project>;
      };
      project_updates: {
        Row: ProjectUpdate;
        Insert: Partial<ProjectUpdate>;
        Update: Partial<ProjectUpdate>;
      };
      investments: {
        Row: Investment;
        Insert: Partial<Investment>;
        Update: Partial<Investment>;
      };
      knowledge_entries: {
        Row: KnowledgeEntry;
        Insert: Partial<KnowledgeEntry>;
        Update: Partial<KnowledgeEntry>;
      };
      leads: {
        Row: Lead;
        Insert: Partial<Lead>;
        Update: Partial<Lead>;
      };
      service_providers: {
        Row: ServiceProvider;
        Insert: Partial<ServiceProvider>;
        Update: Partial<ServiceProvider>;
      };
      services: {
        Row: ProviderService;
        Insert: Partial<ProviderService>;
        Update: Partial<ProviderService>;
      };
      service_contracts: {
        Row: ServiceContract;
        Insert: Partial<ServiceContract>;
        Update: Partial<ServiceContract>;
      };
      contract_milestones: {
        Row: ContractMilestone;
        Insert: Partial<ContractMilestone>;
        Update: Partial<ContractMilestone>;
      };
      milestone_evidence: {
        Row: MilestoneEvidence;
        Insert: Partial<MilestoneEvidence>;
        Update: Partial<MilestoneEvidence>;
      };
      contract_payments: {
        Row: ContractPayment;
        Insert: Partial<ContractPayment>;
        Update: Partial<ContractPayment>;
      };
      herds: {
        Row: Herd;
        Insert: Partial<Herd>;
        Update: Partial<Herd>;
      };
      herd_stages: {
        Row: HerdStage;
        Insert: Partial<HerdStage>;
        Update: Partial<HerdStage>;
      };
    };
  };
}

/* -------------------------------------------------------------------------
 * الرافعة الخدمية — providers, contracts, and the animal side.
 *
 * The service vocabulary itself (keys, units, and how a billable quantity is
 * derived from a season) lives in src/lib/services.ts, next to the catalogue
 * that describes the work. What follows is only the row shapes.
 * ---------------------------------------------------------------------- */

export interface ServiceProvider {
  id: string;
  owner_id: string;
  name: string;
  kind: ServiceKind;
  bio: string | null;
  phone: string | null;
  regions: string[];
  /** Null until an admin verifies. Unverified providers are not contractable. */
  verified_at: string | null;
  verified_by: string | null;
  /**
   * Administrative standing. Admin only — a suspended provider must not be able
   * to put itself back in the catalogue.
   */
  active: boolean;
  /**
   * The provider's own availability switch: "we are closed for now".
   *
   * Separate from `active` on purpose. "We suspended you" and "we are closed
   * this season" must not be the same flag, or locking one to administrators
   * takes the other away from the provider that legitimately needs it.
   */
  paused_by_owner: boolean;
  created_at: string;
}

/**
 * A priced offer in one provider's catalogue.
 *
 * Named ProviderService rather than Service because the row belongs to a
 * provider — the abstract description of the work is ServiceDefinition in
 * lib/services.ts, and the two are easy to confuse if both are called Service.
 */
export interface ProviderService {
  id: string;
  provider_id: string;
  service_key: ServiceKey;
  title: string;
  description: string | null;
  unit: ServiceUnit;
  price_per_unit: number;
  min_units: number;
  production_kind: ProductionKind;
  lead_time_days: number;
  active: boolean;
  created_at: string;
}

export type ContractStatus =
  | "draft"
  | "proposed"
  | "active"
  | "completed"
  | "cancelled"
  | "disputed";

export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "paid"
  | "rejected";

export interface ServiceContract {
  id: string;
  project_id: string | null;
  /** Exactly one of season_id and herd_id is set — enforced by CHECK. */
  season_id: string | null;
  herd_id: string | null;
  /** Set to scope the contract to a single production phase. */
  stage_id: string | null;
  provider_id: string;
  client_id: string;
  title: string;
  status: ContractStatus;
  currency: string;
  /** Maintained by trigger from the milestones; never write it directly. */
  total_amount: number;
  signed_at: string | null;
  created_at: string;
}

export interface ContractMilestone {
  id: string;
  contract_id: string;
  seq: number;
  title: string;
  service_id: string | null;
  unit: ServiceUnit;
  quantity: number;
  /** Frozen at agreement time so a catalogue price change cannot reprice it. */
  unit_price: number;
  /** Generated column: quantity × unit_price. */
  amount: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: MilestoneStatus;
  /** Per-phase feasibility, mostly derived from the FAO-56 season plan. */
  feasibility: Record<string, unknown> | null;
  requires_evidence: boolean;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
}

export interface MilestoneEvidence {
  id: string;
  milestone_id: string;
  kind: "photo" | "invoice" | "inspection" | "report" | "note";
  storage_path: string | null;
  caption: string | null;
  /** Read from EXIF before compression, exactly like stage evidence. */
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  created_at: string;
}

export interface ContractPayment {
  id: string;
  milestone_id: string;
  kind: "advance" | "release" | "retention" | "refund";
  amount: number;
  status: "scheduled" | "released" | "held";
  released_at: string | null;
  released_by: string | null;
  note: string | null;
  created_at: string;
}

export type LivestockSpecies =
  | "cattle"
  | "sheep"
  | "goat"
  | "camel"
  | "poultry"
  | "fish";

export type HerdPurpose = "meat" | "dairy" | "eggs" | "breeding" | "fattening";

export type HerdStageKey =
  | "acquisition"
  | "quarantine"
  | "conditioning"
  | "breeding"
  | "gestation"
  | "rearing"
  | "fattening"
  | "production"
  | "offtake";

/** The animal-side counterpart of a season. */
export interface Herd {
  id: string;
  owner_id: string;
  project_id: string | null;
  land_id: string | null;
  name: string;
  species: LivestockSpecies;
  breed: string | null;
  head_count: number;
  purpose: HerdPurpose;
  start_date: string;
  end_date: string | null;
  status: "active" | "completed" | "cancelled";
  created_at: string;
}

export interface HerdStage {
  id: string;
  herd_id: string;
  stage_key: HerdStageKey;
  stage_order: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  /** Feed is to a herd what water is to a crop: the dominant input. */
  planned_feed_kg: number | null;
  budget: number | null;
  completed: boolean;
  completed_at: string | null;
  note: string | null;
}

/**
 * One reviewed claim from the Arc Canal dossier.
 *
 * `basis` is not optional in the database and should not be treated as
 * optional here either: a verdict without the arithmetic behind it is the
 * habit the review exists to object to.
 */
export type ArcCanalVerdict =
  | "sound"
  | "self_corrected"
  | "overstated"
  | "unsupported";

export interface ArcCanalFinding {
  id: number;
  axis: string;
  claim: string;
  study_figure: string | null;
  verdict: ArcCanalVerdict;
  platform_figure: string | null;
  basis: string;
  source_doc: string;
  sort_order: number;
}

/**
 * The canal dossier: one row per attribute of the scheme, blanks included.
 *
 * `value` is nullable and `status` is `"unknown"` exactly when it is null —
 * the database enforces the pair with a check constraint. Rendering must
 * therefore handle the null branch; there is no fallback string, because a
 * dash standing in for "nobody has established this" is the reading the whole
 * table was built to prevent.
 */
export type ArcCanalFactStatus =
  | "measured"
  | "derived"
  | "assumption"
  | "unknown";

export type ArcCanalFactCategory =
  | "terrain"
  | "engineering"
  | "area"
  | "climate"
  | "water"
  | "energy"
  | "operations"
  | "permits"
  | "cost";

export interface ArcCanalFact {
  id: number;
  category: ArcCanalFactCategory;
  key: string;
  label: string;
  value: string | null;
  unit: string | null;
  status: ArcCanalFactStatus;
  source: string;
  note: string | null;
  sort_order: number;
}

/**
 * An image on the Arc Canal page.
 *
 * `credit` is not nullable, and the database enforces that it is non-blank.
 * The page publishes nothing without a basis; for a photograph the basis is who
 * made it, and an optional credit field is an empty credit field.
 *
 * `published` defaults to false — uploading is not publishing.
 */
export interface ArcCanalImage {
  id: number;
  storage_path: string;
  caption: string;
  credit: string;
  source_url: string | null;
  taken_on: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  created_by: string | null;
}

export type FeedbackStatus = "new" | "planned" | "done" | "declined";

/**
 * A visitor's note, and the administrator's reply to it.
 *
 * `author_id` is null for the anonymous case, which is the majority case and
 * the point of the feature: the person seeing the platform for the first time
 * is the one worth hearing from, and asking them to register first is asking
 * them not to bother.
 */
export interface Feedback {
  id: string;
  author_id: string | null;
  display_name: string | null;
  contact: string | null;
  page_path: string | null;
  kind: string;
  body: string;
  status: FeedbackStatus;
  admin_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  /**
   * Written by the scheduled job fifteen minutes after the note arrives, and
   * only when `admin_reply` is still null. Kept in its own column so a person's
   * reply never overwrites what the visitor has already read, and so "how many
   * did the machine cover?" stays a question with an answer.
   */
  ai_reply: string | null;
  ai_replied_at: string | null;
  ai_reply_engine: string | null;
  published: boolean;
  created_at: string;
}

/* ==========================================================================
 * ممرّ الصادر — 20260903170000_export_offers.sql
 * ========================================================================== */

export interface ExportUom {
  code: string;
  name_ar: string;
  kind: "mass" | "count" | "volume";
  to_base: number;
}

export interface ExportCommodity {
  id: string;
  code: string;
  name_ar: string;
  hs_code: string | null;
  /**
   * The unit an offer gets when it names none — filled by a trigger, not by
   * the screen. Deliberately a default and not a rule: the owner asked that a
   * flock be sellable by head or by delivered weight without a release, so an
   * offer may override this.
   */
  default_uom_code: string;
  active: boolean;
  created_at: string;
}

export interface ExportCommodityGrade {
  id: string;
  commodity_id: string;
  code: string;
  name_ar: string;
}

export interface ExportDestination {
  id: string;
  code: string;
  name_ar: string;
  active: boolean;
}

/** A commodity and a destination whose requirements someone has actually studied. */
export interface ExportCorridor {
  id: string;
  commodity_id: string;
  destination_id: string;
  active: boolean;
}

export interface ExportOffer {
  id: string;
  reference: string;
  owner_id: string;
  season_id: string | null;
  corridor_id: string;
  grade_id: string | null;
  /** Comes back from PostgREST as a decimal string — `numeric` is not a JS number. */
  quantity: string;
  uom_code: string;
  unit_price_minor: number;
  currency_code: string;
  value_minor: number;
  status: "draft" | "submitted" | "published" | "rejected" | "withdrawn";
  shipment_date: string | null;
  requirements_frozen_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Never null on a rejected row: the constraint requires ten characters. */
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportOfferOrigin {
  id: string;
  offer_id: string;
  plot_ref: string;
  area_hectares: string | null;
  latitude: string;
  longitude: string;
  /** GeoJSON. Required at four hectares and above — the constraint sees to it. */
  boundary: unknown | null;
}

export interface ExportOfferCustody {
  id: number;
  offer_id: string;
  sequence: number;
  occurred_at: string;
  place_name: string;
  latitude: string | null;
  longitude: string | null;
  note: string | null;
  created_at: string;
}

export interface ExportOfferEvidence {
  id: string;
  offer_id: string;
  kind: string;
  captured_at: string | null;
  latitude: string | null;
  longitude: string | null;
  storage_path: string;
  sha256: string | null;
  created_at: string;
}

/**
 * Written only by `export_offer_transition`, which runs SECURITY DEFINER and is
 * the sole writer: the table grants no write policy to anyone, including
 * administrators. A log its subject can write is a log its subject can forge.
 */
export interface ExportOfferEvent {
  id: number;
  offer_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  reason: string | null;
  occurred_at: string;
}

/* ==========================================================================
 * تدقيقُ عملية الاستثمار — 20260904140000_investment_audit.sql
 * ========================================================================== */

/**
 * What `confirm_investment` answers. `confirmed` is the only success — every
 * other value means the database changed nothing, and each one has its own
 * cause worth telling the administrator apart.
 *
 * The function used to return `void`, so a refusal and a success were the same
 * silence. That is what this type exists to make impossible.
 */
export type ConfirmInvestmentOutcome =
  | "confirmed"
  | "not_found"
  | "not_pending"
  | "over_allocated";

/**
 * One attempt on the money path, recorded whether it succeeded or not.
 *
 * Append-only in the database: a trigger raises on UPDATE and DELETE rather
 * than ignoring them, because an attempt to rewrite an audit row is itself
 * something the owner should be able to see failed.
 *
 * `investment_id` and `project_id` carry no foreign key on purpose — the record
 * of an attempt has to outlive the rows it refers to, or deleting an investment
 * would erase the evidence that anyone ever tried to confirm it.
 */
export interface InvestmentEvent {
  id: string;
  investment_id: string;
  project_id: string | null;
  /** Taken from the session inside the function, never from an argument. */
  actor_id: string | null;
  action: "confirm";
  outcome: Exclude<ConfirmInvestmentOutcome, "not_found">;
  reason: string | null;
  shares: number | null;
  shares_sold_before: number | null;
  shares_sold_after: number | null;
  created_at: string;
}
