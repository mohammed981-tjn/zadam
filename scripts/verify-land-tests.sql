-- بوّابةُ فحوص الأرض.
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
  ('a1000000-0000-0000-0000-0000000000a1'), ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'صاحب الأرض', 'farmer'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;
insert into lands (id, owner_id, name, state, feddans, station_key, water_source)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أرض', 'الجزيرة', 10, 'khartoum', 'canal');

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _score to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated;
grant select on lands, profiles to authenticated;
grant execute on function public.is_admin() to authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) صاحب الأرض يضيف ويقرأ، والغريب لا يرى ولا يضيف'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into land_tests (land_id, kind, tested_on, lab, ec_dsm, ph, note)
  values ('11000000-0000-0000-0000-000000000001', 'water', current_date - 30, 'مختبر مدني', 1.2, 7.4, 'بئر الشمال');
  insert into land_tests (land_id, kind, tested_on, ec_dsm, ph, organic_matter_pct)
  values ('11000000-0000-0000-0000-000000000001', 'soil', current_date - 10, 4.1, 7.9, 0.6);
  perform _eq((select count(*)::int from land_tests), 2, 'يرى فحصيه');
  perform _eq((select created_by from land_tests where kind = 'water'), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'ومن كتبهما هو');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from land_tests), 0, 'الغريب لا يرى فحوص أرض غيره');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ec_dsm) values ('11000000-0000-0000-0000-000000000001', 'water', current_date, 1)$q$,
    'ولا يضيف فحصاً لأرض غيره');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from land_tests), 2, 'والمدير يرى الفحوص كلّها');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) قيمٌ مستحيلة وتواريخ لا تُقبل'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ph) values ('11000000-0000-0000-0000-000000000001', 'soil', current_date, 15)$q$, 'pH فوق ١٤');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ec_dsm) values ('11000000-0000-0000-0000-000000000001', 'water', current_date, -1)$q$, 'ملوحة سالبة');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on) values ('11000000-0000-0000-0000-000000000001', 'water', current_date)$q$, 'فحصٌ بلا قيمةٍ واحدة');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ph) values ('11000000-0000-0000-0000-000000000001', 'water', current_date + 30, 7)$q$, 'تاريخٌ في المستقبل');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ph) values ('11000000-0000-0000-0000-000000000001', 'water', date '1990-01-01', 7)$q$, 'تاريخٌ قبل عام ٢٠٠٠');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, organic_matter_pct) values ('11000000-0000-0000-0000-000000000001', 'water', current_date, 2)$q$, 'مادّة عضويّة في فحص ماء');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ph) values ('11000000-0000-0000-0000-000000000001', 'air', current_date, 7)$q$, 'نوعٌ غير ماء وتربة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) لا تعديل، والحذف خلال ساعة، والمدير يحذف متى شاء'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$update land_tests set ph = 6.0 where kind = 'water'$q$, 'لا تعديل لفحصٍ: لا امتياز تعديل أصلاً');
end $$;
reset role;
update land_tests set created_at = now() - interval '2 hours' where kind = 'water';
set role authenticated;
do $$
declare n integer;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  delete from land_tests where kind = 'water';
  get diagnostics n = row_count;
  perform _eq(n, 0, 'الفحص الذي مضت عليه ساعتان لا يحذفه صاحبه');
  delete from land_tests where kind = 'soil';
  get diagnostics n = row_count;
  perform _eq(n, 1, 'وما كُتب قبل دقائق يحذفه (خطأ كتابة)');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  delete from land_tests where kind = 'water';
  get diagnostics n = row_count;
  perform _eq(n, 1, 'والمدير يحذف القديم');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الزائر لا يمسّ الجدول'
\echo '=========================================================================='
reset role;
set role anon;
do $$
begin
  perform _refuses($q$select * from land_tests$q$, 'الزائر لا يقرأ');
  perform _refuses($q$insert into land_tests (land_id, kind, tested_on, ph) values ('11000000-0000-0000-0000-000000000001', 'water', current_date, 7)$q$, 'ولا يكتب');
end $$;
reset role;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
