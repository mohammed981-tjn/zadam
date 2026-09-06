#!/usr/bin/env bash
#
# بوّابةُ الأخبار.
#
#   ./scripts/verify-announcements.sh
#
# WHY IT NEEDS A REAL POSTGRES
#
# What it checks is one row-level policy, and the failure it guards against is
# a draft the owner wrote and chose not to publish being served to the public —
# from a **cached** page, so once rather than never.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start announcements

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
NEWS="$(pg_stage "$ROOT/supabase/migrations/20260906150000_announcements.sql" news.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-announcements.sql" checks.sql)"

echo "── الأساس";    pg_run_quiet "$BASE"
echo "── السياسات";  pg_run_quiet "$POLICIES"
echo "── الأخبار";   pg_run_quiet "$NEWS"

echo "── الحرّاس"
pg_run "$CHECKS"
