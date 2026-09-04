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
# THE STUBS, AND WHY THEY ARE SO SMALL
#
# The migration leans on `profiles`, `seasons`, `auth.uid()` and `is_admin()`,
# none of which this repository creates — the base schema is still outside the
# migrations directory. Rather than pretend otherwise, the stubs below are the
# minimum that lets the guards be exercised, and `auth.uid()` reads a table so
# one script can act as a farmer, another farmer, and an administrator in turn.
#
# And the permission checks run as ordinary roles, never as the cluster owner:
# a superuser bypasses row-level security entirely, so checking policies as one
# produces a pass that means nothing.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start export-offers

STUBS="$(pg_write stubs.sql <<'SQL'
create schema if not exists auth;
create table profiles (id uuid primary key, role text default 'farmer', publish_record boolean default false);
create table seasons  (id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id));

-- Swappable identity: one script acts as farmer, other farmer, administrator.
create table _who (uid uuid);
insert into _who values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who $$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- The ordinary role the permission section runs as.
create role app_user nologin;
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;
SQL
)"

MIGRATION="$(pg_stage "$ROOT/supabase/migrations/20260903170000_export_offers.sql" migration.sql)"
FREEZE="$(pg_stage    "$ROOT/supabase/migrations/20260903190000_export_freeze_requirements.sql" freeze.sql)"
INTERESTS="$(pg_stage "$ROOT/supabase/migrations/20260904080000_export_offer_interests.sql" interests.sql)"
CHECKS="$(pg_stage    "$ROOT/scripts/verify-export-offers.sql" checks.sql)"

echo "── الأساس";              pg_run_quiet "$STUBS"
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
