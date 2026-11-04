#!/usr/bin/env bash
#
# الأسعار الموثوقة تُنشر وحدها، وما سواها ينتظر المدير، وتوقّف المصادر يُنبَّه عليه مرّةً في اليوم (المالك، 4 نوفمبر
# 2026، السؤال 16؛ الهجرة 20261104020000_prices_publish_trusted.sql). على السلسلة الكاملة.
#
#   ./scripts/verify-prices-trusted.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start prices-trusted
pg_apply_chain "$ROOT"

echo "── النشر الآليّ والتنبيه"
pg_run "$(pg_stage "$ROOT/scripts/verify-prices-trusted.sql" checks.sql)"
