#!/usr/bin/env bash
#
# بوّابةُ تربة الموقع (البند ١٨٠): قراءةُ الأقمار تُكتب بدالّةٍ واحدة، ولا يدّعي المالك مصدراً لا يملكه،
# وتسقط القراءة إن تحرّكت الأرض، ولا تعيد الأرضَ الموثّقة إلى المراجعة.
#
#   ./scripts/verify-land-soil.sh
#
# Backlog 180 (MAP-1). The triggers must meet lands_listing_gate and lands_reopen_on_fact_change in
# the order Postgres fires them, so only a real Postgres can show it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start land-soil

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
TRUST="$(pg_stage "$ROOT/supabase/migrations/20261023010000_partnership_trust.sql" trust.sql)"
ENTRY="$(pg_stage "$ROOT/supabase/migrations/20261023030000_entry_and_land_facts.sql" entry.sql)"
SOIL="$(pg_stage "$ROOT/supabase/migrations/20261024100000_land_soil_estimate.sql" soil.sql)"
SERVER="$(pg_stage "$ROOT/supabase/migrations/20261025150300_soil_estimate_server_only.sql" server.sql)"
BOUNDARY="$(pg_stage "$ROOT/supabase/migrations/20261031010000_land_boundary.sql" boundary.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-land-soil.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks
# meet; and the two things the base schema leaves out of auth: the e-mail an
# account is known by, and the service role that alone may ask about it.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant all on sequences to anon, authenticated;' \
  'alter table auth.users add column if not exists email text;' \
  "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end \$\$;" \
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
echo "── ما ينقص الشراكة";   pg_run "$TRUST" >/dev/null
echo "── الدفعة صفر";        pg_run "$ENTRY" >/dev/null
echo "── تربة الموقع";       pg_run "$SOIL" >/dev/null
echo "── للخادم وحده";       pg_run "$SERVER" >/dev/null
echo "── حدود الأرض";        pg_run "$BOUNDARY" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
