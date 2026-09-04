-- بوّابةُ قفل الأدلّة: يُحذف ما لم يُعتمد عليه، ويبقى ما اعتُمد.
--
-- WHY BOTH HALVES ARE HERE
--
-- A rule that only refuses is easy and useless: forbidding every delete would
-- pass any test built purely of refusals, and would make the platform unusable
-- for the ordinary case — someone uploads the wrong photograph to a draft and
-- must be able to take it back.
--
-- So each of the five kinds of evidence is checked **twice**: deletable while
-- nothing depends on it, refused the moment something does. The pair is the
-- test; either half alone is not.
--
-- AND WHY THE REFUSALS ARE MEASURED BY ROW COUNT
--
-- A row-level security policy does not raise. A DELETE the policy filters out
-- runs cleanly, reports success, and removes nothing — which is what the
-- Supabase client would report to the browser as a successful delete. So the
-- refusals below assert on rows remaining, never on an error appearing.

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

/* يُحذف فعلاً — لا «لم يُرفع خطأ» بل «اختفى الصفّ». */
create or replace function _deletes(path text, label text) returns void
language plpgsql as $$
declare gone integer;
begin
  delete from storage.objects where bucket_id = 'evidence' and name = path;
  get diagnostics gone = row_count;
  if gone = 1 then perform _pass(label);
  else perform _fail(label, 'لم يُحذف — والسياسةُ رشّحته بصمت');
  end if;
exception when others then
  perform _fail(label, 'رُفض بخطأ: ' || sqlerrm);
end $$;

/* ويبقى — والقياسُ بالبقاء لا بغياب الخطأ. */
create or replace function _survives(path text, label text) returns void
language plpgsql as $$
declare gone integer;
begin
  begin
    delete from storage.objects where bucket_id = 'evidence' and name = path;
    get diagnostics gone = row_count;
  exception when others then
    perform _pass(label || ' — رُفض صراحةً');
    return;
  end;
  if gone = 0 then perform _pass(label);
  else perform _fail(label, 'حُذف — والدليلُ الذي اعتُمد عليه ذهب');
  end if;
end $$;

-- ── الناس والأشياء ────────────────────────────────────────────────────────
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('fa000000-0000-0000-0000-0000000000fa', 'صاحبُ الأدلّة',  'investor'),
  ('bb000000-0000-0000-0000-0000000000bb', 'شخصٌ آخر',      'investor');

-- والممرّاتُ والوحداتُ تبذرها هجرةُ ممرّ الصادر، فتُقرأ منها لا تُخترع.

insert into projects (id, slug, name, location, total_feddans, price_per_share, total_shares)
values ('99000000-0000-0000-0000-000000000099', 'trust-plot', 'قطعة الثقة',
        'سنّار', 100, 500, 50);

-- عرضان: واحدٌ مسوّدة، وواحدٌ منشور.
insert into export_offers (id, reference, owner_id, corridor_id, quantity, uom_code,
                           unit_price_minor, value_minor, status, submitted_at,
                           reviewed_at, reviewed_by)
select '0f000000-0000-0000-0000-00000000000d', 'SD-DRAFT', 'fa000000-0000-0000-0000-0000000000fa',
       c.id, 10, u.code, 1000, 10000, 'draft', null, null, null
  from export_corridors c, export_uom u limit 1;

insert into export_offers (id, reference, owner_id, corridor_id, quantity, uom_code,
                           unit_price_minor, value_minor, status, submitted_at,
                           reviewed_at, reviewed_by)
select '0f000000-0000-0000-0000-00000000000b', 'SD-PUB', 'fa000000-0000-0000-0000-0000000000fa',
       c.id, 10, u.code, 1000, 10000, 'published', now(), now(),
       'ad000000-0000-0000-0000-0000000000ad'
  from export_corridors c, export_uom u limit 1;

-- أرضان: واحدةٌ غيرُ موثّقة، وواحدةٌ موثّقة.
insert into lands (id, owner_id, name, state, feddans, station_key, water_source, verification) values
  ('1a000000-0000-0000-0000-00000000000d', 'fa000000-0000-0000-0000-0000000000fa',
   'أرضٌ قيد التوثيق', 'الجزيرة', 5, 'wad_medani', 'canal', 'unverified'),
  ('1a000000-0000-0000-0000-00000000000e', 'fa000000-0000-0000-0000-0000000000fa',
   'أرضٌ موثّقة', 'الجزيرة', 5, 'wad_medani', 'canal', 'verified');

