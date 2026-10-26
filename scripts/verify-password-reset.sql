-- بوّابةُ استعادة كلمة مرور حساب الجوال (AUTH-05).

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- p1 حساب جوال · f9 مدير
insert into auth.users (id, email, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'p249912000001@phone.sudagri.local', '249912000001'),
  ('f9000000-0000-0000-0000-0000000000f9', 'admin@example.org', null)
on conflict (id) do update set email = excluded.email, phone = excluded.phone;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'محمد أحمد', 'investor', '+249912000001'),
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
create table _r (id uuid);
grant select, insert, delete on _r to authenticated, service_role;

\echo ''
\echo 'أ) الطلب من الخادم وحده، ولا يكشف أيّ رقمٍ له حساب'

set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select password_reset_request('p249912000001@phone.sudagri.local', 'محمد')$q$,
                   'الزائر لا يكتب الطلب بالمفتاح العامّ');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select password_reset_request('p249912000001@phone.sudagri.local', 'محمد')$q$, 'ولا العضو');
  perform _refuses($q$insert into password_reset_requests (user_id, given_name)
                      values ('a1000000-0000-0000-0000-0000000000a1', 'محمد')$q$, 'ولا يكتب أحدٌ في الجدول');
end $$;
reset role;
set role service_role;
do $$ begin
  perform password_reset_request('p249999999999@phone.sudagri.local', 'غريب');
  perform password_reset_request('P249912000001@phone.sudagri.local ', 'محمد أحمد علي');
  perform password_reset_request('p249912000001@phone.sudagri.local', 'محمد مرّةً ثانية');
  perform password_reset_request('p249912000001@phone.sudagri.local', ' ');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from password_reset_requests), 1,
              'رقمٌ بلا حساب لا يُسجَّل، وطلبٌ مفتوحٌ واحد للحساب مهما تكرّر');
  perform _eq((select given_name from password_reset_requests), 'محمد أحمد علي', 'ويُحفظ الاسم كما كتبه');
  insert into _r select id from password_reset_requests;
  perform _eq((select count(*)::int from notifications where kind = 'password_reset'
                 and recipient_id = 'f9000000-0000-0000-0000-0000000000f9' and link = '/admin/resets'), 1,
              'وتُخبَر الإدارة مرّةً واحدة');
end $$;

\echo ''
\echo 'ب) الإدارة وحدها ترى الطلب وتغلقه'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from password_reset_requests), 0, 'صاحب الحساب لا يرى قائمة الطلبات');
  perform _eq((select count(*)::int from password_reset_pending()), 0, 'ولا دالّتها');
  perform _refuses(format('select password_reset_close(%L, true, null)', (select id from _r)), 'ولا يغلق طلباً');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _eq((select account_phone from password_reset_pending()), '+249912000001',
              'والمدير يرى جوّال الحساب نفسه ليتّصل به');
  perform _eq((select account_name || ' / ' || given_name from password_reset_pending()), 'محمد أحمد / محمد أحمد علي',
              'واسم الحساب بجانب الاسم المكتوب ليقارن');
  perform _refuses(format('select password_reset_close(%L, false, null)', (select id from password_reset_pending())),
                   'ولا يردّه بلا سبب');
  perform _eq(password_reset_close((select id from password_reset_pending()), true, null),
              'a1000000-0000-0000-0000-0000000000a1'::uuid, 'ويغلقه بالاستعادة، فتُرجع الدالّة الحساب الذي تُغيَّر كلمته');
  perform _refuses(format('select password_reset_close(%L, true, null)', (select id from password_reset_requests limit 1)),
                   'ولا يُغلق مرّتين');
end $$;
reset role;
set role service_role;
do $$ begin
  perform password_reset_request('p249912000001@phone.sudagri.local', 'محمد أحمد');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from password_reset_requests where status = 'open'), 1,
              'وبعد إغلاقه يُطلب من جديد');
end $$;
set role authenticated;
do $$ begin
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform password_reset_close((select id from password_reset_pending()), false, 'لم يُجب على الرقم المسجَّل');
end $$;
reset role;
do $$ begin
  perform _eq((select note from password_reset_requests where status = 'refused'), 'لم يُجب على الرقم المسجَّل',
              'والمردود يحفظ سببه');
  perform _eq(has_function_privilege('anon', 'password_reset_pending()', 'execute'), false, 'ولا ينادي الزائر القائمة');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
