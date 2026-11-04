#!/usr/bin/env bash
#
# لا حسابات مجهولة (فحص 3 نوفمبر 2026، db-b-6؛ السؤال 17؛ الهجرة 20261104030000_no_anonymous_accounts.sql).
#
#   ./scripts/verify-no-anonymous.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start no-anonymous
pg_apply_chain "$ROOT"

echo "── الحسابات المجهولة"
pg_run "$(pg_stage "$ROOT/scripts/verify-no-anonymous.sql" checks.sql)"
