-- بوّابةُ تربة الموقع (البند ١٨٠).
--
-- A reading of the soil at a land's own point is written by one function, with its source and its
-- probability; an owner cannot claim a satellite reading for a class he typed, a land that moves
-- loses the reading of the old place, and writing a reading does not send a verified land back to
-- review — while an owner changing the class by hand still does.
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

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('c3000000-0000-0000-0000-0000000000c3', 'stranger@example.com'),
  ('f6000000-0000-0000-0000-0000000000f6', 'admin@example.com')
on conflict (id) do update set email = excluded.email;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'صاحب الأرض', 'investor', '249911111111'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant select, insert, update, delete on lands, profiles to anon, authenticated;
grant select on notifications to authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated;
grant select, update on _score to anon, authenticated;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required, tenure, soil_class)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'جبل أولياء', 'ود البشير', 15.3000, 32.5000, 20, 'khartoum', 'river_pump', 'verified', 3,
        'freehold', 'Vertisols');
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg');
update lands set listed = true where id = '11000000-0000-0000-0000-000000000001';
delete from notifications;

\echo ''
\echo '=========================================================================='
\echo 'أ) الدالّة تكتب الصنف والمصدر والاحتمال معاً، لصاحب الأرض وحده'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Fluvisols', 40)$q$, 'الغريب لا يكتب قراءة لأرض غيره');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select soil_source from lands where id = '11000000-0000-0000-0000-000000000001'), null::text, 'الصنف القديم بلا مصدر');
  perform land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Fluvisols', 41);
  perform _eq((select soil_class from lands where id = '11000000-0000-0000-0000-000000000001'), 'Fluvisols', 'الصنف المقروء حلّ محلّ القديم');
  perform _eq((select soil_source from lands where id = '11000000-0000-0000-0000-000000000001'), 'point', 'بمصدره');
  perform _eq((select soil_pct::int from lands where id = '11000000-0000-0000-0000-000000000001'), 41, 'واحتماله');
  perform _refuses($q$select land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'fluvisols', 41)$q$, 'اسمٌ بحرفٍ صغير يُرفض');
  perform _refuses($q$select land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Fluvisols', 101)$q$, 'احتمالٌ فوق ١٠٠ يُرفض');
  perform _refuses($q$select land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Fluvisols; drop', 50)$q$, 'ونصٌّ غير اسم يُرفض');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) قراءةُ الأقمار لا تُعيد الأرض الموثّقة إلى المراجعة'
\echo '=========================================================================='
do $$
begin
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified', 'الأرض ما زالت موثّقة بعد القراءتين');
  perform _eq((select listed from lands where id = '11000000-0000-0000-0000-000000000001'), true, 'وما زالت معروضة');
  perform _eq((select count(*)::int from notifications), 0, 'ولا إشعارَ «عادت أرضك إلى المراجعة»');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) المالك لا يدّعي مصدراً، وما كتبه بيده يُعيد الأرض كما كان'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  update lands set soil_source = null, soil_pct = 99 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select soil_source from lands where id = '11000000-0000-0000-0000-000000000001'), 'point', 'تعديله المصدر مباشرةً يُتجاهل');
  perform _eq((select soil_pct::int from lands where id = '11000000-0000-0000-0000-000000000001'), 41, 'وكذلك الاحتمال');
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified', 'ولم تُمسّ الأرض');

  -- writing the class by hand is the owner's own claim: it reopens, and it is no longer a reading.
  update lands set soil_class = 'Arenosols' where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select soil_source from lands where id = '11000000-0000-0000-0000-000000000001'), null::text, 'صنفٌ كتبه المالك بيده لا يحمل وسم القراءة');
  perform _eq((select soil_pct::int from lands where id = '11000000-0000-0000-0000-000000000001'), null::int, 'ولا احتمالها');
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'submitted', 'ويُعيد الأرض الموثّقة إلى المراجعة كما كان');
  perform _eq((select count(*)::int from notifications where body like '%التربة%'), 1, 'بإشعارٍ يذكر التربة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) من يحرّك الأرض تسقط عنه قراءةُ المكان القديم'
\echo '=========================================================================='
reset role;
do $$ begin perform _act_as(null); end $$;
update lands set verification = 'draft', listed = false where id = '11000000-0000-0000-0000-000000000001';
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Vertisols', 74);
  perform _eq((select soil_pct::int from lands where id = '11000000-0000-0000-0000-000000000001'), 74, 'قراءةٌ جديدة');
  update lands set latitude = 14.4000, longitude = 33.5000 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select soil_class from lands where id = '11000000-0000-0000-0000-000000000001'), null::text, 'تحريك الأرض أسقط الصنف');
  perform _eq((select soil_source from lands where id = '11000000-0000-0000-0000-000000000001'), null::text, 'ومصدره');
  perform _eq((select soil_pct::int from lands where id = '11000000-0000-0000-0000-000000000001'), null::int, 'واحتماله');

end $$;
-- a land with no reading (soil from before today) keeps its class when it moves: it was never a point reading.
reset role;
do $$ begin perform _act_as(null); end $$;
update lands set soil_class = 'Vertisols', soil_source = null, soil_pct = null where id = '11000000-0000-0000-0000-000000000001';
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  update lands set latitude = 14.5000 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select soil_class from lands where id = '11000000-0000-0000-0000-000000000001'), 'Vertisols', 'صنفٌ قديم بلا مصدر يبقى (لا يُحذف شيء)');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) إدراج أرضٍ جديدة لا يحمل مصدراً مدَّعى'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into lands (id, owner_id, name, state, feddans, station_key, water_source, soil_class, soil_source, soil_pct)
  values ('22000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'جديدة', 'الجزيرة', 5, 'gezira', 'canal', 'Vertisols', 'point', 90);
  perform _eq((select soil_source from lands where id = '22000000-0000-0000-0000-000000000002'), null::text, 'الإدراج المباشر يُسقط وسم المصدر');
  perform _eq((select soil_pct::int from lands where id = '22000000-0000-0000-0000-000000000002'), null::int, 'والاحتمال');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) قراءة المستثمر: للأراضي المعروضة وحدها'
\echo '=========================================================================='
reset role;
do $$ begin perform _act_as(null); end $$;
update lands set verification = 'verified', open_to_investors = true, investor_models = array['sharecrop']::text[]
 where id = '11000000-0000-0000-0000-000000000001';
do $$
begin
  perform set_config('sudagri.soil_estimate', '1', true);
  update lands set soil_class = 'Fluvisols', soil_source = 'point', soil_pct = 55 where id = '11000000-0000-0000-0000-000000000001';
  perform set_config('sudagri.soil_estimate', '', true);
end $$;
set role anon;
do $$
declare r record;
begin
  select * into r from land_soil_estimates(array['11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002']::uuid[]);
  perform _eq(r.soil_class, 'Fluvisols', 'الزائر يقرأ صنف أرضٍ معروضة');
  perform _eq(r.soil_pct, 55, 'واحتماله');
  perform _eq((select count(*)::int from land_soil_estimates(array['22000000-0000-0000-0000-000000000002']::uuid[])), 0, 'ولا يقرأ شيئاً عن أرضٍ غير معروضة');
  perform _refuses($q$select land_set_soil_estimate('11000000-0000-0000-0000-000000000001', 'Fluvisols', 55)$q$, 'والزائر لا يكتب');
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
