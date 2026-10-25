#!/usr/bin/env bash
#
# بوّابةُ مزامنة بيانات الفاو (البند ١٩٧): الفرق ينتظر المدير، والمدير يعتمده بدالّةٍ واحدة،
# وما استُبدل يُحفظ ولا يتغيّر.
#
#   ./scripts/verify-faostat-sync.sh
#
# The sync's reading and comparing is checked on real files by scripts/verify-faostat-sync.ts;
# this checks the tables and functions it writes through.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start faostat-sync

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
REFERENCE="$(pg_stage "$ROOT/supabase/migrations/20260818090000_faostat_reference.sql" reference.sql)"
DOMAIN="$(pg_stage "$ROOT/supabase/migrations/20260818130000_faostat_domain.sql" domain.sql)"
SYNC="$(pg_stage "$ROOT/supabase/migrations/20261025130000_faostat_sync.sql" sync.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-faostat-sync.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter role service_role bypassrls;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── المرجعيّة";    pg_run_quiet "$REFERENCE"
echo "── النطاق";       pg_run_quiet "$DOMAIN"
echo "── المزامنة";     pg_run "$SYNC" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
