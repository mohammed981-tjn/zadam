#!/usr/bin/env bash
#
# بوّابةُ دفتر المزرعة (البند ١٨٧، المرحلة ٢): كلُّ سطرٍ في دفتر الموسم البسيط يُنتج قيداً مزدوجاً متوازناً في
# المعاملة نفسها، وتعديله وحذفه يعكسان قيده، وإقفال الموسم ينقل تكلفة ما بقي إلى «المباع»، والجنيه يُحوَّل
# بسعرٍ مسجَّل، والترحيل الأوّل لا يتكرّر.
#
#   ./scripts/verify-farm-book.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start farm-book

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
LEDGER="$(pg_stage "$ROOT/supabase/migrations/20261024110000_ledger_engine.sql" ledger.sql)"
FARM="$(pg_stage "$ROOT/supabase/migrations/20261024120000_farm_book.sql" farm.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-farm-book.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الأسعار";      pg_run_quiet "$QUOTES"
echo "── المحرّك";      pg_run_quiet "$LEDGER"
echo "── دفتر المزرعة"; pg_run "$FARM" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
