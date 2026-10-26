#!/usr/bin/env bash
#
# بوّابةُ استعادة كلمة مرور حساب الجوال (AUTH-05، البند ١٤١): الطلب لا يُكتب إلا من الخادم ولا يكشف أيّ رقمٍ له حساب،
# وطلبٌ مفتوحٌ واحد للحساب، والإدارة وحدها ترى الطلبات وتغلقها، والردّ بسبب.
#
#   ./scripts/verify-password-reset.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start password-reset

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
RESET="$(pg_stage "$ROOT/supabase/migrations/20261026050000_password_reset_requests.sql" reset.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-password-reset.sql" checks.sql)"

# Supabase's defaults (new functions granted to each role by name, as there); the sign-in address and phone on auth.users; and its service role passing row security.
SETUP="$(printf '%s\n' \
  'grant all on all tables in schema public to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public, anon, authenticated, service_role;' \
  'alter table auth.users add column if not exists email text, add column if not exists phone text;' \
  'alter role service_role bypassrls;' \
  | pg_write setup.sql)"

echo "── الأساس";     pg_run_quiet "$BASE"
echo "── التهيئة";    pg_run_quiet "$SETUP"
echo "── الإشعارات";  pg_run_quiet "$NOTIFY"
echo "── الاستعادة";  pg_run "$RESET" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
