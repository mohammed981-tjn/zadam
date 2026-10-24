-- بوّابةُ تنبيهات الأسعار.
\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score; insert into _score values (0);
create or replace function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create or replace function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;
create or replace function _act_as(p uuid) returns void language plpgsql as $$ begin update _who set uid = p; end $$;
create or replace function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
create or replace function _refuses(q text, label text) returns void language plpgsql as $$
begin
  execute q; perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  perform _pass(label || ' — ' || left(sqlerrm, 60));
end $$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('c3000000-0000-0000-0000-0000000000c3')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated, service_role;
grant select on notifications to authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) صاحب التنبيه يضيف ويقرأ ويوقف، والغريب لا يرى'
\echo '=========================================================================='
set role authenticated;
do $$
declare a uuid; b uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  a := price_alert_create('crop', 'obeid', 'groundnut', 'qintar', 'above', 600000);
  b := price_alert_create('fx_parallel', null, null, null, 'below', 9000);
  perform _eq((select count(*)::int from price_alerts), 2, 'يرى تنبيهيه');
  perform _eq((select status from price_alerts where id = a), 'active', 'وكلٌّ شغّال');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from price_alerts), 0, 'الغريب لا يرى تنبيهات غيره');
  perform _eq(price_alert_stop(a), false, 'ولا يوقف تنبيه غيره');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(price_alert_stop(a), true, 'صاحبه يوقفه');
  perform _eq(price_alert_stop(a), false, 'وإيقافه مرّتين لا يفعل شيئاً');
  perform _eq((select status from price_alerts where id = a), 'stopped', 'ويبقى مسجَّلاً موقوفاً');
  perform _eq((select (settled_at is not null) from price_alerts where id = a), true, 'بيومه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) لا كتابة مباشرة، ولا تنبيهٌ بشكلٍ مستحيل'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$insert into price_alerts (user_id, subject, direction, threshold) values ('a1000000-0000-0000-0000-0000000000a1', 'fx_bank', 'above', 1)$q$, 'لا إدراج مباشر');
  perform _refuses($q$update price_alerts set threshold = 1$q$, 'ولا تعديل مباشر');
  perform _refuses($q$delete from price_alerts$q$, 'ولا حذف');
  perform _refuses($q$select price_alert_create('crop', null, null, null, 'above', 100)$q$, 'محصولٌ بلا سوق');
  perform _refuses($q$select price_alert_create('fx_bank', 'obeid', null, null, 'above', 100)$q$, 'عملةٌ باسم سوق');
  perform _refuses($q$select price_alert_create('gold', null, null, null, 'above', 100)$q$, 'موضوعٌ غير معروف');
  perform _refuses($q$select price_alert_create('fx_bank', null, null, null, 'sideways', 100)$q$, 'اتجاهٌ غير فوق ولا تحت');
  perform _refuses($q$select price_alert_create('fx_bank', null, null, null, 'above', 0)$q$, 'حدٌّ صفر');
  perform _refuses($q$select price_alert_create('fx_bank', null, null, null, 'above', -5)$q$, 'حدٌّ سالب');
  perform _refuses($q$select price_alert_create('crop', 'obeid', 'ground nut', 'qintar', 'above', 5)$q$, 'اسم محصولٍ بمسافة');
  perform _refuses($q$select price_alert_create('crop', 'obeid', 'groundnut', 'bucket', 'above', 5)$q$, 'وحدةٌ غير معروفة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) عشرةٌ شغّالة كحدٍّ أقصى، والموقوف لا يُحسب'
\echo '=========================================================================='
do $$
declare i integer;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- one is already active (the parallel-market one); add eight more to reach nine, then the tenth
  for i in 1..8 loop
    perform price_alert_create('fx_bank', null, null, null, 'above', 5000 + i);
  end loop;
  perform _eq((select count(*)::int from price_alerts where status = 'active'), 9, 'تسعة شغّالة');
  perform price_alert_create('fx_bank', null, null, null, 'above', 6000);
  perform _eq((select count(*)::int from price_alerts where status = 'active'), 10, 'والعاشر يمرّ');
  perform _refuses($q$select price_alert_create('fx_bank', null, null, null, 'above', 7000)$q$, 'والحادي عشر يُرفض');
  perform price_alert_stop((select id from price_alerts where threshold = 6000));
  perform price_alert_create('fx_bank', null, null, null, 'above', 7000);
  perform _eq((select count(*)::int from price_alerts where status = 'active'), 10, 'بعد إيقاف واحدٍ يُقبل غيره');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الإطلاق: لمفتاح الخدمة وحده، مرّةً واحدة، وإشعارٌ معه'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select price_alert_fire((select id from price_alerts where status = 'active' limit 1), 7000, current_date, 't', 'b', '/market')$q$,
    'المستخدم لا يطلق تنبيهاً، ولا تنبيهه');
end $$;
reset role;
set role anon;
do $$
begin
  perform _refuses($q$select price_alert_create('fx_bank', null, null, null, 'above', 1)$q$, 'الزائر لا يضيف');
  perform _refuses($q$select price_alert_stop('00000000-0000-0000-0000-000000000000')$q$, 'ولا يوقف');
  perform _refuses($q$select * from price_alerts$q$, 'ولا يقرأ');
end $$;
reset role;

do $$
declare target uuid; n integer;
begin
  select id into target from price_alerts where subject = 'fx_parallel' and status = 'active';
  perform _eq(has_function_privilege('service_role', 'price_alert_fire(uuid,numeric,date,text,text,text)', 'execute'), true, 'مفتاح الخدمة يملك الإطلاق');
  perform _eq(has_function_privilege('authenticated', 'price_alert_fire(uuid,numeric,date,text,text,text)', 'execute'), false, 'والمسجَّل لا يملكه');
  perform _eq(price_alert_fire(target, 8800, date '2026-10-24', 'الدولار الموازي نزل', 'وصل 8800', '/rates'), true, 'الإطلاق الأوّل يمرّ');
  perform _eq((select status from price_alerts where id = target), 'fired', 'ويغلق التنبيه');
  perform _eq((select fired_value from price_alerts where id = target), 8800::numeric, 'بالرقم الذي أطلقه');
  perform _eq((select count(*)::int from notifications where kind = 'price_alert' and recipient_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'ويكتب إشعاراً لصاحبه');
  perform _eq(price_alert_fire(target, 8800, date '2026-10-24', 'الدولار الموازي نزل', 'وصل 8800', '/rates'), false, 'والثاني لا يمرّ');
  perform _eq((select count(*)::int from notifications where kind = 'price_alert'), 1, 'ولا إشعار ثانٍ');
  select id into target from price_alerts where status = 'stopped' limit 1;
  perform _eq(price_alert_fire(target, 1, date '2026-10-24', 't', 'b', '/rates'), false, 'والموقوف لا يُطلَق');
  perform _refuses($q$select price_alert_fire((select id from price_alerts where status = 'active' limit 1), 1, current_date, '  ', 'b', '/rates')$q$, 'ولا إشعار بلا عنوان');
  select count(*) into n from price_alerts where status = 'active';
  perform _eq(n >= 1, true, 'وغير المطلَق يبقى شغّالاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) قيد الإشعارات يقبل الجديد ويبقي القديم'
\echo '=========================================================================='
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'notifications_kind_check';
  perform _eq(def like '%''price_alert''%', true, 'النوع الجديد مقبول');
  perform _eq(def like '%''message''%' and def like '%''stage_due''%' and def like '%''locust_near''%' and def like '%''land_verified''%', true, 'وأنواع الإشعارات السابقة باقية');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
