/**
 * ما يقرؤه الزائر غير المسجَّل من كلّ جدولٍ يرى صفوفه (البند ١٣٢).
 *
 * The public key is in every browser, so a column a visitor may read through
 * a row policy is a column anyone can read from the API. Since
 * supabase/migrations/20261022050000_visitor_columns.sql, `anon` holds SELECT
 * on these columns only — and asking for `*` as a visitor fails, because `*`
 * includes the columns it does not hold. So every query a signed-out visitor
 * can reach names its columns from here.
 *
 * `MEMBER_COLUMNS` is the same for signed-in members on the two tables whose
 * review note is the owner's and the administration's alone; they read it
 * through `review_notes()`.
 *
 * scripts/verify-visitor-columns.ts holds these strings to the migration's
 * grants: add a column to one, add it to the other.
 */

export const VISITOR_COLUMNS = {
  suppliers:
    "id, name, state, locality, phone, whatsapp, delivery_states, categories, pesticide_licence_no, " +
    "seed_registration_no, commercial_registration_no, bio, verified_at, active, created_at, updated_at",
  partner_companies:
    "id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp, bio, verified_at, " +
    "active, created_at, updated_at",
  service_providers: "id, name, kind, bio, phone, regions, verified_at, active, created_at, paused_by_owner",
  projects:
    "id, slug, name, location, description, total_feddans, price_per_share, total_shares, shares_sold, status, " +
    "risk_level, expected_annual_return, cover_image_url, created_at, is_demo, review_status, submitted_by, " +
    "risk_score, crop_key, station_key, planting_month, irrigation, water_source, declared_water_per_feddan, " +
    "documents_on_file, documents_required, km_to_market",
  feedback:
    "id, display_name, page_path, kind, body, status, admin_reply, replied_at, published, created_at, ai_reply, " +
    "ai_replied_at, ai_reply_engine",
  charter_signatures: "charter_version, role, display_name, pledge, state, signed_at, verified_at",
  nafir_calls:
    "id, display_name, kind, title, description, state, locality, starts_on, needed, hosting, bring_tools, status, " +
    "outcome, attended, created_at, closed_at, canal_id",
  nafir_joins: "call_id, display_name, brings, joined_at",
  faza_requests: "id, display_name, cause, title, description, state, locality, needs, status, created_at, closed_at",
  faza_pledges: "id, request_id, display_name, kind, detail, kept_at, created_at",
  judiyya_mediators: "display_name, state, about, created_at, verified_at",
  shura_items: "id, display_name, kind, title, body, answer, answer_name, answered_at, created_at",
  market_offers:
    "id, kind, crop, quantity, unit, grade, state, locality, price_sdg, price_usd, contact_phone, whatsapp, notes, " +
    "status, expires_at, created_at, closed_at",
  export_offers:
    "id, reference, season_id, corridor_id, grade_id, quantity, uom_code, unit_price_minor, currency_code, " +
    "value_minor, status, shipment_date, requirements_frozen_at, submitted_at, reviewed_at, rejection_reason, " +
    "created_at, updated_at",
  export_offer_events: "id, offer_id, from_status, to_status, reason, occurred_at",
  export_offer_custody: "id, offer_id, sequence, occurred_at, place_name, note, created_at",
  export_offer_origins: "id, offer_id, plot_ref, area_hectares",
  export_offer_evidence: "id, offer_id, kind, captured_at, sha256, created_at, document_type_id",
} as const;

export const MEMBER_COLUMNS = {
  suppliers:
    "id, owner_id, name, state, locality, phone, whatsapp, delivery_states, categories, pesticide_licence_no, " +
    "seed_registration_no, commercial_registration_no, licence_doc_path, bio, verified_at, verified_by, active, " +
    "created_at, updated_at",
  partner_companies:
    "id, owner_id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp, bio, " +
    "verified_at, verified_by, active, created_at, updated_at",
  feedback:
    "id, author_id, display_name, page_path, kind, body, status, admin_reply, replied_at, replied_by, published, " +
    "created_at, ai_reply, ai_replied_at, ai_reply_engine",
} as const;

type VisitorTable = keyof typeof VISITOR_COLUMNS;

/**
 * The columns this reader may ask for: a visitor gets the granted list; a
 * member gets `*`, or the member list on the tables that have one.
 */
export function columnsFor(table: VisitorTable, signedIn: boolean): string {
  if (!signedIn) return VISITOR_COLUMNS[table];
  return (MEMBER_COLUMNS as Record<string, string>)[table] ?? "*";
}
