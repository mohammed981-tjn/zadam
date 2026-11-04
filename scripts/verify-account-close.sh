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
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
FEEDBACK="$(pg_stage "$ROOT/supabase/migrations/20260818180000_feedback.sql" feedback.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
JUDIYYA="$(pg_stage "$ROOT/supabase/migrations/20260925120000_judiyya.sql" judiyya.sql)"
CANALS="$(pg_stage "$ROOT/supabase/migrations/20260925140000_canals.sql" canals.sql)"
OFFERS="$(pg_stage "$ROOT/supabase/migrations/20261012120000_market_offers.sql" offers.sql)"
SUPPLY="$(pg_stage "$ROOT/supabase/migrations/20261012130000_supply_chain.sql" supply.sql)"
PARTNERS="$(pg_stage "$ROOT/supabase/migrations/20261017120000_partner_companies.sql" partners.sql)"
CLOSE="$(pg_stage "$ROOT/supabase/migrations/20261025140000_account_close.sql" close.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-account-close.sql" checks.sql)"

# Supabase's defaults, and the shapes of auth and of the four personal tables the closure clears, as production has them
# (read from information_schema on 25 October 2026); and the role the API connects as, which carries the pre-request check.
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
  'do $r$ begin create role authenticator noinherit nologin; exception when duplicate_object then null; end $r$;' \
  | pg_write setup.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";  pg_run_quiet "$PROVIDERS"
echo "── الملاحظات";     pg_run_quiet "$FEEDBACK"
echo "── النفير";        pg_run_quiet "$NAFIR"
echo "── الجوديّة";      pg_run_quiet "$JUDIYYA"
echo "── القنوات";       pg_run_quiet "$CANALS"
echo "── عروض السوق";    pg_run_quiet "$OFFERS"
echo "── المدخلات";      pg_run_quiet "$SUPPLY"
echo "── الشركاء";       pg_run_quiet "$PARTNERS"
echo "── التهيئة";      pg_run_quiet "$SETUP"
echo "── الإغلاق";      pg_run "$CLOSE" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
