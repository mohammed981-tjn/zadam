#!/usr/bin/env bash
#
# بوّابةُ ممرّ الصادر: تُنشئ قاعدةً نظيفة، وتُطبّق الهجرة، وتُجرّب كلَّ حارسٍ
# بما وُضع لمنعه.
#
# WHY A SHELL SCRIPT AND NOT ANOTHER verify-*.ts
#
# `npm run verify` globs scripts/verify-*.ts, and every one of those runs on
# plain Node with no services. This one needs a real PostgreSQL, because what it
# checks is not TypeScript logic — it is what the database itself refuses. A
# constraint mocked in TypeScript proves nothing about the constraint.
#
# So it stays out of that glob deliberately, and runs either by hand or from the
# `sql-gates` job in web.yml:
#
#   ./scripts/verify-export-offers.sh
#
# الأساسُ المشترك
#
# `profiles`, `projects`, `investments`, `auth.uid()` and the enums they use all
# belong to the base schema, which still lives outside the migrations directory.
# They come from `scripts/base-schema.sql` — one fixture read out of production
# and shared by every gate, rather than a stub each script invents for itself.
#
# That sharing is not tidiness. While the stubs were separate, all four declared
# `role text default 'farmer'` — and there is no `farmer`: the production column
# is an enum of `investor`, `admin`, `field_agent`. Four gates and 147 checks
# passed against a database that could not exist.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-offers

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"

MIGRATION="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" migration.sql)"
FREEZE="$(pg_stage    "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
INTERESTS="$(pg_stage "$ROOT/supabase/migrations/20260904080000_export_offer_interests.sql" interests.sql)"
CHECKS="$(pg_stage    "$ROOT/scripts/verify-export-offers.sql" checks.sql)"

echo "── الأساس";              pg_run_quiet "$BASE"
echo "── الهجرة";              pg_run_quiet "$MIGRATION"
echo "── تجميدُ المتطلّبات";    pg_run_quiet "$FREEZE"
echo "── طلبات المشترين";      pg_run_quiet "$INTERESTS"

# Applying twice is not a nicety: a migration that cannot be re-run cannot be
# recovered after a partial failure, and this one is full of CREATE POLICY,
# which has no IF NOT EXISTS in PostgreSQL.
echo "── والهجرات ثانيةً — إعادةُ التطبيق لا تكسر"
pg_run_quiet "$MIGRATION"
pg_run_quiet "$FREEZE"
pg_run_quiet "$INTERESTS"

echo "── الحرّاس"
pg_run "$CHECKS"
