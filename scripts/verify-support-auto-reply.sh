#!/usr/bin/env bash
#
# بوّابةُ الردّ الآلي: قاعدةٌ حقيقيّة، ومهلةٌ تُحترم، وإنسانٌ يسبق الآلة.
#
# WHY THIS NEEDS A REAL POSTGRESQL
#
# The whole feature is two SQL statements: a query that decides who is due, and
# an UPDATE whose WHERE clause decides whether the answer may be written at all.
# Neither can be checked in TypeScript — a mocked WHERE clause proves nothing
# about the real one, and the race this is built to survive lives entirely
# inside that clause.
#
# So it stays out of the `npm run verify` glob (which is Node-only, no services)
# and runs either by hand or from the `sql-gates` job in web.yml:
#
#   ./scripts/verify-support-auto-reply.sh
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

pg_start support-auto-reply

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"

FEEDBACK="$(pg_stage "$ROOT/supabase/migrations/20260818180000_feedback.sql" feedback.sql)"
AUTOREPLY="$(pg_stage "$ROOT/supabase/migrations/20260904100000_support_auto_reply.sql" autoreply.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-support-auto-reply.sql" checks.sql)"

echo "── الأساس";          pg_run_quiet "$BASE"
echo "── ملاحظاتُ الزوّار"; pg_run_quiet "$FEEDBACK"
echo "── الردّ الآلي";      pg_run_quiet "$AUTOREPLY"

# إعادةُ التطبيق ليست تزيّناً: هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ.
echo "── وثانيةً — إعادةُ التطبيق لا تكسر"
pg_run_quiet "$AUTOREPLY"

echo "── الحرّاس"
pg_run "$CHECKS"
