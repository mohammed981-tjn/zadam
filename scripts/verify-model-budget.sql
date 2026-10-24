-- بوّابةُ السقف اليوميّ: النموذج المدفوع يُستدعى حتى الحدّ ثمّ يُرفض، لكلّ عنوانٍ وللمنصّة كلّها.
\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score; insert into _score values (0);
create or replace function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create or replace function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;
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

grant usage on schema public to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated, service_role;

-- صغيرةٌ ليسهل بلوغها
update platform_limits set value = 3 where key = 'model_daily_per_address';
update platform_limits set value = 5 where key = 'model_daily_total';

\echo ''
\echo '=========================================================================='
\echo 'أ) عنوانٌ واحد: ثلاثةٌ ثمّ يُرفض'
\echo '=========================================================================='
set role service_role;
do $$
begin
  perform _eq(check_model_budget('model:1.1.1.1'), 'ok', 'الأولى تمرّ');
  perform _eq(check_model_budget('model:1.1.1.1'), 'ok', 'الثانية تمرّ');
  perform _eq(check_model_budget('model:1.1.1.1'), 'ok', 'الثالثة تمرّ');
  perform _eq(check_model_budget('model:1.1.1.1'), 'address_day', 'الرابعة تُرفض بسقف العنوان');
  perform _eq(check_model_budget('model:2.2.2.2'), 'ok', 'وعنوانٌ آخر يمرّ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) المنصّة كلّها: خمسةٌ ثمّ يُرفض الجميع'
\echo '=========================================================================='
do $$
begin
  perform _eq(check_model_budget('model:3.3.3.3'), 'ok', 'الخامسة في المجموع تمرّ (٣ + ١ + ١)');
  perform _eq(check_model_budget('model:4.4.4.4'), 'total_day', 'السادسة تُرفض بسقف المنصّة، ولو كان العنوان جديداً');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from assistant_requests where ip like 'model:%'), 5, 'المرفوضات لا تُعدّ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) يومٌ جديد: ما مضى عليه أكثر من يوم لا يُعدّ'
\echo '=========================================================================='
reset role;
update assistant_requests set created_at = now() - interval '2 days' where ip like 'model:%';
set role service_role;
do $$
begin
  perform _eq(check_model_budget('model:1.1.1.1'), 'ok', 'العنوان نفسه يعود بعد يوم');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) يُغلق إن غاب الحدّ، ويرفض العنوان الفاسد، ولا يدخله غير مفتاح الخدمة'
\echo '=========================================================================='
reset role;
delete from platform_limits where key = 'model_daily_total';
set role service_role;
do $$
begin
  perform _eq(check_model_budget('model:9.9.9.9'), 'unavailable', 'بلا صفّ الحدّ: لا استدعاء (يُغلق)');
  perform _refuses($q$select check_model_budget('assistant:9.9.9.9')$q$, 'مفتاحٌ بغير بادئة «model:» يُرفض');
  perform _refuses($q$select check_model_budget('')$q$, 'والفارغ');
end $$;
reset role;
insert into platform_limits (key, value) values ('model_daily_total', 5);

set role anon;
do $$ begin perform _refuses($q$select check_model_budget('model:7.7.7.7')$q$, 'الزائر المجهول لا يستدعي الدالّة'); end $$;
set role authenticated;
do $$ begin perform _refuses($q$select check_model_budget('model:7.7.7.7')$q$, 'ولا المسجَّل'); end $$;
do $$ begin perform _refuses($q$select * from platform_limits$q$, 'ولا يقرأ الحدود'); end $$;
set role anon;
do $$ begin perform _refuses($q$select * from platform_limits$q$, 'ولا المجهول يقرؤها'); end $$;
reset role;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
