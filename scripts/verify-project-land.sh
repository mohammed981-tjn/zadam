#!/usr/bin/env bash
#
# بوّابةُ المشروع على أرضٍ موثّقة: لا يُربط المشروع إلّا بأرضٍ موثّقة يملكها
# رافعه، والزائرُ يرى الشارة لا الموقع.
#
#   ./scripts/verify-project-land.sh
#
# Backlogs 129 and 130. The guard is a trigger; a real Postgres is the only
# place that proves a hand-made insert cannot borrow a stranger's land.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start project-land

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PRIVATE="$(pg_stage "$ROOT/supabase/migrations/20261021220000_land_rows_not_public.sql" land-private.sql)"
FIXTURE="$(pg_stage "$ROOT/scripts/land-offer-columns.fixture.sql" land-offer.sql)"
CONSENT="$(pg_stage "$ROOT/supabase/migrations/20260825120000_publish_record_consent.sql" consent.sql)"
PROJECT_LAND="$(pg_stage "$ROOT/supabase/migrations/20261022020000_project_on_verified_land.sql" project-land.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-project-land.sql" checks.sql)"

echo "── الأساس";             pg_run_quiet "$BASE"
echo "── السياسات";           pg_run_quiet "$POLICIES"
echo "── موافقة النشر";       pg_run_quiet "$CONSENT"
echo "── أعمدة العرض";        pg_run_quiet "$FIXTURE"
echo "── صفُّ الأرض خاصّ";    pg_run "$PRIVATE" >/dev/null
echo "── المشروع على أرضه";   pg_run "$PROJECT_LAND" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
