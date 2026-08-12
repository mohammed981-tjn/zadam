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
  | "general";

export interface KnowledgeEntry {
  id: string;
  crop: string;
  topic: KnowledgeTopic;
  title: string;
  content: string;
  source_country: string | null;
  source_note: string | null;
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
    };
  };
}
