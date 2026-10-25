#!/usr/bin/env bash
#
# بوّابةُ الأسعار التلقائيّة: الزائرُ يرى المنشور وحده، والمحجوزُ ينتظر المدير.
#
#   ./scripts/verify-market-quotes.sh
#
# Backlog 131 and 196 (what is read is kept; only the administrator erases). The readers are checked on real articles by
# scripts/verify-price-feeds.ts; this checks the table they write to.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start market-quotes

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
KEEP="$(pg_stage "$ROOT/supabase/migrations/20261025120000_market_quotes_keep.sql" keep.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-market-quotes.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الأسعار";      pg_run_quiet "$QUOTES"
echo "── الحفظ";        pg_run "$KEEP" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
