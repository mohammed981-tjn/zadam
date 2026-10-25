#!/usr/bin/env bash
#
# بوّابةُ معرّفات الحسابات في المشاريع والموردين (البند ١٨١): لا يقرؤها كلّ عضو، ويقرؤها صاحبها والمدير بدالّتين.
#
#   ./scripts/verify-private-ids.sh
#
# Backlog 132. Loads every table the migration narrows, then checks — as
# `anon` and as a signed-in member — that the hidden columns are hidden, that
# the pages' column lists still read, and that the policies on other tables
# that used to read owner_id still answer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start private-ids

M="$ROOT/supabase/migrations"
BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$M/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$M/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
PAUSED="$(pg_stage "$M/20260820100000_provider_paused_by_owner.sql" paused.sql)"
FEEDBACK="$(pg_stage "$M/20260818180000_feedback.sql" feedback.sql)"
PUBLISH="$(pg_stage "$M/20260825120000_publish_record_consent.sql" publish.sql)"
EXPORT="$(pg_stage "$M/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$M/20260903190000_export_freeze_requirements.sql" freeze.sql)"
NAFIR="$(pg_stage "$M/20260925090000_nafir_values_at_work.sql" nafir.sql)"
JUDIYYA="$(pg_stage "$M/20260925120000_judiyya.sql" judiyya.sql)"
OFFERS="$(pg_stage "$M/20261012120000_market_offers.sql" offers.sql)"
SUPPLY="$(pg_stage "$M/20261012130000_supply_chain.sql" supply.sql)"
PARTNERS="$(pg_stage "$M/20261017120000_partner_companies.sql" partners.sql)"
BANDS="$(pg_stage "$M/20261020120000_four_area_bands.sql" bands.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
INVESTORS="$(pg_stage "$M/20261021210000_investor_partnerships.sql" investors.sql)"
COLUMNS_FIXTURE="$(pg_stage "$ROOT/scripts/visitor-columns.fixture.sql" columns-fixture.sql)"
VISITOR="$(pg_stage "$M/20261022050000_visitor_columns.sql" visitor.sql)"
PRIVATE="$(pg_stage "$M/20261025230000_projects_suppliers_private_ids.sql" private.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-private-ids.sql" checks.sql)"
# Production grants members SELECT on the whole projects table (checked 25 October 2026); the harness base does not.
PRODGRANT="$(echo 'grant select on public.projects to authenticated;' | pg_write prod-grant.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── الافتراضي";         pg_run_quiet "$DEFAULTS"
echo "── مقدّمو الخدمة";     pg_run_quiet "$PROVIDERS"; pg_run_quiet "$PAUSED"
echo "── الملاحظات";         pg_run_quiet "$FEEDBACK"
echo "── إذن النشر";         pg_run_quiet "$PUBLISH"
echo "── التصدير";           pg_run_quiet "$EXPORT"; pg_run_quiet "$FREEZE"
echo "── النفير";            pg_run_quiet "$NAFIR"
echo "── الجوديّة";          pg_run_quiet "$JUDIYYA"
echo "── عروض البيع";        pg_run_quiet "$OFFERS"
echo "── الموردون";          pg_run_quiet "$SUPPLY"
echo "── الشركات";           pg_run_quiet "$PARTNERS"; pg_run_quiet "$BANDS"
echo "── الإشعارات";         pg_run_quiet "$NOTIFY"
echo "── الشراكة";           pg_run_quiet "$INVESTORS"
echo "── أعمدة الإنتاج";     pg_run_quiet "$COLUMNS_FIXTURE"
echo "── ما يقرؤه الزائر";   pg_run_quiet "$VISITOR"
echo "── كما في الإنتاج"; pg_run_quiet "$PRODGRANT"
echo "── معرّفات الحسابات"; pg_run "$PRIVATE" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
