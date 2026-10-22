-- بوّابةُ المشروع على أرضٍ موثّقة (البندان ١٢٩ و١٣٠).
--
-- A project may point only at a verified land its submitter owns; a visitor
-- learns that a published project stands on a verified land and how many of
-- its documents are on file — never which land, where, or whose.

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


-- ── الناس: م صاحب الأرض، غ غريبٌ له أرضٌ أيضاً، د مدير ─────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant select, insert, update on projects to anon, authenticated;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'البقعة', 'ود البشير', 15.60, 32.50, 4, 'khartoum', 'river_pump', 'verified', 3),
       ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'أرضٌ تحت المراجعة',
        'الخرطوم', 'البقعة', 'ود البشير', 15.61, 32.51, 2, 'khartoum', 'river_pump', 'submitted', 3),
       ('11000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-0000000000c3', 'أرض الغريب',
        'سنار', 'سنجة', 'أم بنين', 13.10, 33.90, 6, 'sennar', 'river_pump', 'verified', 3);
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg');

create or replace function _project(slug text, land uuid) returns text language sql as $$
  insert into projects (slug, name, location, total_feddans, price_per_share, total_shares,
                        status, review_status, is_demo, submitted_by, land_id)
  values (slug, 'قمح الجموعية', 'الخرطوم', 4, 100, 40, 'draft', 'submitted', false, auth.uid(), land)
  returning slug $$;
grant execute on function _project(text, uuid) to authenticated;

\echo ''
\echo 'أ) المشروع يُربط بأرضٍ موثّقة يملكها رافعه — ولا غير'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(_project('own-verified', '11000000-0000-0000-0000-000000000001'), 'own-verified',
    'صاحبُ الأرض يربط مشروعه بأرضه الموثّقة');
  perform _refuses($q$select _project('own-unverified', '11000000-0000-0000-0000-000000000002')$q$,
    'ولا يربطه بأرضٍ لم تُوثَّق');
  perform _refuses($q$select _project('borrowed', '11000000-0000-0000-0000-000000000003')$q$,
    'ولا بأرضٍ موثّقةٍ لغيره');
  perform _eq(_project('no-land', null), 'no-land', 'والمشروعُ بلا أرضٍ يبقى كما كان');
end $$;
reset role;

\echo ''
\echo 'ب) الشارة للزائر: «على أرضٍ موثّقة» ومستنداتها، لا موقعها'

set role anon;
do $$ begin
  perform _eq((select count(*)::int from public_project_lands()), 0, 'المسوّدةُ لا شارة لها');
end $$;
reset role;

update projects set status = 'open', review_status = 'approved' where slug in ('own-verified', 'no-land');

set role anon;
do $$ begin
  perform _eq((select count(*)::int from public_project_lands()), 1, 'وبعد النشر: المشروعُ الذي على أرضٍ موثّقة وحده');
  perform _eq((select documents_on_file from public_project_lands()), 3, 'ومستنداتُ أرضه كما هي ملفّاتٌ لا علامات');
end $$;
reset role;

do $$ begin
  perform _eq(pg_get_function_result('public.public_project_lands()'::regprocedure) ~* '(village|latitude|longitude|owner|land_id|name)',
    false, 'والشارةُ لا تُرجع قريةً ولا إحداثيّاتٍ ولا صاحباً ولا الأرض نفسها');
end $$;

-- The listing guard lets only an administrator take verification back.
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
update lands set verification = 'rejected', listed = false where id = '11000000-0000-0000-0000-000000000001';
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from public_project_lands()), 0, 'وإن رُدّ توثيقُ الأرض سقطت الشارة');
end $$;
reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — المشروعُ يعرف أرضه، والزائرُ يرى الشارة لا الموقع';
end $$;
