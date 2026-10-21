#!/usr/bin/env bash
#
# بوّابةُ تقرير المعاينة: يطلبه المستثمر، ويوافق صاحب الأرض، وتُسنده الإدارة
# إلى مفتّشٍ ليس طرفاً، ويُقفل التقرير ببصمة — والمستثمرُ لا يعرف موقع الأرض.
#
#   ./scripts/verify-land-inspections.sh
#
# Backlog 128 (the paid inspection report). Every write is a security-definer
# function that checks auth.uid(); the photos live in the evidence bucket, so the
# storage policies are proved here too.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start inspections

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
CONSENT="$(pg_stage "$ROOT/supabase/migrations/20260825120000_publish_record_consent.sql" consent.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
PARTNERS="$(pg_stage "$ROOT/supabase/migrations/20261017120000_partner_companies.sql" partners.sql)"
BANDS="$(pg_stage "$ROOT/supabase/migrations/20261020120000_four_area_bands.sql" bands.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
INVESTORS="$(pg_stage "$ROOT/supabase/migrations/20261021210000_investor_partnerships.sql" investors.sql)"
PRIVATE="$(pg_stage "$ROOT/supabase/migrations/20261021220000_land_rows_not_public.sql" land-private.sql)"
AGREEMENTS="$(pg_stage "$ROOT/supabase/migrations/20261021230000_partnership_agreements.sql" agreements.sql)"
INSPECTIONS="$(pg_stage "$ROOT/supabase/migrations/20261022010000_land_inspections.sql" inspections.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-land-inspections.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant all on sequences to anon, authenticated;' \
  | pg_write defaults.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── موافقة النشر";      pg_run_quiet "$CONSENT"
echo "── النفير";            pg_run_quiet "$NAFIR"
echo "── الافتراضي";         pg_run_quiet "$DEFAULTS"
echo "── الإشعارات";         pg_run_quiet "$NOTIFY"
echo "── الشركاء";           pg_run "$PARTNERS" >/dev/null
echo "── أربع فئات";         pg_run "$BANDS" >/dev/null
echo "── المستثمرون";        pg_run "$INVESTORS" >/dev/null
echo "── صفُّ الأرض خاصّ";   pg_run "$PRIVATE" >/dev/null
echo "── العقد";             pg_run "$AGREEMENTS" >/dev/null
echo "── المعاينة";          pg_run "$INSPECTIONS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
