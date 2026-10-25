#!/usr/bin/env bash
#
# بوّابةُ سلسلة المدخلات: الموردون الموثّقون، والطلبات الجماعية، والتوصيل بالرمز،
# والبلاغات.
#
#   ./scripts/verify-supply-chain.sh
#
# Every write here is a security-definer function that checks auth.uid(); the
# tables carry read policies only. A real Postgres is the only place that can
# prove a badge needs a licence, a pledge stays private, and a delivery is
# confirmed by the recipient's code and nothing else.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start supply-chain

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
SUPPLY="$(pg_stage "$ROOT/supabase/migrations/20261012130000_supply_chain.sql" supply.sql)"
PLACE="$(pg_stage "$ROOT/supabase/migrations/20261025150100_group_order_place_private.sql" place.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-supply-chain.sql" checks.sql)"

# Supabase grants table privileges to anon and authenticated when a table is
# created (default privileges), and a migration's own revokes run after that.
# Reproduced here so that a revoke in the migration is what the checks meet.
DEFAULTS="$(pg_write defaults.sql <<'SQL'
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
SQL
)"

echo "── الأساس";    pg_run_quiet "$BASE"
echo "── السياسات";  pg_run_quiet "$POLICIES"
echo "── النفير";    pg_run_quiet "$NAFIR"
pg_run_quiet "$DEFAULTS"
echo "── المدخلات";  pg_run "$SUPPLY" >/dev/null
echo "── مكان الاستلام"; pg_run "$PLACE" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
