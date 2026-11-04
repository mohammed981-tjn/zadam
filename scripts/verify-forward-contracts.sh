#!/usr/bin/env bash
#
# بوّابةُ العقد الآجل (البند ١٧٠): يقترحه أحد الطرفين ويوقّعه الآخر، وشروطه لا تتغيّر، ولا يُلغى عقدٌ موقّعٌ بيد طرفٍ
# واحد، والتسليم يسجّله المشتري ويؤكّده المزارع، والنزاع تفصل فيه الإدارة؛ وكلّ خطوةٍ في سجلٍّ لا يُعدَّل، ولا يراه غير طرفيه.
#
#   ./scripts/verify-forward-contracts.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start forward-contracts

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
OFFERS="$(pg_stage "$ROOT/supabase/migrations/20261012120000_market_offers.sql" offers.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
FORWARD="$(pg_stage "$ROOT/supabase/migrations/20261026030000_forward_contracts.sql" forward.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-forward-contracts.sql" checks.sql)"

# Supabase's defaults, on the base tables too; and the phone on auth.users that phone sign-in fills.
SETUP="$(printf '%s\n' \
  'grant all on all tables in schema public to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter table auth.users add column if not exists phone text;' \
  | pg_write setup.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── التهيئة";      pg_run_quiet "$SETUP"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── النفير";       pg_run_quiet "$NAFIR"
echo "── عروض السوق";   pg_run_quiet "$OFFERS"
echo "── الإشعارات";    pg_run_quiet "$NOTIFY"
echo "── العقد الآجل";  pg_run "$FORWARD" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
