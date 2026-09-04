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
# THE STUBS
#
# The feedback migration is real and applied here verbatim; only what the
# repository does not carry is stubbed — `auth.users`, `notifications`,
# `profiles`, and the Supabase roles the GRANT/REVOKE lines name. `auth.uid()`
# reads a table so a check can act as somebody.
#
# And the permission section runs as `anon` and `authenticated` — the roles that
# actually reach these functions in production — never as the cluster owner: a
# superuser bypasses row-level security and function ACLs alike, so a door
# checked as one is a door checked open.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start support-auto-reply

STUBS="$(pg_write stubs.sql <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key);
create table profiles (id uuid primary key, role text default 'farmer');

-- الإشعاراتُ يكتبها زنادُ الملاحظات، فلا بدّ منها كي تُطبَّق الهجرةُ كما هي.
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid,
  kind         text not null,
  title        text,
  body         text,
  link         text,
  created_at   timestamptz not null default now(),
  constraint notifications_kind_check check (kind is not null)
);

create table _who (uid uuid);
insert into _who values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who $$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- أدوارُ Supabase التي تسمّيها أسطرُ المنح والسحب في الهجرة — وهي نفسُها
-- الأدوارُ التي يُختبر بها البابُ في القسم (د)، لا دورٌ مخترعٌ للاختبار:
-- `anon` هو الدورُ الذي يحمله المفتاحُ المنشور في كلّ صفحة.
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;
SQL
)"

FEEDBACK="$(pg_stage "$ROOT/supabase/migrations/20260818180000_feedback.sql" feedback.sql)"
AUTOREPLY="$(pg_stage "$ROOT/supabase/migrations/20260904100000_support_auto_reply.sql" autoreply.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-support-auto-reply.sql" checks.sql)"

echo "── الأساس";          pg_run_quiet "$STUBS"
echo "── ملاحظاتُ الزوّار"; pg_run_quiet "$FEEDBACK"
echo "── الردّ الآلي";      pg_run_quiet "$AUTOREPLY"

# إعادةُ التطبيق ليست تزيّناً: هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ.
echo "── وثانيةً — إعادةُ التطبيق لا تكسر"
pg_run_quiet "$AUTOREPLY"

echo "── الحرّاس"
pg_run "$CHECKS"
