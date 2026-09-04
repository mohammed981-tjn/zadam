#!/usr/bin/env bash
#
# بوّابةُ قفل الأدلّة — أوّلُ ما في المرحلة ٣.
#
#   ./scripts/verify-evidence-lock.sh
#
# WHY IT IS THE FIRST THING IN A PHASE ABOUT TRUST
#
# A verification score, a farm passport, a readiness percentage — each is a
# number computed from evidence. If the person being scored can delete the
# evidence afterwards, the number describes files that may no longer exist.
# So the file is locked before anything is computed from it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start evidence-lock

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
LOCK="$(pg_stage "$ROOT/supabase/migrations/20260904210000_evidence_is_not_withdrawable.sql" lock.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-evidence-lock.sql" checks.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";     pg_run_quiet "$PROVIDERS"
echo "── العقود والمراحل";   pg_run_quiet "$CONTRACTS"
echo "── ممرّ الصادر";        pg_run_quiet "$EXPORT"
echo "── تجميدُ المتطلّبات";  pg_run_quiet "$FREEZE"
echo "── قفلُ الأدلّة";       pg_run_quiet "$LOCK"

# هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ.
echo "── وثانيةً"; pg_run_quiet "$LOCK"

echo "── الحرّاس"
pg_run "$CHECKS"
