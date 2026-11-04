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
REVIEW="$(pg_stage "$ROOT/supabase/migrations/20261025200300_visitor_writes_through_server.sql" review.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-default-access.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── ما في الإنتاج وليس في الأساس"; pg_run_quiet "$FIXTURE"
echo "── كلمة «مزارع»";     pg_run_quiet "$FARMER"
echo "── الهجرة";           pg_run_quiet "$GATES"
# Production's grant before the fix: the public key could INSERT into both (policies leads_insert_public and
# feedback_insert_anyone); the fix is what takes it away.
PRIOR="$(printf '%s\n' 'grant insert on public.leads, public.feedback to anon, authenticated;' | pg_write prior.sql)"
pg_run_quiet "$PRIOR"
echo "── مراجعة ١٩٨ (د٩)";  pg_run "$REVIEW" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
