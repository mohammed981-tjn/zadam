-- بوّابةُ الرمز الثاني للإدارة (AUTH-04).

\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score;
insert into _score values (0);

create or replace function _fail(label text, why text) returns void
language plpgsql as $$
begin
  raise notice '  FAIL  % — %', label, why;
  update _score set fails = fails + 1;
end $$;

create or replace function _pass(label text) returns void
language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null'));
  end if;
end $$;

create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin execute stmt;
  exception when others then perform _pass(label); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _act_as(p uuid, p_aal text) returns void
language plpgsql as $$ begin update _who set uid = p, aal = p_aal; end $$;

-- f9 مدير · a1 عضو
insert into auth.users (id) values
  ('f9000000-0000-0000-0000-0000000000f9'), ('a1000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'عضو', 'investor')
on conflict (id) do update set role = excluded.role;
insert into lands (owner_id, name, state, feddans, station_key, water_source)
values ('a1000000-0000-0000-0000-0000000000a1', 'أرض العضو', 'سنار', 10, 'sennar', 'rain');

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

\echo ''
\echo 'أ) المدير بكلمة المرور وحدها ليس مديراً في القاعدة'

set role authenticated;
do $$ begin
  perform _act_as('f9000000-0000-0000-0000-0000000000f9', 'aal1');
  perform _eq(is_admin(), false, 'مديرٌ دخل بكلمة المرور وحدها: ليس مديراً');
  perform _eq(admin_session_state(), 'needs_second_factor', 'وتقول له الصفحات: ينقصك الرمز الثاني');
  perform _eq((select count(*)::int from lands), 0, 'فلا يرى أراضي الأعضاء');
  perform _refuses($q$select admin_second_factor_set(false)$q$, 'ولا يوقف الشرط عن نفسه');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9', null);
  perform _eq(is_admin(), false, 'ولا جلسةٌ بلا مستوى');

  perform _act_as('f9000000-0000-0000-0000-0000000000f9', 'aal2');
  perform _eq(is_admin(), true, 'وبالرمز الثاني: مدير');
  perform _eq(admin_session_state(), 'ok', 'والصفحات تعمل');
  perform _eq((select count(*)::int from lands), 1, 'ويرى ما يراه المدير');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1', 'aal2');
  perform _eq(is_admin(), false, 'والعضو بالرمز الثاني ليس مديراً');
  perform _eq(admin_session_state(), 'not_admin', 'ولا تعرض له الصفحات شيئاً من الإدارة');
  perform _refuses($q$select admin_second_factor_set(false)$q$, 'ولا يوقف الشرط');
  perform _refuses($q$update security_settings set admin_requires_second_factor = false$q$,
                   'ولا يكتب في الإعداد مباشرةً');
end $$;
reset role;
set role anon;
do $$ begin
  perform _act_as(null, null);
  perform _eq(is_admin(), false, 'والزائر ليس مديراً');
  perform _refuses($q$select admin_session_state()$q$, 'ولا يسأل عن حال الإدارة');
  perform _refuses($q$select * from security_settings$q$, 'ولا يقرأ الإعداد');
end $$;
reset role;

\echo ''
\echo 'ب) المفتاح بيد مديرٍ دخل بالرمز الثاني'

set role authenticated;
do $$ begin
  perform _act_as('f9000000-0000-0000-0000-0000000000f9', 'aal2');
  perform admin_second_factor_set(false);
  perform _act_as('f9000000-0000-0000-0000-0000000000f9', 'aal1');
  perform _eq(is_admin(), true, 'أوقفه المدير، فصار يعمل بكلمة المرور');
  perform _eq(admin_session_state(), 'ok', 'وتعمل الصفحات');
  perform admin_second_factor_set(true);
  perform _eq(is_admin(), false, 'وأعاده (والإعادة لا تحتاج أكثر ممّا أوقفه)، فعاد الشرط في الحال');
end $$;
reset role;
do $$ begin
  perform _eq((select updated_by from security_settings), 'f9000000-0000-0000-0000-0000000000f9'::uuid, 'ويُحفظ من قلبه');
  perform _eq(has_function_privilege('anon', 'admin_second_factor_set(boolean)', 'execute'), false,
              'ولا ينادي الزائر المفتاح');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
