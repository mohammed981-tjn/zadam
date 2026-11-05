#!/usr/bin/env bash
#
# بوّابةُ الطرق المدروسة (البند ١١٨): اثنا عشر طريقاً لها شروطها ومراجعتها بمصادرها، والتكرار لا يضيف شيئاً،
# وما لم يُدرس (الصمغ إلى الهند) يبقى بلا قواعد.
#
#   ./scripts/verify-export-studied.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-studied

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
READY="$(pg_stage "$ROOT/supabase/migrations/20260904230000_export_readiness.sql" readiness.sql)"
AGE="$(pg_stage "$ROOT/supabase/migrations/20260905160000_rules_declare_their_own_age.sql" age.sql)"
PAIRS="$(pg_stage "$ROOT/supabase/migrations/20261021120000_export_all_products_destinations.sql" pairs.sql)"
STUDIED="$(pg_stage "$ROOT/supabase/migrations/20261106030000_export_corridors_studied.sql" studied.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-export-studied.sql" checks.sql)"

DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── الافتراضي";         pg_run_quiet "$DEFAULTS"
echo "── ممرّ الصادر";        pg_run_quiet "$EXPORT"
echo "── تجميدُ المتطلّبات";  pg_run_quiet "$FREEZE"
echo "── الجاهزيّة";          pg_run_quiet "$READY"
echo "── عمرُ القواعد";       pg_run_quiet "$AGE"
echo "── المنتجات والوجهات";  pg_run_quiet "$PAIRS"
echo "── الطرق المدروسة";     pg_run "$STUDIED" >/dev/null
echo "── وثانيةً، فلا يتكرّر شيء"; pg_run "$STUDIED" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
