-- بوّابةُ التنبيهات الحقليّة: الخبرُ يصل مرّةً، والقديمُ لا يُكرَّر، ولا يكتب
-- التنبيهَ إلّا مفتاحُ الخدمة.

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
    perform _pass(label || ' — ' || coalesce(got::text,'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text,'null') || ' والمتوقَّع ' || coalesce(want::text,'null'));
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

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function _refuses(text, text), _pass(text), _fail(text, text) to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
-- In production the service role passes row-level security and holds every
-- table; the base schema predates the defaults above, so it is granted here.
alter role service_role bypassrls;
grant select on notifications to service_role;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;

\echo ''
\echo 'أ) الإشعار يُكتب مرّةً واحدة'

set role service_role;
do $$ begin
  perform _eq(field_alert_send('a1000000-0000-0000-0000-0000000000a1', array['locust:l1:2026-10-15:14.500,35.000:ADULT'],
    'locust_near', 'جرادٌ على بعد 66 كم من «أرض القضارف»', 'نصّ', '/tools/feasibility'), true, 'الرصدُ الجديد يكتب إشعاراً');
  perform _eq(field_alert_send('a1000000-0000-0000-0000-0000000000a1', array['locust:l1:2026-10-15:14.500,35.000:ADULT'],
    'locust_near', 'جرادٌ على بعد 66 كم من «أرض القضارف»', 'نصّ', '/tools/feasibility'), false, 'والرصدُ نفسُه في الغد لا يكتب شيئاً');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'فيبقى إشعارٌ واحد');
  perform _eq(field_alert_send('a1000000-0000-0000-0000-0000000000a1',
    array['locust:l1:2026-10-15:14.500,35.000:ADULT', 'locust:l1:2026-10-19:14.500,35.000:ADULT'],
    'locust_near', 'جرادٌ', 'نصّ', '/tools/feasibility'), true, 'ورصدٌ جديدٌ مع القديم يكتب');
  perform _eq(field_alert_send('b2000000-0000-0000-0000-0000000000b2', array['disease:E1', 'disease:E1'],
    'animal_disease', 'طاعون المجترّات الصغيرة في ولاية القضارف', 'نصّ', '/herds'), true, 'وما أُبلغ به أ لا يُحسب مُبلَّغاً لـب، والمفتاح المكرّر في النداء لا يكسره');
  perform _eq((select count(*)::int from field_alerts_sent), 3, 'وتُحفظ المفاتيح: اثنان لأ وواحدٌ لـب');
  perform _eq((select kind from notifications where recipient_id = 'b2000000-0000-0000-0000-0000000000b2'), 'animal_disease', 'بنوعه');
  perform _eq(field_alert_send('b2000000-0000-0000-0000-0000000000b2', '{}'::text[], 'animal_disease', 'x', 'x', '/herds'), false, 'وبلا مفاتيح لا يكتب شيئاً');
  perform _eq(field_alert_send('a1000000-0000-0000-0000-0000000000a1', array['stage:s1'], 'stage_due', 'اليوم موعد مرحلة «الزراعة»', 'نصّ', '/seasons/x'), true, 'وتذكير المرحلة يُكتب');
  perform _eq(field_alert_send('a1000000-0000-0000-0000-0000000000a1', array['stage:s1'], 'stage_due', 'اليوم موعد مرحلة «الزراعة»', 'نصّ', '/seasons/x'), false, 'ومرّةً واحدة لكلّ مرحلة');
  perform _refuses($q$select field_alert_send('b2000000-0000-0000-0000-0000000000b2', array['k:1'], 'land_verified', 'x', 'x', '/')$q$,
    'ولا يكتب نوعاً آخر من الإشعارات');
  perform _refuses($q$select field_alert_send('b2000000-0000-0000-0000-0000000000b2', array['k:2'], 'animal_disease', '  ', 'x', '/herds')$q$,
    'ولا تنبيهاً بلا عنوان');
end $$;
reset role;

\echo ''
\echo 'ب) لا يكتبه ولا يقرأ سجلّه زائرٌ ولا مستخدم'

do $$ begin
  perform _eq(has_function_privilege('anon', 'public.field_alert_send(uuid, text[], text, text, text, text)', 'execute'), false, 'الزائر لا يستدعيه');
  perform _eq(has_function_privilege('authenticated', 'public.field_alert_send(uuid, text[], text, text, text, text)', 'execute'), false, 'ولا المستخدم المسجّل');
  perform _eq(has_function_privilege('service_role', 'public.field_alert_send(uuid, text[], text, text, text, text)', 'execute'), true, 'والمهمّةُ بمفتاح الخدمة تستدعيه');
  perform _eq(has_table_privilege('anon', 'public.field_alerts_sent', 'select'), false, 'الزائر لا يقرأ سجلّ المُبلَّغ');
  perform _eq(has_table_privilege('authenticated', 'public.field_alerts_sent', 'insert'), false, 'ولا يكتب فيه المستخدم');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.field_alerts_sent'::regclass), true, 'وحمايةُ الصفوف عليه');
end $$;

\echo ''
\echo 'ج) أنواعُ الإشعارات القديمة باقية'

do $$ begin
  perform _eq((select count(*)::int from unnest(array['land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected','lead_received','feedback_received',
    'feedback_replied','nafir_joined','faza_pledged','shura_answered','judiyya_update','canal_update']) k
    where pg_get_constraintdef((select oid from pg_constraint where conname = 'notifications_kind_check')) like '%''' || k || '''%'), 14,
    'الأربعة عشر نوعاً كلّها في القيد');
  perform _refuses($q$insert into notifications (recipient_id, kind, title) values ('a1000000-0000-0000-0000-0000000000a1', 'not_a_kind', 'x')$q$,
    'ونوعٌ غير معروف يُرفض');
end $$;

do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
