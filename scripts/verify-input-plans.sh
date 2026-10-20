#!/usr/bin/env bash
#
# بوّابةُ «مشروعي» (المرحلة الأولى من المحفظة): الخطّة لصاحبها، والدفع يسجّله
# المزارع ولا تستلمه المنصّة، والمُزال يُعلَّم ولا يُحذف.
#
#   ./scripts/verify-input-plans.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start input-plans

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PLANS="$(pg_stage "$ROOT/supabase/migrations/20261020130000_input_plans.sql" plans.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-input-plans.sql" checks.sql)"

# Supabase grants table privileges to anon and authenticated when a table is
# created, and function execution to PUBLIC; the migration's own revokes run
# after that. Reproduced here so that a revoke in the migration is what the
# checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";      pg_run_quiet "$BASE"
echo "── السياسات";    pg_run_quiet "$POLICIES"
echo "── الافتراضي";   pg_run_quiet "$DEFAULTS"
echo "── الخطط";       pg_run "$PLANS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
