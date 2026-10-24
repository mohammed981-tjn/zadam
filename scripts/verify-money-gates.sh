#!/usr/bin/env bash
#
# بوّابةُ الكتابة المباشرة على الاستثمار والفرصة وسجلّ المنفّذ (البند ١٥٨).
#
#   ./scripts/verify-money-gates.sh
#
# The review of 23 October found the money path guarded in the server action and
# open in the table. This tries each forged write as the browser would, and pairs
# every refusal with the ordinary write the app makes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start money-gates

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
AUDIT="$(pg_stage "$ROOT/supabase/migrations/20260904140000_investment_audit.sql" audit.sql)"
GATES="$(pg_stage "$ROOT/supabase/migrations/20261024020000_close_direct_writes_money_and_opportunities.sql" gates.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-money-gates.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── تدقيق الاستثمار";   pg_run_quiet "$AUDIT"
echo "── الحرّاس الجديدة";   pg_run_quiet "$GATES"

echo "── الفحوص"
pg_run "$CHECKS"