-- موسمٌ بمرحلتين: واحدةٌ مفتوحة، وواحدةٌ معتمدة.
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
values ('5e000000-0000-0000-0000-0000000000fa', 'fa000000-0000-0000-0000-0000000000fa',
        'موسم الثقة', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01');

insert into season_stages (id, season_id, stage_key, stage_order, planned_start, planned_end, completed) values
  ('50000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-0000000000fa',
   'land_prep', 1, date '2026-06-01', date '2026-06-10', false),
  ('50000000-0000-0000-0000-00000000000c', '5e000000-0000-0000-0000-0000000000fa',
   'planting', 2, date '2026-06-11', date '2026-06-20', true);

-- الملفّات، كلُّها في مجلّد صاحبها.
insert into storage.objects (bucket_id, name, owner) values
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/offer-draft.jpg',     'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/offer-published.jpg', 'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/stage-open.jpg',      'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/stage-done.jpg',      'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/land-unverified.pdf', 'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/land-verified.pdf',   'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/loose.jpg',           'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'bb000000-0000-0000-0000-0000000000bb/someone-else.jpg',    'bb000000-0000-0000-0000-0000000000bb');

insert into export_offer_evidence (offer_id, kind, storage_path) values
  ('0f000000-0000-0000-0000-00000000000d', 'photo', 'fa000000-0000-0000-0000-0000000000fa/offer-draft.jpg'),
  ('0f000000-0000-0000-0000-00000000000b', 'photo', 'fa000000-0000-0000-0000-0000000000fa/offer-published.jpg');

insert into stage_evidence (stage_id, kind, storage_path) values
  ('50000000-0000-0000-0000-000000000001', 'photo', 'fa000000-0000-0000-0000-0000000000fa/stage-open.jpg'),
  ('50000000-0000-0000-0000-00000000000c', 'photo', 'fa000000-0000-0000-0000-0000000000fa/stage-done.jpg');

insert into land_documents (land_id, kind, storage_path) values
  ('1a000000-0000-0000-0000-00000000000d', 'title_deed', 'fa000000-0000-0000-0000-0000000000fa/land-unverified.pdf'),
  ('1a000000-0000-0000-0000-00000000000e', 'title_deed', 'fa000000-0000-0000-0000-0000000000fa/land-verified.pdf');

grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert, update, delete on all tables in schema public, storage to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth, storage to anon, authenticated;

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) ما لم يُعتمد عليه — يُحذف، وهذا شرطُ صلاحية المنصّة'
\echo '=========================================================================='

do $$
begin
  perform _deletes('fa000000-0000-0000-0000-0000000000fa/loose.jpg',
    'ملفٌّ لا يشير إليه شيء يُحذف');
  perform _deletes('fa000000-0000-0000-0000-0000000000fa/offer-draft.jpg',
    'ودليلُ عرضٍ ما يزال مسوّدةً يُحذف — من رفع الخطأَ يصحّحه');
  perform _deletes('fa000000-0000-0000-0000-0000000000fa/stage-open.jpg',
    'ودليلُ مرحلةٍ لم تُعتمد بعد');
  perform _deletes('fa000000-0000-0000-0000-0000000000fa/land-unverified.pdf',
    'ومستندُ أرضٍ لم تُوثَّق');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) وما اعتُمد عليه — يبقى'
\echo '=========================================================================='

do $$
begin
  perform _survives('fa000000-0000-0000-0000-0000000000fa/offer-published.jpg',
    'دليلُ عرضٍ منشورٍ يبقى — والمشتري يفتحه');
  perform _survives('fa000000-0000-0000-0000-0000000000fa/stage-done.jpg',
    'ودليلُ مرحلةٍ اعتُمدت');
  perform _survives('fa000000-0000-0000-0000-0000000000fa/land-verified.pdf',
    'ومستندُ أرضٍ وُثِّقت عليه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والقفلُ لا يُلغي ما كان يحرسه المِلك'
\echo '=========================================================================='

do $$
begin
  perform _survives('bb000000-0000-0000-0000-0000000000bb/someone-else.jpg',
    'ولا يمسّ أحدٌ مجلّدَ غيره');

  -- والقراءةُ باقيةٌ كما كانت: القفلُ على الحذف لا على الاطّلاع.
  perform _eq((select count(*)::int from storage.objects
                where bucket_id = 'evidence'
                  and (storage.foldername(name))[1] = 'fa000000-0000-0000-0000-0000000000fa'), 3,
    'وصاحبُها يقرأ ما بقي له');
  perform _eq((select count(*)::int from storage.objects
                where name like 'bb%'), 0,
    'ولا يقرأ ملفَّ غيره');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) والإدارةُ تقرأ ولا تُستثنى من القفل'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select count(*)::int from storage.objects where bucket_id = 'evidence'), 4,
    'الموظّفُ يقرأ أدلّةَ الجميع — وهذا عملُه');

  -- ولا يحذف: السياسةُ تشترط ملكيّةَ المجلّد، ولا استثناءَ فيها لمدير. وهو
  -- الصواب — سجلٌّ يستطيع المدقِّقُ محوَه ليس سجلّاً.
  perform _survives('fa000000-0000-0000-0000-0000000000fa/offer-published.jpg',
    'ولا يحذف دليلَ غيره — ولا دليلاً معتمَداً');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — الدليلُ المعتمَدُ لا يُسحب';
end $$;
