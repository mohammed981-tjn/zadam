#!/usr/bin/env bash
#
# بوّابةُ جاهزيّة الماشية للتصدير: سجلّ الصحّة وأرقام الآذان لصاحب القطيع،
# والقيدُ يُسحب ولا يُحذف، والرقمُ تتغيّر حالته ولا يُمحى.
#
#   ./scripts/verify-herd-readiness.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start herd-readiness

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
LIVESTOCK="$(pg_stage "$ROOT/supabase/migrations/20260817060200_livestock.sql" livestock.sql)"
READINESS="$(pg_stage "$ROOT/supabase/migrations/20261021090000_herd_export_readiness.sql" readiness.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-herd-readiness.sql" checks.sql)"

# Supabase grants table privileges to anon and authenticated when a table is
# created, and function execution to PUBLIC; the migration's own revokes run
# after that. Reproduced here so that a revoke in the migration is what the
# checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الخدمات";      pg_run_quiet "$PROVIDERS"
echo "── العقود";       pg_run_quiet "$CONTRACTS"
echo "── الماشية";      pg_run_quiet "$LIVESTOCK"
echo "── الجاهزيّة";    pg_run "$READINESS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
