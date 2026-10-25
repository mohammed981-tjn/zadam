#!/usr/bin/env bash
#
# بوّابةُ إيجار الجرّار والحجز الجماعيّ (البند ١٦٨): التوفّر يُختم بلحظة قوله ولمقدّمي الميكنة وحدهم، والقديم لا
# يُفتح عليه حجز؛ والحجز لأهل المحليّة نفسها من أرض موسمهم، وكلّ منضمٍّ يعرض عقد خدمةٍ عاديّاً؛ ويُرسله المنظّم
# حين يبلغ الحدّ الأدنى، ويُقبل كلّه أو يُرفض كلّه بيد مقدّم الخدمة؛ ولا يُقبل عقدٌ منه وحده ولا يُعاد مسودّة؛
# ولا يُقرأ الجدولان ولا يُكتبان إلا بالدوالّ، ولا هاتف في الاسم.
#
#   ./scripts/verify-tractor-booking.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start tractor-booking

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
SELFVERIFY="$(pg_stage "$ROOT/supabase/migrations/20260817060300_close_provider_self_verification_on_insert.sql" selfverify.sql)"
ACTIVE="$(pg_stage "$ROOT/supabase/migrations/20260819180100_guard_provider_active.sql" active.sql)"
PAUSE="$(pg_stage "$ROOT/supabase/migrations/20260820100000_provider_paused_by_owner.sql" pause.sql)"
LIFECYCLE="$(pg_stage "$ROOT/supabase/migrations/20260906090000_a_contract_is_an_agreement.sql" lifecycle.sql)"
BOOKING="$(pg_stage "$ROOT/supabase/migrations/20261025220000_machinery_availability_and_group_booking.sql" booking.sql)"
CLOSEDNAMES="$(pg_stage "$ROOT/supabase/migrations/20261025220100_machinery_closed_account_names.sql" closed-names.sql)"
NOTIFYFN="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify-functions.sql)"
NOTICES="$(pg_stage "$ROOT/supabase/migrations/20261025220200_machinery_booking_notifications.sql" notices.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-tractor-booking.sql" checks.sql)"
# The account-closure record, as 20261025140000_account_close.sql creates it (only what the hook reads).
CLOSED="$(echo 'create table if not exists public.closed_accounts (user_id uuid primary key references auth.users(id), closed_at timestamptz not null default now());' | pg_write closed.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

echo "── الأساس";           pg_run_quiet "$BASE"
echo "── الافتراضي";        pg_run_quiet "$DEFAULTS"
echo "── السياسات";         pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";    pg_run_quiet "$PROVIDERS"
echo "── العقود والمراحل";  pg_run_quiet "$CONTRACTS"
echo "── منعُ التوثيق الذاتي"; pg_run_quiet "$SELFVERIFY"
echo "── الإيقافُ الإداريّ"; pg_run_quiet "$ACTIVE"
echo "── إيقافُ المقدّم";    pg_run_quiet "$PAUSE"
echo "── دورةُ الحياة";      pg_run_quiet "$LIFECYCLE"
echo "── الجرّار والحجز";    pg_run "$BOOKING" >/dev/null
echo "── الإشعارات";        pg_run_quiet "$NOTIFYFN"; pg_run "$NOTICES" >/dev/null
echo "── الحسابات المُغلَقة"; pg_run_quiet "$CLOSED"; pg_run "$CLOSEDNAMES" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
