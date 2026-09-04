#!/usr/bin/env bash
#
# بوّابةُ رحلة الأرض والموسم — آخرُ الأربع التي تسمّيها الدراسة.
#
#   ./scripts/verify-land-season-journey.sh
#
# WHY IT NEEDS THE FIXTURE'S TRIGGERS
#
# `enforce_land_listing_gate` is in the migrations and reads
# `documents_on_file`. The two triggers that fill that column are not in any
# migration — they live in the base schema, and `scripts/base-schema.sql`
# carries them for exactly this reason. Without them the listing gate would be
# tested against a number the test wrote itself, which is not a test.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start land-season-journey

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-land-season-journey.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── السياسات والحرّاس"; pg_run_quiet "$POLICIES"

echo "── الرحلة"
pg_run "$CHECKS"
