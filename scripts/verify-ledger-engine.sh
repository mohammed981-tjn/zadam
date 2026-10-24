#!/usr/bin/env bash
#
# بوّابةُ محرّك الدفتر المزدوج (البند ١٨٦، المرحلة ١): قيدٌ غير متوازن لا يُحفظ، ولا قيدَ يُعدَّل
# أو يُحذف ولو من مدير القاعدة، وسعر الصرف والتقريب والإقفال والعكس والعزل بين الدفاتر.
#
#   ./scripts/verify-ledger-engine.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-engine

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
LEDGER="$(pg_stage "$ROOT/supabase/migrations/20261024110000_ledger_engine.sql" ledger.sql)"
FIXTURES="$(pg_stage "$ROOT/scripts/fixtures/ledger-money.json" ledger-money.json)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

# The checks read the fixture file from the cluster directory; the path is only known now.
CHECKS="$(sed "s|__FIXTURES__|$FIXTURES|" "$ROOT/scripts/verify-ledger-engine.sql" | pg_write checks.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الأسعار";      pg_run_quiet "$QUOTES"
echo "── المحرّك";      pg_run "$LEDGER" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
