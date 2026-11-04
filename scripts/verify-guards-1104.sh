#!/usr/bin/env bash
#
# حرّاس 4 نوفمبر (المالك: الأسئلة 18 و20 و21 و23): تفاصيل الأرض بعد القبول، ومصدر الماء، وسقف التخزين، والعرض للمالك.
# على السلسلة الكاملة.
#
#   ./scripts/verify-guards-1104.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start guards-1104
pg_apply_chain "$ROOT"

echo "── حرّاس 4 نوفمبر"
pg_run "$(pg_stage "$ROOT/scripts/verify-guards-1104.sql" checks.sql)"
