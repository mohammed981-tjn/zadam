#!/usr/bin/env bash
#
# بوّابةُ التنبيهات الحقليّة: الخبرُ يصل صاحبَ الأرض مرّةً واحدة، ولا يكتبه
# إلّا المهمّةُ اليوميّة بمفتاح الخدمة.
#
#   ./scripts/verify-field-alerts.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start field-alerts

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
ALERTS="$(pg_stage "$ROOT/supabase/migrations/20261020150000_field_alerts.sql" alerts.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-field-alerts.sql" checks.sql)"

# Supabase's own grants on a new table and function, which the migration's
# revokes must undo — reproduced so the checks meet what production meets.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";      pg_run_quiet "$BASE"
echo "── الافتراضي";   pg_run_quiet "$DEFAULTS"
echo "── التنبيهات";   pg_run "$ALERTS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
