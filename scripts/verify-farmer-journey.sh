#!/usr/bin/env bash
#
# بوّابةُ الرحلة الذهبيّة — أوّلُ فحصٍ يسأل «هل يمرّ صاحبُ الحقّ؟»
#
#   ./scripts/verify-farmer-journey.sh
#
# WHY IT USES THE SAME MIGRATIONS AS THE REFUSAL GATE
#
# verify-export-offers.sh applies exactly these three migrations and then spends
# 64 checks proving what they refuse. This one applies the same three and walks
# a farmer through them from an empty database to a published offer with a
# buyer's interest waiting.
#
# Deliberately the same schema, deliberately the opposite question. Tightening a
# policy to close one of those 64 holes is the single most likely way to break
# this journey, and the two gates run side by side in CI so that trade never
# happens silently.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start farmer-journey

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"

MIGRATION="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" migration.sql)"
FREEZE="$(pg_stage    "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
INTERESTS="$(pg_stage "$ROOT/supabase/migrations/20260904080000_export_offer_interests.sql" interests.sql)"
CHECKS="$(pg_stage    "$ROOT/scripts/verify-farmer-journey.sql" checks.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── ممرّ الصادر";       pg_run_quiet "$MIGRATION"
echo "── تجميدُ المتطلّبات"; pg_run_quiet "$FREEZE"
echo "── طلبات المشترين";   pg_run_quiet "$INTERESTS"

echo "── الرحلة"
pg_run "$CHECKS"
