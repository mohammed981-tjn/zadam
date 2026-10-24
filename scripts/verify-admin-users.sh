#!/usr/bin/env bash
#
# بوّابةُ صفحة «المسجَّلون» (البند ١٥٤): يقرؤها المدير وحده، وتترجم الحسابات كما تُخزَّن.
#
#   ./scripts/verify-admin-users.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start admin-users

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
FARMER="$(pg_stage "$ROOT/supabase/migrations/20260905120000_the_platform_learns_the_word_farmer.sql" farmer.sql)"
FIXTURE="$(pg_stage "$ROOT/scripts/admin-users.fixture.sql" fixture.sql)"
LISTING="$(pg_stage "$ROOT/supabase/migrations/20261024040000_admin_users_list.sql" listing.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-admin-users.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── كلمة «مزارع»";     pg_run_quiet "$FARMER"
echo "── أعمدة auth";       pg_run_quiet "$FIXTURE"
echo "── الدالّتان";         pg_run_quiet "$LISTING"

echo "── الفحوص"
pg_run "$CHECKS"
