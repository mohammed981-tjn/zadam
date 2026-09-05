#!/usr/bin/env bash
#
# بوّابةُ جاهزيّة العرض — «٧ من ٨، وما هو الثامن».
#
#   ./scripts/verify-export-readiness.sh
#
# WHY THE PERCENTAGE IS THE LEAST OF IT
#
# The arithmetic is the easy half. What this proves is that the number can be
# trusted by the two people who read it: the farmer, who needs the checklist
# *before* submitting (so it must work off a draft), and the buyer, who needs a
# missing required document to read as "not shippable" no matter how flattering
# the percentage — and who must not be able to enumerate other people's drafts
# through a `security definer` function.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-readiness

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
READY="$(pg_stage "$ROOT/supabase/migrations/20260904230000_export_readiness.sql" readiness.sql)"
RETIRE="$(pg_stage "$ROOT/supabase/migrations/20260905140000_a_retired_rule_stops_being_asked_for.sql" retire.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-export-readiness.sql" checks.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── ممرّ الصادر";        pg_run_quiet "$EXPORT"
echo "── تجميدُ المتطلّبات";  pg_run_quiet "$FREEZE"
echo "── الجاهزيّة";          pg_run_quiet "$READY"
echo "── القاعدة المنتهية";  pg_run_quiet "$RETIRE"

echo "── وثانيةً"; pg_run_quiet "$READY"; pg_run_quiet "$RETIRE"

echo "── الحرّاس"
pg_run "$CHECKS"
