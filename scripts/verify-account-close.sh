#!/usr/bin/env bash
#
# بوّابةُ إغلاق الحساب (البند ١٩٥): صاحبه يطلب، والمدير يُغلق، والهويّة الحقيقيّة عند المدير وحده حتى يمحوها بسبب،
# والدفاتر والعقود تبقى.
#
#   ./scripts/verify-account-close.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start account-close

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
CLOSE="$(pg_stage "$ROOT/supabase/migrations/20261025140000_account_close.sql" close.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-account-close.sql" checks.sql)"

# Supabase's defaults, and the shapes of auth and of the four personal tables the closure clears, as production has them
# (read from information_schema on 25 October 2026).
SETUP="$(printf '%s\n' \
  'alter role service_role bypassrls;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter table auth.users add column if not exists email text, add column if not exists phone text, add column if not exists raw_user_meta_data jsonb, add column if not exists banned_until timestamptz;' \
  'create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);' \
  'create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb);' \
  'create table if not exists public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);' \
  'create table if not exists public.price_alerts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);' \
  'create table if not exists public.field_alerts_sent (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id) on delete cascade);' \
  | pg_write setup.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── التهيئة";      pg_run_quiet "$SETUP"
echo "── الإغلاق";      pg_run "$CLOSE" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
