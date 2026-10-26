#!/usr/bin/env bash
#
# بوّابةُ مكتبة الدراسات والبحوث (البند ٢٠٢): لا يُنشر شيءٌ بإرساله، ولا يكتب المفتاح العامّ في الجدول، والزائر
# والعضو يقرآن المنشور وحده بلا وسيلة تواصل المرسِل؛ والمرسِل يرى ما أرسل، والإدارة وحدها تنشر أو تردّ بسبب.
#
#   ./scripts/verify-research-library.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start research-library

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
LIBRARY="$(pg_stage "$ROOT/supabase/migrations/20261026010000_research_library.sql" library.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-research-library.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet; and its service role passes
# row security, as the site's server does when it writes.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter role service_role bypassrls;' \
  | pg_write defaults.sql)"

echo "── الأساس";     pg_run_quiet "$BASE"
echo "── الافتراضي";  pg_run_quiet "$DEFAULTS"
echo "── الإشعارات";  pg_run_quiet "$NOTIFY"
echo "── المكتبة";    pg_run "$LIBRARY" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
