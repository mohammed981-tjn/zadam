#!/usr/bin/env bash
#
# بوّابةُ دورة حياة العقد.
#
#   ./scripts/verify-contract-lifecycle.sh
#
# WHY A REAL POSTGRES AND NOT A UNIT TEST
#
# Everything this gate checks lives in the database and nowhere else: three
# triggers and the row-level policies they sit behind. A test that stubbed them
# would be testing the stub. And the two layers fail differently — a policy
# filters silently, a trigger raises — so a gate that cannot tell those apart
# reports a pass for a rule that is not there.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start contract-lifecycle

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
SELFVERIFY="$(pg_stage "$ROOT/supabase/migrations/20260817060300_close_provider_self_verification_on_insert.sql" selfverify.sql)"
PAUSE="$(pg_stage "$ROOT/supabase/migrations/20260820100000_provider_paused_by_owner.sql" pause.sql)"
LIFECYCLE="$(pg_stage "$ROOT/supabase/migrations/20260906090000_a_contract_is_an_agreement.sql" lifecycle.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-contract-lifecycle.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";    pg_run_quiet "$PROVIDERS"
echo "── العقود والمراحل";  pg_run_quiet "$CONTRACTS"
echo "── منعُ التوثيق الذاتي"; pg_run_quiet "$SELFVERIFY"
echo "── إيقافُ المقدّم";    pg_run_quiet "$PAUSE"
echo "── دورةُ الحياة";      pg_run_quiet "$LIFECYCLE"

# هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ.
echo "── وثانيةً"; pg_run_quiet "$LIFECYCLE"

echo "── الحرّاس"
pg_run "$CHECKS"
