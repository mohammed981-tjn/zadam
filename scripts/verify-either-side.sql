-- حسابٌ واحد يعرض أرضه ويستثمر (البند ١٥١).
--
-- The owner, 24 October: «المستثمر الذي يملك أرضاً لا يستطيع عرض أرضه لأنّه
-- داخلٌ بحساب مستثمر، والمزارع الذي يريد أن يستثمر لا يستطيع لأنّه داخلٌ
-- بحساب مزارع». The database never asked which kind an account is: lands are
-- owned by `auth.uid()`, interest is asked by `auth.uid()`, and `role` is
-- compared only with 'admin'. This gate keeps it so — an «investor» registers
-- and offers land, a «farmer» asks for a partnership and is accepted — so the
-- wall the owner met stays where it was: in the screens, which say «you are an
-- investor» and send each kind to a different home.
-- بوّابةُ عقد الشراكة (البندان ١٢٤ و١٢٧).
--
-- The land row is closed to everyone but its owner and the administrators; the
-- investor listing carries no village, coordinates, land name or owner. The
-- agreement opens only after the owner accepts, only for the two parties; a
-- signature counts for one version and one hash; a save after a signature
-- starts a new version and the old signature stays on record; two signatures
-- seal it with a reference and nothing changes after.

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



-- ── الناس: «مستثمر» يملك أرضاً، و«مزارع» يريد أن يستثمر ──────────────────────
insert into auth.users (id) values
  ('e1000000-0000-0000-0000-0000000000e1'),
  ('e2000000-0000-0000-0000-0000000000e2')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('e1000000-0000-0000-0000-0000000000e1', 'مستثمرٌ يملك أرضاً', 'investor', '0911000001'),
  ('e2000000-0000-0000-0000-0000000000e2', 'مزارعٌ يريد أن يستثمر', 'farmer', '0911000002')
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant select, insert, update, delete on lands, profiles to anon, authenticated;

\echo ''
\echo 'أ) حسابٌ نوعُه «مستثمر» يسجّل أرضه، ويعرضها على المستثمرين بعد توثيقها'

set role authenticated;
do $$ begin
  perform _act_as('e1000000-0000-0000-0000-0000000000e1');
  insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                     station_key, water_source, documents_required)
  values ('e1a00000-0000-0000-0000-00000000e1a0', 'e1000000-0000-0000-0000-0000000000e1', 'أرض المستثمر',
          'الجزيرة', 'الحصاحيصا', 'ود الحدّاد', 14.70, 33.30, 25, 'wad_medani', 'canal', 3);
  perform _eq((select count(*)::int from lands where owner_id = 'e1000000-0000-0000-0000-0000000000e1'), 1,
    'حسابُ «المستثمر» سجّل أرضه');
end $$;
reset role;

-- التوثيق بيد الإدارة: ثلاثة مستندات، ثمّ موثّقة.
do $$ begin perform _act_as(null); end $$;
insert into land_documents (land_id, kind, storage_path) values
  ('e1a00000-0000-0000-0000-00000000e1a0', 'tenure', 'e1/tenure.jpg'),
  ('e1a00000-0000-0000-0000-00000000e1a0', 'photo',  'e1/photo.jpg'),
  ('e1a00000-0000-0000-0000-00000000e1a0', 'permit', 'e1/permit.jpg');
update lands set verification = 'verified', listed = true where id = 'e1a00000-0000-0000-0000-00000000e1a0';

set role authenticated;
do $$ begin
  perform _act_as('e1000000-0000-0000-0000-0000000000e1');
  perform land_set_investor_consent('e1a00000-0000-0000-0000-00000000e1a0', true, array['sharecrop','lease'],
    'أرضٌ على الترعة، أبحث عن ممّولٍ للموسم', null);
  perform _eq((select open_to_investors from lands where id = 'e1a00000-0000-0000-0000-00000000e1a0'), true,
    'وعرضها على المستثمرين');
end $$;
reset role;

\echo ''
\echo 'ب) حسابٌ نوعُه «مزارع» يطلب الشراكة فيها، ويقبله صاحبها'

set role authenticated;
do $$
declare v uuid;
begin
  perform _act_as('e2000000-0000-0000-0000-0000000000e2');
  perform _eq((select count(*)::int from investor_open_lands() where land_id = 'e1a00000-0000-0000-0000-00000000e1a0'), 1,
    'حسابُ «المزارع» يرى الأرض في فرص الاستثمار');
  -- The owner, 25 October 2026: the exact area and the locality are the owner's; others see the state and the band.
  perform _eq((select feddans from investor_open_lands() where land_id = 'e1a00000-0000-0000-0000-00000000e1a0'), null::numeric,
    'لا يرى المساحة الدقيقة');
  perform _eq((select locality from investor_open_lands() where land_id = 'e1a00000-0000-0000-0000-00000000e1a0'), null::text,
    'ولا المحليّة');
  perform _eq((select area_band is not null from investor_open_lands() where land_id = 'e1a00000-0000-0000-0000-00000000e1a0'), true,
    'ويرى فئة المساحة');
  v := investor_express_interest('e1a00000-0000-0000-0000-00000000e1a0', 'sharecrop',
    'أنا مزارعٌ من الجزيرة وعندي مالٌ للموسم، وأريد المشاركة بالمحصول');
  perform _eq(v is not null, true, 'وطلب الشراكة');
  perform _act_as('e1000000-0000-0000-0000-0000000000e1');
  perform _eq((select feddans is not null from investor_open_lands() where land_id = 'e1a00000-0000-0000-0000-00000000e1a0'), true,
    'وصاحب الأرض يرى مساحتها في القائمة');
  perform land_investor_decide(v, true);
  perform _eq((select status::text from investor_interests where id = v), 'accepted',
    'وقبله صاحبُ الأرض — نوعُ الحساب لم يمنع أحداً منهما');
end $$;
reset role;

do $$ declare f int; begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الحسابُ الواحد يعرض أرضه ويستثمر';
end $$;
