#!/usr/bin/env bash
#
# بوّابةُ تنبيهات الأسعار (البند ١٦٦): يضيفها صاحبها ويوقفها ويقرؤها وحده، ولا يكتب فيها مباشرةً،
# والإطلاق لمفتاح الخدمة وحده ويُغلق التنبيه ويكتب الإشعار معاً ولا يتكرّر.
#
#   ./scripts/verify-price-alerts.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start price-alerts

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
ALERTS="$(pg_stage "$ROOT/supabase/migrations/20261024090000_price_alerts.sql" alerts.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-price-alerts.sql" checks.sql)"

echo "── الأساس";            pg_run_quiet "$BASE"
echo "── الهجرة";            pg_run_quiet "$ALERTS"

echo "── الفحوص"
pg_run "$CHECKS"
