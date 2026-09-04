#!/usr/bin/env bash
#
# بوّابةُ تدقيق الاستثمار — على PostgreSQL حقيقيّ.
#
#   ./scripts/verify-investment-audit.sh
#
# WHY A REAL DATABASE
#
# What is being checked here is not TypeScript logic. It is what the function
# returns for each kind of refusal, what the append-only trigger does to an
# UPDATE, and which roles PostgreSQL lets through the door. All three are
# database behaviour, and mocking any of them proves nothing about it.
#
# THE STUBS
#
# `profiles`, `projects`, `investments` and `auth.uid()` are all part of the
# base schema, which still lives outside the migrations directory. They are
# stubbed to the minimum the guards need — including the `investment_status`
# enum, because the real column is an enum and a text stub would let a typo
# through that production would reject.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start investment-audit

STUBS="$(pg_write stubs.sql <<'SQL'
create schema if not exists auth;

create table profiles (id uuid primary key, role text default 'farmer');

-- النوعُ الحقيقيُّ في الإنتاج تعداديّ لا نصّيّ، فيُحاكى كذلك: جدولٌ نصّيٌّ كان
-- سيقبل حالةً مكتوبةً خطأً ترفضها القاعدةُ الحقيقيّة.
create type investment_status as enum ('pending', 'confirmed', 'cancelled');

create table projects (
  id           uuid primary key,
  total_shares integer not null,
  shares_sold  integer not null default 0
);

create table investments (
  id          uuid primary key,
  project_id  uuid not null references projects(id),
  investor_id uuid not null references profiles(id),
  shares      integer not null,
  amount      numeric not null default 0,
  status      investment_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- هويّةٌ قابلةٌ للتبديل: فحصٌ يتصرّف كمدير، وآخرُ كمستثمر، وآخرُ بلا هويّة.
create table _who (uid uuid);
insert into _who values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who $$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- النسخةُ القديمة، كي يكون ما تفعله الهجرةُ حذفاً حقيقياً لا إنشاءً على فراغ.
create function public.confirm_investment(p_investment_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $old$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return;
end $old$;

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;
SQL
)"

MIGRATION="$(pg_stage "$ROOT/supabase/migrations/20260904140000_investment_audit.sql" migration.sql)"
CHECKS="$(pg_stage    "$ROOT/scripts/verify-investment-audit.sql" checks.sql)"

echo "── الأساس";   pg_run_quiet "$STUBS"
echo "── الهجرة";   pg_run_quiet "$MIGRATION"

# هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ — و `create policy` بلا
# `if not exists` في PostgreSQL، فإعادةُ التطبيق ليست مضمونةً بلا قصد.
echo "── وثانيةً — إعادةُ التطبيق لا تكسر"
pg_run_quiet "$MIGRATION"

echo "── الحرّاس"
pg_run "$CHECKS"

# ===========================================================================
# التزامن — الحارسُ الذي لا تراه جلسةٌ واحدة
# ===========================================================================
#
# WHY THIS SECTION EXISTS SEPARATELY
#
# Every check above runs in one session, and `FOR UPDATE` is invisible to one
# session: remove it and a serial test passes exactly as before. Which means
# that until this section existed, the gate proved nothing about the one guard
# standing between this platform and selling the same shares twice — and the
# lock could have been deleted by anyone tidying the function, with 27 green
# checks agreeing.
#
# So two real connections, deliberately interleaved:
#
#   A: begin; confirm(#1);  ...holds the transaction open...  commit;
#   B:            confirm(#2)   ← starts while A is still open
#
# The project has 10 shares left and each request wants 8. Exactly one may pass.
#
#   With FOR UPDATE  → B blocks on the locked row, wakes after A commits, reads
#                      the *new* count, and is refused. Sold ends at 98.
#   Without it       → B reads the stale count before blocking, passes the
#                      allocation check on it, and applies its increment after A
#                      commits. Sold ends at 106 — more shares sold than exist.
#
# The assertion is therefore the simplest one possible, and the only one that
# matters to an owner: never more sold than the project has.

echo ""
echo "=========================================================================="
echo "ز) التزامن — جلستان تتسابقان على آخر الحصص"
echo "=========================================================================="

RACE_SETUP="$(pg_write race-setup.sql <<'SQL'
insert into projects (id, total_shares, shares_sold)
values ('33333333-0000-0000-0000-000000000001', 100, 90);

insert into investments (id, project_id, investor_id, shares, status) values
  ('44444444-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-00000000000b', 8, 'pending'),
  ('44444444-0000-0000-0000-000000000002',
   '33333333-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000c', 8, 'pending');

-- المديرُ هو الفاعلُ في الجلستين.
update _who set uid = 'a0000000-0000-0000-0000-00000000000a';
SQL
)"

RACE_A="$(pg_write race-a.sql <<'SQL'
begin;
select confirm_investment('44444444-0000-0000-0000-000000000001') as session_a;
-- تبقى المعاملةُ مفتوحةً عمداً، كي تبدأ الجلسةُ الثانية والقفلُ قائم.
select pg_sleep(3);
commit;
SQL
)"

RACE_B="$(pg_write race-b.sql <<'SQL'
select confirm_investment('44444444-0000-0000-0000-000000000002') as session_b;
SQL
)"

RACE_CHECK="$(pg_write race-check.sql <<'SQL'
do $$
declare v_sold integer; v_total integer; v_confirmed integer;
begin
  select shares_sold, total_shares into v_sold, v_total
    from projects where id = '33333333-0000-0000-0000-000000000001';
  select count(*) into v_confirmed from investments
   where project_id = '33333333-0000-0000-0000-000000000001'
     and status = 'confirmed';

  if v_sold > v_total then
    raise notice '  FAIL  بيعت % حصة من أصل % — بيعَ ما لا يُملك', v_sold, v_total;
    raise exception 'التزامن: تجاوزُ التخصيص';
  end if;
  raise notice '  PASS  لم يُبَع أكثرُ ممّا يُملك — % من %', v_sold, v_total;

  if v_confirmed <> 1 then
    raise notice '  FAIL  أُكِّد % طلباً والمتوقَّع واحد', v_confirmed;
    raise exception 'التزامن: عددُ المؤكَّد';
  end if;
  raise notice '  PASS  واحدٌ فاز والآخرُ رُفض — لا كلاهما';
end $$;
SQL
)"

pg_run_quiet "$RACE_SETUP"

# A في الخلفيّة، ثمّ B بعد ثانيةٍ — فتبدأ وA ما تزال مفتوحة.
pg_sh "$PG_PSQL -q -f $RACE_A" >/dev/null 2>&1 &
RACE_A_PID=$!
sleep 1
pg_sh "$PG_PSQL -q -f $RACE_B" >/dev/null 2>&1 || true
wait "$RACE_A_PID" || true

pg_run "$RACE_CHECK"
