#!/usr/bin/env bash
#
# بوّابةُ الشركات الشريكة: التوثيقُ قبل الظهور، والاتّفاقُ يفعّله المشرف،
# والمزرعةُ لا تُكشف إلا بموافقة صاحبها.
#
#   ./scripts/verify-partners.sh
#
# Every write is a security-definer function that checks auth.uid(); the tables
# carry read policies only. A real Postgres is the only place that can prove a
# company sees a farm's group and never its owner, its name or its coordinates
# until the owner says yes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start partners

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
PARTNERS="$(pg_stage "$ROOT/supabase/migrations/20261017120000_partner_companies.sql" partners.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-partners.sql" checks.sql)"

# Supabase grants table privileges to anon and authenticated when a table is
# created, and function execution to PUBLIC; the migration's own revokes run
# after that. Reproduced here so that a revoke in the migration is what the
# checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";      pg_run_quiet "$BASE"
echo "── السياسات";    pg_run_quiet "$POLICIES"
echo "── النفير";      pg_run_quiet "$NAFIR"
echo "── الافتراضي";   pg_run_quiet "$DEFAULTS"
echo "── الشركاء";     pg_run "$PARTNERS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
