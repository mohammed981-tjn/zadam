#!/usr/bin/env bash
#
# بوّابةُ عمر اللائحة — متى فُحصت آخرَ مرّة، وهل يُقال ذلك.
#
#   ./scripts/verify-rules-freshness.sh
#
# WHY A GATE FOR WHAT LOOKS LIKE A DATE FIELD
#
# Two things here can fail quietly and both mislead in the dangerous direction.
#
# A corridor nobody has ever reviewed must read as **overdue**, not as fresh: a
# null last-review is the absence of diligence, and `null > interval` is false in
# SQL, so the naive form of this check silently calls every unreviewed corridor
# current. That is the worst possible default for the one dataset whose
# staleness costs a rejected shipment.
#
# And the log must be append-only in the database, not by convention. A record
# that says "someone verified these rules on this date against this source" is
# worth exactly as much as the impossibility of editing it afterwards.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start rules-freshness

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
EXPORT="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" export.sql)"
FRESH="$(pg_stage "$ROOT/supabase/migrations/20260905160000_rules_declare_their_own_age.sql" fresh.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-rules-freshness.sql" checks.sql)"

echo "── الأساس";        pg_run_quiet "$BASE"
echo "── السياسات";      pg_run_quiet "$POLICIES"
echo "── ممرّ الصادر";    pg_run_quiet "$EXPORT"
echo "── عمرُ اللائحة";   pg_run_quiet "$FRESH"

echo "── وثانيةً"; pg_run_quiet "$FRESH"

echo "── الحرّاس"
pg_run "$CHECKS"
