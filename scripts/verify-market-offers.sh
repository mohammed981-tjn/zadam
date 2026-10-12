#!/usr/bin/env bash
#
# بوّابةُ عروض البيع والشراء: يقرأ الناسُ المفتوح، ويكتب كلٌّ عرضه بدالّة.
#
#   ./scripts/verify-market-offers.sh
#
# The offers board is written by ordinary signed-in people and read by
# strangers; the two functions and the read policies are the whole of the
# trust, so a real Postgres proves them.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start market-offers

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
# Supabase grants every new table to anon and authenticated by default; the
# migration must take the write privileges back itself, so the gate starts
# from the same default rather than from a clean slate.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"
OFFERS="$(pg_stage "$ROOT/supabase/migrations/20261012120000_market_offers.sql" offers.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-market-offers.sql" checks.sql)"

echo "── الأساس";     pg_run_quiet "$BASE"
echo "── السياسات";   pg_run_quiet "$POLICIES"
echo "── النفير";     pg_run_quiet "$NAFIR"
echo "── الافتراضي";  pg_run_quiet "$DEFAULTS"
echo "── العروض";     pg_run_quiet "$OFFERS"

echo "── الحرّاس"
pg_run "$CHECKS"
