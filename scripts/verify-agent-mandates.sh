#!/usr/bin/env bash
#
# بوّابةُ وضع الوكيل (البند ١٦٩): لا يعمل وكيلٌ عن مزارعٍ إلا بإذنٍ قبله المزارع من حسابه، وفي ما أذن فيه وحده،
# وما دامت شركته موثّقةً والإذن قائماً؛ وكلّ ما يكتبه يُسجَّل ويبقى، والأرض لا تنتقل من صاحبها.
#
#   ./scripts/verify-agent-mandates.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start agent-mandates

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
PROVIDERS="$(pg_stage "$ROOT/supabase/migrations/20260817060000_service_providers_and_catalogue.sql" providers.sql)"
CONTRACTS="$(pg_stage "$ROOT/supabase/migrations/20260817060100_service_contracts_and_milestones.sql" contracts.sql)"
LIVESTOCK="$(pg_stage "$ROOT/supabase/migrations/20260817060200_livestock.sql" livestock.sql)"
NAFIR="$(pg_stage "$ROOT/supabase/migrations/20260925090000_nafir_values_at_work.sql" nafir.sql)"
PARTNERS="$(pg_stage "$ROOT/supabase/migrations/20261017120000_partner_companies.sql" partners.sql)"
NOTIFY="$(pg_stage "$ROOT/scripts/notify-functions.fixture.sql" notify.sql)"
AGENTS="$(pg_stage "$ROOT/supabase/migrations/20261026020000_agent_mandates.sql" agents.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-agent-mandates.sql" checks.sql)"

# Supabase's defaults, on the base tables too; the phone on auth.users that phone sign-in fills; and the closed accounts of backlog 195, in the
# one column this migration reads.
SETUP="$(printf '%s\n' \
  'grant all on all tables in schema public to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter table auth.users add column if not exists phone text;' \
  'create table if not exists public.closed_accounts (user_id uuid primary key references auth.users(id));' \
  | pg_write setup.sql)"

echo "── الأساس";        pg_run_quiet "$BASE"
echo "── التهيئة";       pg_run_quiet "$SETUP"
echo "── السياسات";      pg_run_quiet "$POLICIES"
echo "── مقدّمو الخدمة";  pg_run_quiet "$PROVIDERS"
echo "── العقود";        pg_run_quiet "$CONTRACTS"
echo "── القطيع";        pg_run_quiet "$LIVESTOCK"
echo "── النفير";        pg_run_quiet "$NAFIR"
echo "── الشركاء";       pg_run_quiet "$PARTNERS"
echo "── الإشعارات";     pg_run_quiet "$NOTIFY"
echo "── الوكيل";        pg_run "$AGENTS" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"
