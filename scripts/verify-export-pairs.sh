#!/usr/bin/env bash
#
# بوّابةُ ملفّ الصادر: المنتجُ والوجهةُ اختياران منفصلان، والطريقُ بينهما يُفتح
# عند أوّل عرض، وما لم تُدرس شروطُه لا يبدو «جاهزاً» (البند ١١٨).
#
#   ./scripts/verify-export-pairs.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-pairs

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
READY="$(pg_stage "$ROOT/supabase/migrations/20260904230000_export_readiness.sql" readiness.sql)"
PAIRS="$(pg_stage "$ROOT/supabase/migrations/20261021120000_export_all_products_destinations.sql" pairs.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-export-pairs.sql" checks.sql)"

DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── الافتراضي";         pg_run_quiet "$DEFAULTS"
echo "── ممرّ الصادر";        pg_run_quiet "$EXPORT"
echo "── تجميدُ المتطلّبات";  pg_run_quiet "$FREEZE"
echo "── الجاهزيّة";          pg_run_quiet "$READY"
echo "── المنتجات والوجهات";  pg_run "$PAIRS" >/dev/null
echo "── وثانيةً، فلا يتكرّر شيء"; pg_run "$PAIRS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
