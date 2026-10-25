#!/usr/bin/env bash
#
# بوّابةُ مزامنة بيانات الفاو (البند ١٩٧): الفرق ينتظر المدير، والمدير يعتمده بدالّةٍ واحدة،
# وما استُبدل يُحفظ ولا يتغيّر.
#
#   ./scripts/verify-faostat-sync.sh
#
# The sync's reading and comparing is checked on real files by scripts/verify-faostat-sync.ts;
# this checks the tables and functions it writes through.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start faostat-sync

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
REFERENCE="$(pg_stage "$ROOT/supabase/migrations/20260818090000_faostat_reference.sql" reference.sql)"
DOMAIN="$(pg_stage "$ROOT/supabase/migrations/20260818130000_faostat_domain.sql" domain.sql)"
SYNC="$(pg_stage "$ROOT/supabase/migrations/20261025130000_faostat_sync.sql" sync.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-faostat-sync.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter role service_role bypassrls;' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  | pg_write defaults.sql)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── السياسات";     pg_run_quiet "$POLICIES"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── المرجعيّة";    pg_run_quiet "$REFERENCE"
echo "── النطاق";       pg_run_quiet "$DOMAIN"
echo "── المزامنة";     pg_run "$SYNC" >/dev/null

echo "── الحرّاس"
pg_run "$CHECKS"

# A check that writes the difference while an approval is under way (ج١٢): the approval waits for it, then sees that the
# difference is no longer what the page showed, and refuses — instead of deleting rows it never applied.
RACE_SYNC="$(cat <<'EOF' | pg_write race-sync.sql
begin;
insert into faostat_pending (domain, area, element, item, year, unit, value, flag) values ('PP', 'Sudan', 'Producer Price (USD/tonne)', 'Late row', 2024, 'USD', 5, 'A');
select pg_sleep(2);
commit;
EOF
)"
RACE_SETUP="$(cat <<'EOF' | pg_write race-setup.sql
insert into faostat_pending (domain, area, element, item, year, unit, value, flag, found_at) values ('PP', 'Sudan', 'Producer Price (USD/tonne)', 'Seen row', 2024, 'USD', 4, 'A', '2026-10-25 01:00:00+00');
update _who set uid = 'f6000000-0000-0000-0000-0000000000f6';
EOF
)"
RACE_APPLY="$(cat <<'EOF' | pg_write race-apply.sql
\set ON_ERROR_STOP off
set role authenticated;
select faostat_apply_pending(1, '2026-10-25 01:00:00+00');
EOF
)"
RACE_CHECK="$(cat <<'EOF' | pg_write race-check.sql
\set ON_ERROR_STOP on
\set QUIET on
\echo ''
\echo 'ز) فحصٌ يكتب الفرق أثناء الاعتماد: لا يضيع صفّ (ج١٢)'
do $$ begin
  perform _eq((select count(*)::int from faostat_pending where item = 'Late row'), 1, 'الصفّ الذي كُتب أثناء الاعتماد باقٍ ينتظر');
  perform _eq((select count(*)::int from faostat_pending where item = 'Seen row'), 1, 'والاعتماد رُفض لأنّ الفرق تغيّر: ما رآه المدير باقٍ أيضاً');
  perform _eq((select count(*)::int from faostat_observations where item in ('Late row', 'Seen row')), 0, 'ولم يدخل شيءٌ لم يُرَ');
end $$;
do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — والاعتماد لا يُسقط ما كُتب أثناءه';
end $$;
EOF
)"
echo "── السباق"
pg_run_quiet "$RACE_SETUP"
pg_sh "$PG_PSQL -q -f $RACE_SYNC" >/dev/null &
SYNCER=$!
sleep 0.7
pg_sh "$PG_PSQL -q -f $RACE_APPLY" >/dev/null 2>&1 || true
wait "$SYNCER"
pg_run "$RACE_CHECK"
