#!/usr/bin/env bash
#
# بوّابةُ الرمز الثاني للإدارة (AUTH-04، البند ١٤١): لا يكون المرء مديراً في القاعدة إلا في جلسةٍ دخلت بالرمز الثاني،
# والمفتاح الذي يوقف الشرط لا يقلبه إلا مديرٌ دخل به.
#
#   ./scripts/verify-admin-second-factor.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start admin-second-factor

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
SECOND="$(pg_stage "$ROOT/supabase/migrations/20261026040000_admin_second_factor.sql" second.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-admin-second-factor.sql" checks.sql)"

# Supabase's defaults; and the access token's claims as auth.jwt() reads them, with the session's level beside the
# caller in the harness's _who.
SETUP="$(printf '%s\n' \
  'grant all on all tables in schema public to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter table _who add column if not exists aal text;' \
  "create or replace function auth.jwt() returns jsonb language sql stable as \$\$ select jsonb_strip_nulls(jsonb_build_object('sub', uid, 'aal', aal)) from _who \$\$;" \
  | pg_write setup.sql)"

echo "── الأساس";    pg_run_quiet "$BASE"
echo "── التهيئة";   pg_run_quiet "$SETUP"
echo "── السياسات";  pg_run_quiet "$POLICIES"
echo "── الرمز";     pg_run "$SECOND" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
