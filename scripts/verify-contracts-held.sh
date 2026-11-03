#!/usr/bin/env bash
#
# العقود تبقى على ما اتُّفق عليه، والأرض لا تُوثَّق إلا بعد قراءة مستنداتها (فحص 3 نوفمبر 2026، السؤال 6؛
# الهجرة 20261103010000_contracts_held_to_their_terms.sql). على السلسلة الكاملة وبصلاحيّات Supabase الافتراضيّة وحدها،
# فلا تمنح البوّابة نفسها ما لم تمنحه الهجرات.
#
#   ./scripts/verify-contracts-held.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start contracts-held
pg_apply_chain "$ROOT"

echo "── الحرّاس"
pg_run "$(pg_stage "$ROOT/scripts/verify-contracts-held.sql" checks.sql)"
