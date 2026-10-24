#!/usr/bin/env bash
#
# بوّابةُ الصلاحيّات الافتراضيّة وكتابات الزائر (البند ١٥٩).
#
#   ./scripts/verify-default-access.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start default-access

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
FARMER="$(pg_stage "$ROOT/supabase/migrations/20260905120000_the_platform_learns_the_word_farmer.sql" farmer.sql)"
FIXTURE="$(pg_stage "$ROOT/scripts/default-access.fixture.sql" fixture.sql)"
GATES="$(pg_stage "$ROOT/supabase/migrations/20261024030000_default_access_and_visitor_writes.sql" gates.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-default-access.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── ما في الإنتاج وليس في الأساس"; pg_run_quiet "$FIXTURE"
echo "── كلمة «مزارع»";     pg_run_quiet "$FARMER"
echo "── الهجرة";           pg_run_quiet "$GATES"

echo "── الفحوص"
pg_run "$CHECKS"
