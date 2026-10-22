-- بوّابةُ الموسم من العقد (البند ١٢٩، الخطوة الثانية).
--
-- A season links only to its owner's land and project; it starts from a
-- partnership agreement only once both have signed, only by the landowner, and
-- only on the agreement's land. The agreement's investor then reads the season,
-- its stages, evidence, ledger and photos — and writes none of them.

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

create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then perform _pass(label || ' — رُفض صراحةً'); return;
  end;
  if touched = 0 then perform _pass(label);
  else perform _fail(label, 'مسّ ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;


-- ── الناس: م صاحب الأرض، س المستثمرة، غ غريب، د مدير ──────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor', '0911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'سلمى أحمد علي', 'investor', '0922222222'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
grant select, insert, update, delete on lands, profiles, projects, seasons, season_stages, stage_evidence, ledger_entries to anon, authenticated;
grant usage on schema storage to authenticated;
grant select on storage.objects to authenticated;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'البقعة', 'ود البشير', 15.60, 32.50, 4, 'khartoum', 'river_pump', 'verified', 3,
        true, array['sharecrop','lease']),
       ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'أرضٌ ثانية',
        'الخرطوم', 'البقعة', 'ود البشير', 15.61, 32.51, 2, 'khartoum', 'river_pump', 'submitted', 3, false, '{}'),
       ('11000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-0000000000c3', 'أرض الغريب',
        'سنار', 'سنجة', 'أم بنين', 13.10, 33.90, 6, 'sennar', 'river_pump', 'submitted', 3, false, '{}');
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg');
update lands set listed = true where id = '11000000-0000-0000-0000-000000000001';
insert into projects (id, slug, name, location, total_feddans, price_per_share, total_shares, status, review_status, submitted_by)
values ('33000000-0000-0000-0000-000000000001', 'stranger-project', 'مشروع الغريب', 'سنار', 6, 100, 60, 'open', 'approved',
        'c3000000-0000-0000-0000-0000000000c3'),
       ('33000000-0000-0000-0000-000000000002', 'own-project', 'مشروع عثمان', 'الخرطوم', 4, 100, 40, 'open', 'approved',
        'a1000000-0000-0000-0000-0000000000a1');

create or replace function _season(p_land uuid, p_project uuid, p_partnership uuid) returns uuid language sql as $$
  insert into seasons (owner_id, name, crop_key, station_key, irrigation, feddans, planting_date, land_id, project_id, partnership_id)
  values (auth.uid(), 'قمح شتوي', 'wheat', 'khartoum', 'flood', 4, date '2026-11-15', p_land, p_project, p_partnership)
  returning id $$;
grant execute on function _season(uuid, uuid, uuid) to authenticated;

\echo ''
\echo 'أ) روابط الموسم: أرضُ صاحبه ومشروعُه، لا غيرهما'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(_season('11000000-0000-0000-0000-000000000002', null, null) is not null, true, 'الموسمُ على أرض صاحبه');
  perform _refuses($q$select _season('11000000-0000-0000-0000-000000000003', null, null)$q$, 'ولا على أرض غيره');
  perform _refuses($q$select _season(null, '33000000-0000-0000-0000-000000000001', null)$q$, 'ولا يُربط بمشروع غيره');
  perform _eq(_season(null, '33000000-0000-0000-0000-000000000002', null) is not null, true, 'ويُربط بمشروعه هو');
end $$;
reset role;

\echo ''
\echo 'ب) من العقد الموقَّع وحده، وصاحبُ الأرض يبدؤه'

set role authenticated;
do $$
declare v jsonb;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('interest',
    investor_express_interest('11000000-0000-0000-0000-000000000001', 'sharecrop', 'أنا مستثمرة من الخرطوم وأريد تمويل الموسم الشتوي'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('interest'), true);
  insert into _ids values ('agreement', partnership_agreement_open(_id('interest')));
  perform partnership_agreement_save(_id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land","water","labour"],"investor_provides":["seed","fertiliser","fuel"],"owner_share":60,"investor_share":40,"loss_rule":"by_contribution"}'::jsonb);
  perform _refuses($q$select _season(null, null, _id('agreement'))$q$, 'لا موسمَ من عقدٍ لم يوقَّع');

  v := partnership_agreement_view(_id('agreement'));
  perform partnership_agreement_sign(_id('agreement'), (v->>'version')::int, v->>'terms_hash',
                                     'الحاج عثمان محمد', 'M 10 10 L 40 60 L 80 20 L 120 70', 'test');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform partnership_agreement_sign(_id('agreement'), (v->>'version')::int, v->>'terms_hash',
                                     'سلمى أحمد علي', 'M 5 50 L 60 10 L 90 80 L 140 30', 'test');
  perform _refuses($q$select _season(null, null, _id('agreement'))$q$, 'والمستثمرةُ لا تبدأ الموسم بنفسها');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select _season('11000000-0000-0000-0000-000000000002', null, _id('agreement'))$q$,
    'ولا يكون الموسم على أرضٍ غير أرض العقد');
  insert into _ids values ('season', _season(null, null, _id('agreement')));
  perform _eq((select land_id from seasons where id = _id('season')), '11000000-0000-0000-0000-000000000001'::uuid,
    'صاحبُ الأرض يبدأ الموسم من العقد، وأرضُه تُملأ من العقد');
end $$;
reset role;

set role authenticated;
do $$
declare st uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into season_stages (season_id, stage_key, stage_order, planned_start, planned_end)
  values (_id('season'), 'land_prep', 1, date '2026-11-01', date '2026-11-14') returning id into st;
  insert into _ids values ('stage', st);
  insert into stage_evidence (stage_id, kind, storage_path, created_by)
  values (st, 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/1.jpg', auth.uid());
  insert into ledger_entries (season_id, stage_id, category, amount, description)
  values (_id('season'), st, 'seeds', 120000, 'تقاوي القمح');
end $$;
reset role;

insert into storage.objects (bucket_id, name) values
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/stages/1.jpg'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/private.jpg');

\echo ''
\echo 'ج) المستثمرة تقرأ موسم عقدها — ولا تكتب فيه'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from seasons), 1, 'المستثمرةُ ترى موسم عقدها وحده');
  perform _eq((select count(*)::int from season_stages), 1, 'ومراحلَه');
  perform _eq((select count(*)::int from stage_evidence), 1, 'وأدلّتَه');
  perform _eq((select count(*)::int from ledger_entries), 1, 'ودفترَه');
  perform _eq((select count(*)::int from storage.objects where name like '%/stages/%'), 1, 'وتفتح صورة المرحلة');
  perform _eq((select count(*)::int from storage.objects where name like '%/private.jpg'), 0, 'ولا تفتح غيرها من ملفّاته');
  perform _changes_nothing($q$update seasons set name = 'غيّرته المستثمرة'$q$, 'ولا تعدّل الموسم');
  perform _changes_nothing($q$update season_stages set completed = true$q$, 'ولا تُتمّ مرحلة');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount) values (_id('season'), 'seed', 1)$q$,
    'ولا تكتب في الدفتر');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from seasons where partnership_id is not null), 0, 'والغريبُ لا يرى الموسم');
  perform _eq((select count(*)::int from stage_evidence), 0, 'ولا أدلّتَه');
  perform _eq((select count(*)::int from storage.objects), 0, 'ولا صوره');
end $$;
reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الموسمُ يبدأ من العقد الموقَّع، والمستثمرُ يراه ولا يكتب فيه';
end $$;
