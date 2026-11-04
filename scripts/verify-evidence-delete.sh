#!/usr/bin/env bash
#
# الحذفُ من التخزين يعمل، وما اعتُمد عليه يبقى (فحص 3 نوفمبر 2026، db-a-4؛ السؤال 14؛ الهجرة
# 20261104010000_evidence_delete_reads_what_it_needs.sql). على السلسلة الكاملة، وبصلاحيّات Supabase على التخزين.
#
#   ./scripts/verify-evidence-delete.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start evidence-delete
pg_apply_chain "$ROOT"

echo "── الحذف من التخزين"
pg_run "$(pg_stage "$ROOT/scripts/verify-evidence-delete.sql" checks.sql)"
