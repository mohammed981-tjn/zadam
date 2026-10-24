#!/usr/bin/env bash
#
# بوّابةُ تقارير الدفاتر (البند ١٨٧ ٢د): قائمة الدخل والميزانيّة والتدفّقات النقديّة وربحيّة المواسم
# تتّفق مع بعضها ومع ميزان المراجعة، وحسابات ٩xxx الإحصائيّة خارجها، ولا يقرأ أحدٌ دفتر غيره.
#
#   ./scripts/verify-ledger-reports.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-reports

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
LEDGER="$(pg_stage "$ROOT/supabase/migrations/20261024110000_ledger_engine.sql" ledger.sql)"
FARM="$(pg_stage "$ROOT/supabase/migrations/20261024120000_farm_book.sql" farm.sql)"
OVERSIGHT="$(pg_stage "$ROOT/supabase/migrations/20261024130000_oversight.sql" oversight.sql)"
REPORTS="$(pg_stage "$ROOT/supabase/migrations/20261024150000_ledger_reports.sql" reports.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-ledger-reports.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

# `notify_user` is a function of production's notifications migration; the oversight migration needs only its name.
NOTIFY="$(cat <<'EOF' | pg_write notify.sql
create or replace function public.notify_user(p_recipient uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if p_recipient is null then return; end if;
  insert into notifications (recipient_id, kind, title, body, link) values (p_recipient, p_kind, p_title, p_body, p_link);
end $f$;
EOF
)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الإشعارات";    pg_run_quiet "$NOTIFY"
echo "── الأسعار";      pg_run_quiet "$QUOTES"
echo "── المحرّك";      pg_run_quiet "$LEDGER"
echo "── دفتر المزرعة"; pg_run_quiet "$FARM"
echo "── الإشراف";      pg_run_quiet "$OVERSIGHT"
echo "── التقارير";     pg_run "$REPORTS" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
