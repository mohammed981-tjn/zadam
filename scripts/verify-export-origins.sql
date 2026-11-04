-- بوّابةُ مكان المزرعة: صاحب العرض والمدير يقرآن الإحداثيّات والحدود، وغيرُهما يقرأ الأعمدة العامّة وحدها.
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
  ('a1000000-0000-0000-0000-0000000000a1', 'صاحب العرض', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'مسجَّلٌ آخر', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _score to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ما في الإنتاج للزائر منذ 20261022050000 (يُفحص كاملاً في verify-visitor-columns): الأعمدة العامّة وحدها.
revoke select on table public.export_offer_origins from anon;
grant select (id, offer_id, plot_ref, area_hectares) on table public.export_offer_origins to anon;

-- عرضٌ منشور وقطعتان: نقطةٌ، ومضلَّع.
do $$
declare c uuid; o uuid;
begin
  perform _act_as(null);
  select cr.id into c from export_corridors cr
    join export_commodities co on co.id = cr.commodity_id
    join export_destinations d on d.id = cr.destination_id
   where co.code = 'gum_arabic' and d.code = 'EU';
  insert into export_offers (reference, owner_id, corridor_id, quantity, uom_code, unit_price_minor, value_minor)
  values ('EXP-PRIV', 'a1000000-0000-0000-0000-0000000000a1', c, 5, 'ton', 100000, 500000) returning id into o;
  insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude)
  values (o, 'KRD-1', 2.5, 13.183333, 30.216667);
  insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude, boundary)
  values (o, 'KRD-2', 9.1, 13.2, 30.2, '{"type":"Polygon"}'::jsonb);
  -- the review is the administration's: the publishing trigger stamps who reviewed
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  update export_offers set status = 'submitted' where id = o;
  update export_offers set status = 'published' where id = o;
  perform _act_as(null);
end $$;

\echo ''
\echo '=========================================================================='
\echo 'أ) عرضٌ منشور: مسجَّلٌ آخر يقرأ القطعتين لا مكانهما'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from export_offer_origins), 2, 'يرى قطعتين (العرض منشور)');
  perform _eq((select count(*)::int from (select plot_ref, area_hectares from export_offer_origins) x), 2,
    'ويقرأ اسمَ القطعة ومساحتَها');
  perform _refuses($q$select latitude from export_offer_origins$q$, 'ولا يقرأ خطَّ العرض');
  perform _refuses($q$select longitude from export_offer_origins$q$, 'ولا خطَّ الطول');
  perform _refuses($q$select boundary from export_offer_origins$q$, 'ولا حدودَ المزرعة');
  perform _refuses($q$select * from export_offer_origins$q$, 'و«كلَّ الأعمدة» تُرفض');
  perform _eq((select count(*)::int from export_offer_origins_detail(array[(select id from export_offers where reference = 'EXP-PRIV')])), 0,
    'والدالّةُ لا تعطيه شيئاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) صاحب العرض والمدير يقرآن المكان'
\echo '=========================================================================='
do $$
declare o uuid := (select id from export_offers where reference = 'EXP-PRIV');
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from export_offer_origins_detail(array[o])), 2, 'صاحب العرض يقرأ قطعتيه');
  perform _eq((select latitude::text from export_offer_origins_detail(array[o]) where plot_ref = 'KRD-1'), '13.183333', 'وإحداثيّتهما');
  perform _eq((select boundary is not null from export_offer_origins_detail(array[o]) where plot_ref = 'KRD-2'), true, 'وحدودَ المضلَّع');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from export_offer_origins_detail(array[o])), 2, 'والمدير يقرأ القطعتين');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الكتابة لم تُمسّ، والزائر والدالّة'
\echo '=========================================================================='
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
end $$;
reset role;
-- an owner's draft offer still takes its origin as before
do $$
declare c uuid; o uuid;
begin
  perform _act_as(null);
  select cr.id into c from export_corridors cr
    join export_commodities co on co.id = cr.commodity_id
    join export_destinations d on d.id = cr.destination_id
   where co.code = 'gum_arabic' and d.code = 'EU';
  insert into export_offers (reference, owner_id, corridor_id, quantity, uom_code, unit_price_minor, value_minor)
  values ('EXP-DRAFT', 'a1000000-0000-0000-0000-0000000000a1', c, 1, 'ton', 100, 100) returning id into o;
  insert into _ids values ('draft', o);
