#!/usr/bin/env bash
#
# بوّابةُ رحلة المستثمر — بالسياسات الحقيقيّة، لا بسياساتٍ تخترعها البوّابة.
#
#   ./scripts/verify-investor-journey.sh
#
# WHY IT APPLIES THE POLICIES MIGRATION
#
# The other investment gate inserts its rows as the cluster owner, with
# row-level security bypassed. That is right for testing what a function
# refuses, and useless for testing whether an investor can reach it at all.
#
# So this one applies `20260817120000_document_existing_policies_and_guards.sql`
# — the migration that actually declares `investments_insert`,
# `investments_select` and `projects_select` — and then acts as `anon` and
# `authenticated` against them. A gate that declared those policies itself
# would be grading its own homework.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start investor-journey

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
AUDIT="$(pg_stage "$ROOT/supabase/migrations/20260904140000_investment_audit.sql" audit.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-investor-journey.sql" checks.sql)"

echo "── الأساس";              pg_run_quiet "$BASE"
echo "── السياسات والحرّاس";    pg_run_quiet "$POLICIES"
echo "── تدقيقُ الاستثمار";     pg_run_quiet "$AUDIT"

echo "── الرحلة"
pg_run "$CHECKS"
