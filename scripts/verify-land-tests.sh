#!/usr/bin/env bash
#
# بوّابةُ فحوص الأرض (البند ١٦٤): لصاحب الأرض وللمدير وحدهما، تُضاف ولا تُعدَّل، وتُحذف خلال ساعة.
#
#   ./scripts/verify-land-tests.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start land-tests

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
FARMER="$(pg_stage "$ROOT/supabase/migrations/20260905120000_the_platform_learns_the_word_farmer.sql" farmer.sql)"
TESTS="$(pg_stage "$ROOT/supabase/migrations/20261024080000_land_tests.sql" tests.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-land-tests.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── كلمة «مزارع»";     pg_run_quiet "$FARMER"
echo "── الفحوص (الهجرة)";  pg_run_quiet "$TESTS"

echo "── الفحوص"
pg_run "$CHECKS"
