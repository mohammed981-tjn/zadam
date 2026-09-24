#!/usr/bin/env bash
#
# بوّابةُ الترع: الحدود، والنصيب بقدر الفدادين، والجدول لأهله.
#
#   ./scripts/verify-canals.sh
#
# These tables are written by ordinary signed-in people and read by everyone;
# the triggers and policies are the whole of the trust. A real Postgres is the
# only place that can prove them.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start canals

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
JUDIYYA="$(pg_stage "$ROOT/supabase/migrations/20260925120000_judiyya.sql" judiyya.sql)"
CANALS="$(pg_stage "$ROOT/supabase/migrations/20260925140000_canals.sql" canals.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-canals.sql" checks.sql)"

echo "── الأساس";    pg_run_quiet "$BASE"
echo "── السياسات";  pg_run_quiet "$POLICIES"
echo "── النفير";    pg_run_quiet "$NAFIR"
echo "── الجودية";   pg_run_quiet "$JUDIYYA"
echo "── الترع";     pg_run_quiet "$CANALS"

echo "── الحرّاس"
pg_run "$CHECKS"
