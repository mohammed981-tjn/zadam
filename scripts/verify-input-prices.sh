#!/usr/bin/env bash
#
# بوّابةُ بلاغات السماد والوقود: يكتب المسجَّلُ بلاغه بدالّة، ويقرأ الناسُ بلا
# اسم المُبلِّغ، ولا يُحذف بلاغ.
#
#   ./scripts/verify-input-prices.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start input-prices

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
# Supabase grants every new table to anon and authenticated by default; the
# migration must take the write privileges back itself.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"
INPUTS="$(pg_stage "$ROOT/supabase/migrations/20261021190000_input_price_reports.sql" inputs.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-input-prices.sql" checks.sql)"

echo "── الأساس";     pg_run_quiet "$BASE"
echo "── النفير";     pg_run_quiet "$NAFIR"
echo "── الافتراضي";  pg_run_quiet "$DEFAULTS"
echo "── البلاغات";   pg_run "$INPUTS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
