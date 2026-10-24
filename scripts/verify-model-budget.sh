#!/usr/bin/env bash
#
# بوّابةُ السقف اليوميّ على النموذج المدفوع (البند ١٦٣، SEC-9): كلّ عنوانٍ وكلّ المنصّة، يُغلق إن غاب الحدّ،
# ولا يستدعيه إلا مفتاح الخدمة.
#
#   ./scripts/verify-model-budget.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start model-budget

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
TABLE="$(pg_stage "$ROOT/supabase/migrations/20260820050000_assistant_requests_table.sql" requests.sql)"
CAP="$(pg_stage "$ROOT/supabase/migrations/20261024050000_assistant_daily_cap.sql" cap.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-model-budget.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── جدول الطلبات";     pg_run_quiet "$TABLE"
echo "── السقف";            pg_run_quiet "$CAP"

echo "── الفحوص"
pg_run "$CHECKS"
