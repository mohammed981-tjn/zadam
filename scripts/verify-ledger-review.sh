#!/usr/bin/env bash
#
# بوّابةُ إصلاحات مراجعة دفتر الحسابات (البند ١٩٨): المدير لا يكتب في دفتر موسم أحد، وسلامة الدفاتر بلا مجاميع
# أحد، والإحصاءات بأشهرٍ منتهية كاملة بشهر التسجيل فلا تُطرح قراءةٌ من قراءة، وكلّ خليّة عملة بالقاعدتين،
# وقاعدة الهيمنة في القيود المتقابلة والمعلّقات، وما يكتبه النظام لا يُعكس يدويّاً والمزامنة تعيد ما سقط، ولا
# مبلغ أقلّ من سنت — وإغلاق الموسم وتسجيل تكلفةٍ في اللحظة نفسها لا يتركان مالاً في «محاصيل قيد النموّ».
#
#   ./scripts/verify-ledger-review.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-review

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
LEDGER="$(pg_stage "$ROOT/supabase/migrations/20261024110000_ledger_engine.sql" ledger.sql)"
FARM="$(pg_stage "$ROOT/supabase/migrations/20261024120000_farm_book.sql" farm.sql)"
SETTLE="$(pg_stage "$ROOT/supabase/migrations/20261024140000_farm_settle.sql" settle.sql)"
OVERSIGHT="$(pg_stage "$ROOT/supabase/migrations/20261024130000_oversight.sql" oversight.sql)"
LINKS="$(pg_stage "$ROOT/supabase/migrations/20261024160000_ledger_links.sql" links.sql)"
LOOKUP="$(pg_stage "$ROOT/supabase/migrations/20261024170000_oversight_lookup.sql" lookup.sql)"
REVERSAL="$(pg_stage "$ROOT/supabase/migrations/20261025100000_ledger_link_reversal.sql" reversal.sql)"
FIVE="$(pg_stage "$ROOT/supabase/migrations/20261025110000_oversight_min_books_5.sql" five.sql)"
FIXES="$(pg_stage "$ROOT/supabase/migrations/20261025160000_ledger_review_fixes.sql" fixes.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-ledger-review.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

# What production has and the harness's small base does not: the season book's policies and its closed-season guard
# as they stand before the fix (20260817120000, 20261024010000), the seasons a person may read, the agreements, and
# `notify_user`.
PROD="$(cat <<'EOF' | pg_write prod.sql
create policy seasons_read on public.seasons
  for select to authenticated using (owner_id = auth.uid() or is_admin());
create policy ledger_own on public.ledger_entries
  for all to authenticated
  using (exists (select 1 from seasons s
                  where s.id = ledger_entries.season_id
                    and ((s.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from seasons s
                       where s.id = ledger_entries.season_id
                         and ((s.owner_id = auth.uid()) or is_admin())));
create or replace function public.ledger_entries_history_gate()
returns trigger language plpgsql security definer set search_path = public as $f$
declare v_status text;
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and new.season_id is distinct from old.season_id then
      raise exception 'لا يُنقل قيدٌ إلى موسمٍ آخر.';
    end if;
    select status into v_status from seasons where id = old.season_id;
    if v_status = 'completed' then
      raise exception 'دفتر موسمٍ أُقفل لا يُعدَّل ولا يُحذف منه شيء؛ أضِف قيداً مصحِّحاً.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $f$;
create trigger ledger_entries_history_gate
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_entries_history_gate();
create table partnership_agreements (
  id uuid primary key default gen_random_uuid(),
  ref text, owner_id uuid not null, investor_id uuid not null, model text not null, status text not null default 'draft'
);
alter table seasons add column if not exists partnership_id uuid;
create or replace function public.notify_user(p_recipient uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if p_recipient is null then return; end if;
  insert into notifications (recipient_id, kind, title, body, link) values (p_recipient, p_kind, p_title, p_body, p_link);
end $f$;
EOF
)"

# Two sessions at once: one closes a season and holds the close open; the other records a cost in it meanwhile.
RACE_CLOSE="$(cat <<'EOF' | pg_write race-close.sql
begin;
update seasons set status = 'completed' where id = '5e000000-0000-0000-0000-0000000000ee';
select pg_sleep(2);
commit;
EOF
)"
RACE_COST="$(cat <<'EOF' | pg_write race-cost.sql
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
values ('5e000000-0000-0000-0000-0000000000ee', 'seeds', 40, current_date, 'f6000000-0000-0000-0000-0000000000f6');
EOF
)"
RACE_CHECK="$(cat <<'EOF' | pg_write race-check.sql
\set ON_ERROR_STOP on
\set QUIET on
\echo ''
\echo '=========================================================================='
\echo 'و) إغلاق الموسم وتسجيل تكلفةٍ في اللحظة نفسها (أ٦)'
\echo '=========================================================================='
do $$
declare s uuid := '5e000000-0000-0000-0000-0000000000ee'; f uuid := 'f6000000-0000-0000-0000-0000000000f6';
begin
  perform _eq((select status from seasons where id = s), 'completed', 'أُغلق الموسم');
  perform _eq((select count(*)::int from ledger_entries where season_id = s and amount = 40), 1, 'وسُجّلت التكلفة أثناء إغلاقه');
  perform _eq(_net(f, 'farm', 'crops_in_progress', s), 0::bigint, 'ولا يبقى منها شيءٌ في «محاصيل قيد النموّ»');
  perform _eq(_net(f, 'farm', 'cost_seeds', s), 4000::bigint + 1000, 'والتكلفة كلّها في حسابها (١٠ قبل الإغلاق + ٤٠)');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
EOF
)"

echo "── الأساس";          pg_run_quiet "$BASE"
echo "── الافتراضي";       pg_run_quiet "$DEFAULTS"
echo "── ما في الإنتاج";    pg_run_quiet "$PROD"
echo "── الأسعار";         pg_run_quiet "$QUOTES"
echo "── المحرّك";         pg_run_quiet "$LEDGER"
echo "── دفتر المزرعة";    pg_run_quiet "$FARM"
echo "── التسوية";         pg_run_quiet "$SETTLE"
echo "── الإشراف";         pg_run_quiet "$OVERSIGHT"
echo "── القيود المتقابلة"; pg_run_quiet "$LINKS"
echo "── البحث عن دفتر";   pg_run_quiet "$LOOKUP"
echo "── إلغاء المتقابل";  pg_run_quiet "$REVERSAL"
echo "── خمسة دفاتر";      pg_run_quiet "$FIVE"
echo "── الإصلاحات";       pg_run "$FIXES" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"

echo "── السباق"
pg_sh "$PG_PSQL -q -f $RACE_CLOSE" >/dev/null &
CLOSER=$!
sleep 0.7
pg_sh "$PG_PSQL -q -f $RACE_COST" >/dev/null
wait "$CLOSER"
pg_run "$RACE_CHECK"
