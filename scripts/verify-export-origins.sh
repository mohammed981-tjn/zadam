#!/usr/bin/env bash
#
# بوّابةُ مكان المزرعة في عروض الصادر (DB-12، البند ١٧٥): الإحداثيّات والحدود لصاحب العرض وللمدير وحدهما،
# ولا يقرؤها مسجَّلٌ آخر ولو كان العرض منشوراً.
#
#   ./scripts/verify-export-origins.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-origins

M="$ROOT/supabase/migrations"
BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$M/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
EXPORT="$(pg_stage "$M/20260903170000_export_offers.sql" export.sql)"
FREEZE="$(pg_stage "$M/20260903190000_export_freeze_requirements.sql" freeze.sql)"
READINESS="$(pg_stage "$M/20260904230000_export_readiness.sql" readiness.sql)"
PRIVATE="$(pg_stage "$M/20261024070000_export_origins_private_columns.sql" private.sql)"
COORDS="$(pg_stage "$M/20261025150000_export_coordinates_private.sql" coords.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-export-origins.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات";          pg_run_quiet "$POLICIES"
echo "── الافتراضي";         pg_run_quiet "$DEFAULTS"
echo "── التصدير";           pg_run_quiet "$EXPORT"; pg_run_quiet "$FREEZE"; pg_run_quiet "$READINESS"
echo "── الأعمدة الخاصّة";   pg_run "$PRIVATE" >/dev/null
echo "── المحطّات والأدلّة";  pg_run "$COORDS" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