exception when undefined_table then
  create table _ids (k text primary key, id uuid);
  grant all on _ids to anon, authenticated;
  insert into _ids values ('draft', o);
end $$;
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude)
  select id, 'KRD-NEW', 1.0, 13.0, 30.0 from export_offers where reference = 'EXP-DRAFT';
  perform _pass('وصاحب العرض يكتب قطعةً جديدةً كما كان (INSERT لم يُمسّ)');
exception when others then
  perform _fail('وصاحب العرض يكتب قطعةً جديدةً كما كان', sqlerrm);
end $$;
set role anon;
do $$
begin
  perform _refuses($q$select * from export_offer_origins_detail(array[gen_random_uuid()])$q$, 'والزائر لا يستدعي الدالّة');
  perform _refuses($q$select latitude from export_offer_origins$q$, 'ولا يقرأ الإحداثيّات');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) محطّات الشحنة وصور الأدلّة: الإحداثيّات ومسار الملفّ لصاحب العرض وللمدير (مراجعة ١٩٨)'
\echo '=========================================================================='
reset role;
revoke select on table public.export_offer_custody, public.export_offer_evidence from anon;
grant select (id, offer_id, sequence, occurred_at, place_name, note, created_at) on table public.export_offer_custody to anon;
grant select (id, offer_id, kind, captured_at, sha256, created_at, document_type_id) on table public.export_offer_evidence to anon;
do $$
declare o uuid := (select id from export_offers where reference = 'EXP-PRIV');
begin
  insert into export_offer_custody (offer_id, sequence, occurred_at, place_name, latitude, longitude)
  values (o, 1, now(), 'المزرعة', 13.183333, 30.216667), (o, 2, now(), 'مخزن الأبيض', 13.18, 30.22);
  insert into export_offer_evidence (offer_id, kind, captured_at, latitude, longitude, storage_path)
  values (o, 'photo', now(), 13.183333, 30.216667, 'a1000000-0000-0000-0000-0000000000a1/field.jpg');
end $$;
set role authenticated;
do $$
declare o uuid := (select id from export_offers where reference = 'EXP-PRIV');
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from (select place_name from export_offer_custody) x), 2, 'المسجَّل الآخر يرى أسماء المحطّات');
  perform _refuses($q$select latitude from export_offer_custody$q$, 'ولا يقرأ إحداثيّات المحطّات');
  perform _refuses($q$select latitude from export_offer_evidence$q$, 'ولا إحداثيّات صور الأدلّة');
  perform _refuses($q$select storage_path from export_offer_evidence$q$, 'ولا مسار ملفّ الدليل');
  perform _eq((select count(*)::int from export_offer_custody_detail(o)), 0, 'والدالّة لا تعطيه المحطّات');
  perform _eq((select count(*)::int from export_offer_evidence_detail(o)), 0, 'ولا الأدلّة');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select latitude::text from export_offer_custody_detail(o) where sequence = 1), '13.183333', 'صاحب العرض يقرأ إحداثيّة محطّته');
  perform _eq((select storage_path from export_offer_evidence_detail(o)), 'a1000000-0000-0000-0000-0000000000a1/field.jpg', 'ومسار دليله');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from export_offer_custody_detail(o)), 2, 'والمدير يقرأ المحطّتين');
  perform _eq((select count(*)::int from export_offer_evidence_detail(o)), 1, 'والدليل');
end $$;
reset role;
set role anon;
do $$ begin
  perform _refuses($q$select latitude from export_offer_custody$q$, 'والزائر لا يقرأ شيئاً من الإحداثيّات');
  perform _refuses($q$select storage_path from export_offer_evidence$q$, 'ولا المسار');
  perform _refuses($q$select * from export_offer_custody_detail((select id from export_offers limit 1))$q$, 'ولا يستدعي الدالّة');
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
