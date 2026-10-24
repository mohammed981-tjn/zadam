#!/usr/bin/env bash
#
# بوّابةُ الكتابة المباشرة على الصرف والأدلّة والدفتر (البند ١٥٧).
#
#   ./scripts/verify-direct-writes.sh
#
# WHY IT EXISTS
#
# The review of 23 October found that the rules about stage approval, evidence
# and the closed ledger lived in server actions, while row-level security let the
# owner write the same tables straight through PostgREST. This gate tries each of
# those writes as the owner would, and checks both halves: the bypass is refused
# AND the ordinary path (what seasons/actions.ts really does) still works.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start direct-writes

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
LOCK="$(pg_stage "$ROOT/supabase/migrations/20260904210000_evidence_is_not_withdrawable.sql" lock.sql)"
FIXTURE="$(pg_stage "$ROOT/scripts/direct-writes.fixture.sql" fixture.sql)"
GATES="$(pg_stage "$ROOT/supabase/migrations/20261024010000_close_direct_writes_stages_evidence_ledger.sql" gates.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-direct-writes.sql" checks.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";     pg_run_quiet "$PROVIDERS"
echo "── العقود والمراحل";   pg_run_quiet "$CONTRACTS"
echo "── ممرّ الصادر";        pg_run_quiet "$EXPORT"
echo "── تجميدُ المتطلّبات";  pg_run_quiet "$FREEZE"
echo "── قفلُ الأدلّة";       pg_run_quiet "$LOCK"
echo "── أعمدةٌ لاحقة";      pg_run_quiet "$FIXTURE"
echo "── الحرّاس الجديدة";    pg_run_quiet "$GATES"

echo "── الفحوص"
pg_run "$CHECKS"
