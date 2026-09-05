#!/usr/bin/env bash
#
# بوّابةُ اختيار الدور — يقول المرءُ أيَّهما هو، ولا يقول إنّه مدير.
#
#   ./scripts/verify-role-choice.sh
#
# WHY THIS ONE MATTERS MORE THAN ITS SIZE
#
# `prevent_self_role_escalation` is the only thing standing between a user's own
# `profiles` row — which they may update — and `role = 'admin'`, which opens the
# entire administration surface. This change makes that guard **narrower**: it
# now permits investor ⇄ farmer.
#
# Narrowing a security guard is the most dangerous kind of edit there is, so the
# gate checks both directions: that the newly-permitted move works, and that
# every path to a privileged role is still refused — including the ones the new
# clause could plausibly have opened by accident.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start role-choice

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
ENUMV="$(pg_stage "$ROOT/supabase/migrations/20260905120000_the_platform_learns_the_word_farmer.sql" enum.sql)"
CHOICE="$(pg_stage "$ROOT/supabase/migrations/20260905120100_a_person_may_say_which_they_are.sql" choice.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-role-choice.sql" checks.sql)"

echo "── الأساس";          pg_run_quiet "$BASE"
echo "── السياسات";        pg_run_quiet "$POLICIES"
echo "── كلمة «مزارع»";     pg_run_quiet "$ENUMV"
echo "── الاختيار";         pg_run_quiet "$CHOICE"

echo "── وثانيةً"; pg_run_quiet "$ENUMV"; pg_run_quiet "$CHOICE"

echo "── الحرّاس"
pg_run "$CHECKS"
