-- بوّابةُ الكتابة المباشرة: كلُّ التفافٍ يُرفض، وكلُّ طريقٍ عاديّ يبقى يعمل.
--
-- Each bypass is attempted as the owner would from a browser (role authenticated, a
-- real uid), and each is paired with the ordinary write the app makes, because a
-- rule that only refuses passes any test made of refusals and breaks the platform.

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

/* يُرفض بالزناد لا بالصلاحيّة: رفضٌ بسببٍ آخر لا يُحتسب. */
create or replace function _refuses(q text, label text, via_rls boolean default false) returns void
language plpgsql as $$
begin
  execute q;
  perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if (sqlerrm ~* 'permission denied' or (not via_rls and sqlerrm ~* 'row-level security')) then
    perform _fail(label, 'رُفض بالصلاحيّة لا بالزناد: ' || sqlerrm);
  else
    perform _pass(label || ' — ' || left(sqlerrm, 70));
  end if;
end $$;

/* ويعمل الطريق العاديّ، ويُغيّر صفّاً فعلاً حين يُراد ذلك. */
create or replace function _works(q text, label text, want_rows integer default null) returns void
language plpgsql as $$
declare n integer;
begin
  execute q;
  get diagnostics n = row_count;
  if want_rows is not null and n <> want_rows then
    perform _fail(label, 'غيّر ' || n || ' صفّاً والمتوقَّع ' || want_rows);
  else
    perform _pass(label);
  end if;
exception when others then
  perform _fail(label, 'رُفض والمفروض أن يعمل: ' || sqlerrm);
end $$;

-- ── الناس والأشياء ────────────────────────────────────────────────────────
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('fa000000-0000-0000-0000-0000000000fa', 'صاحبُ الأرض',   'investor'),
  ('bb000000-0000-0000-0000-0000000000bb', 'شخصٌ آخر',     'investor');

insert into lands (id, owner_id, name, state, feddans, station_key, water_source, verification) values
  ('1a000000-0000-0000-0000-00000000000d', 'fa000000-0000-0000-0000-0000000000fa',
   'أرضٌ قيد التوثيق', 'الجزيرة', 5, 'wad_medani', 'canal', 'unverified'),
  ('1a000000-0000-0000-0000-00000000000e', 'fa000000-0000-0000-0000-0000000000fa',
   'أرضٌ موثّقة', 'الجزيرة', 5, 'wad_medani', 'canal', 'verified');

-- مواسم: S1 جارٍ بثلاث مراحل (الأولى معتمدة بدليل)، S2 جارٍ فيه مرحلةٌ مفتوحةٌ قبل معتمدة،
-- S3 مُقفل، S4 مُقفل من عقد شراكة، S5 فارغ.
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date, status, partnership_id, harvest_kg) values
  ('5e000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-0000000000fa', 'S1', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'active',    null, null),
  ('5e000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-0000000000fa', 'S2', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'active',    null, null),
  ('5e000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-0000000000fa', 'S3', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'completed', null, 1200),
  ('5e000000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-0000000000fa', 'S4', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'active',    'a9000000-0000-0000-0000-0000000000a9', null),
  ('5e000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-0000000000fa', 'S5', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'active',    null, null),
  ('5e000000-0000-0000-0000-000000000006', 'fa000000-0000-0000-0000-0000000000fa', 'S6', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01', 'active',    null, null);

insert into storage.objects (bucket_id, name, owner) values
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/s1-done.jpg',  'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/s1-open.jpg',  'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/s2-done.jpg',  'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/land-a.pdf',   'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/land-v.pdf',   'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'fa000000-0000-0000-0000-0000000000fa/land-new.pdf', 'fa000000-0000-0000-0000-0000000000fa'),
  ('evidence', 'bb000000-0000-0000-0000-0000000000bb/theirs.jpg',   'bb000000-0000-0000-0000-0000000000bb');

insert into season_stages (id, season_id, stage_key, stage_order, planned_start, planned_end, completed, completed_at) values
  ('51000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'land_prep',     1, date '2026-06-01', date '2026-06-10', true,  now()),
  ('51000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000001', 'planting',      2, date '2026-06-11', date '2026-06-20', false, null),
  ('51000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000001', 'establishment', 3, date '2026-06-21', date '2026-06-30', false, null),
  ('52000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'land_prep',     1, date '2026-06-01', date '2026-06-10', false, null),
  ('52000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000002', 'planting',      2, date '2026-06-11', date '2026-06-20', true,  now());

insert into stage_evidence (id, stage_id, kind, storage_path, created_by) values
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'photo', 'fa000000-0000-0000-0000-0000000000fa/s1-done.jpg', 'fa000000-0000-0000-0000-0000000000fa'),
  ('e1000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', 'photo', 'fa000000-0000-0000-0000-0000000000fa/s2-done.jpg', 'fa000000-0000-0000-0000-0000000000fa');

insert into ledger_entries (id, season_id, category, amount, description) values
  ('1e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'seeds', 100, 'بذور'),
  ('1e000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003', 'seeds', 100, 'بذور موسمٍ مقفل'),
  ('1e000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000004', 'seeds', 100, 'بذور موسم الشراكة');

insert into land_documents (id, land_id, kind, storage_path) values
  ('d0000000-0000-0000-0000-00000000000a', '1a000000-0000-0000-0000-00000000000d', 'title_deed', 'fa000000-0000-0000-0000-0000000000fa/land-a.pdf'),
  ('d0000000-0000-0000-0000-00000000000b', '1a000000-0000-0000-0000-00000000000e', 'title_deed', 'fa000000-0000-0000-0000-0000000000fa/land-v.pdf');

-- عقدٌ ومرحلةٌ معتمدة، ودليلٌ لها وللعهدة: تُدرج بلا مفاتيح أجنبيّة كي لا تُبنى سلسلةٌ كاملة.
insert into auth.users (id) values
  ('fa000000-0000-0000-0000-0000000000fa'), ('bb000000-0000-0000-0000-0000000000bb'),
  ('ad000000-0000-0000-0000-0000000000ad') on conflict do nothing;
insert into service_providers (id, owner_id, name, kind, verified_at, active) values
  ('b0000000-0000-0000-0000-0000000000b0', 'bb000000-0000-0000-0000-0000000000bb', 'مكتب', 'engineering_office', now(), true);
insert into service_contracts (id, season_id, provider_id, client_id, title) values
  ('cc000000-0000-0000-0000-0000000000c1', '5e000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-0000000000b0', 'fa000000-0000-0000-0000-0000000000fa', 'عقد');
insert into contract_milestones (id, contract_id, seq, title, unit, quantity, unit_price) values
  ('11000000-0000-0000-0000-000000000011', 'cc000000-0000-0000-0000-0000000000c1', 1, 'مرحلة', 'lump', 1, 100);
update contract_milestones set approved_at = now(), approved_by = 'fa000000-0000-0000-0000-0000000000fa'
 where id = '11000000-0000-0000-0000-000000000011';
insert into milestone_evidence (id, milestone_id, kind, storage_path, created_by) values
  ('ee000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000011', 'photo', 'fa000000-0000-0000-0000-0000000000fa/m.jpg', 'fa000000-0000-0000-0000-0000000000fa');
insert into mine_sites (id, owner_id, name, state, locality) values
  ('a1000000-0000-0000-0000-0000000000a1', 'fa000000-0000-0000-0000-0000000000fa', 'موقع', 'البحر الأحمر', 'العلاقي')
  on conflict do nothing;
insert into gold_lots (id, owner_id, site_id, reference, extracted_on, initial_weight_grams, initial_fineness) values
  ('a2000000-0000-0000-0000-0000000000a2', 'fa000000-0000-0000-0000-0000000000fa',
   'a1000000-0000-0000-0000-0000000000a1', 'LOT-1', date '2026-06-01', 100, 900);
insert into custody_events (id, lot_id, sequence, from_party, to_party, role, occurred_at, weight_grams, fineness) values
  ('ee000000-0000-0000-0000-0000000000ee', 'a2000000-0000-0000-0000-0000000000a2', 1, 'منقّب', 'تاجر', 'miner', date '2026-06-02', 100, 900);
insert into custody_evidence (id, event_id, kind, caption, storage_path) values
  ('cc000000-0000-0000-0000-0000000000cc', 'ee000000-0000-0000-0000-0000000000ee', 'photo', 'عهدة', 'fa000000-0000-0000-0000-0000000000fa/c.jpg');

grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert, update, delete on all tables in schema public, storage to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth, storage to anon, authenticated;

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) مراحل الموسم: لا تُدرَج معتمدة، ولا تُعاد، ولا يُغيَّر ترتيبها، ولا يُحذف ما قبل معتمدة'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$insert into season_stages (season_id, stage_key, stage_order, planned_start, planned_end, completed)
    values ('5e000000-0000-0000-0000-000000000001', 'harvest', 9, date '2026-07-01', date '2026-07-10', true)$q$,
    'لا تُدرَج مرحلةٌ معتمدةً مباشرةً (كانت تتجاوز شرط الملفّ)');
  perform _works($q$insert into season_stages (season_id, stage_key, stage_order, planned_start, planned_end)
    values ('5e000000-0000-0000-0000-000000000005', 'land_prep', 1, date '2026-07-01', date '2026-07-10')$q$,
    'وتُدرَج مفتوحةً كما يفعل التطبيق عند إنشاء الموسم', 1);

  perform _refuses($q$update season_stages set completed = false where id = '51000000-0000-0000-0000-000000000001'$q$,
    'ومرحلةٌ اعتُمدت لا تُرجَع إلى الفتح');
  perform _refuses($q$update season_stages set planned_end = date '2026-06-30' where id = '51000000-0000-0000-0000-000000000001'$q$,
    'ولا تُعدَّل مواعيدُ مرحلةٍ اعتُمدت');
  perform _works($q$update season_stages set note = 'ملاحظةٌ بعد الاعتماد' where id = '51000000-0000-0000-0000-000000000001'$q$,
    'والملاحظةُ تُكتب على المعتمدة — لا تمسّ ما اعتُمد عليه', 1);

  perform _refuses($q$update season_stages set stage_order = 0 where id = '51000000-0000-0000-0000-000000000003'$q$,
    'ولا يُغيَّر ترتيبُ المراحل (يفتح طريقاً حول «المراحل السابقة مفتوحة»)');
  perform _refuses($q$update season_stages set season_id = '5e000000-0000-0000-0000-000000000005' where id = '51000000-0000-0000-0000-000000000003'$q$,
    'ولا تُنقل مرحلةٌ إلى موسمٍ آخر');

  perform _refuses($q$update season_stages set completed = true where id = '51000000-0000-0000-0000-000000000003'$q$,
    'وتبقى بوّابةُ الاعتماد القديمة: لا اعتمادَ بلا ملفٍّ ولا قبل المرحلة المفتوحة');

  perform _refuses($q$delete from season_stages where id = '51000000-0000-0000-0000-000000000001'$q$,
    'ولا تُحذف مرحلةٌ اعتُمدت');
  perform _refuses($q$delete from season_stages where id = '52000000-0000-0000-0000-000000000001'$q$,
    'ولا تُحذف مرحلةٌ مفتوحةٌ قبل مرحلةٍ معتمدة (فيُغلق ما بعدها بلا سابق)');
  perform _works($q$delete from season_stages where id = '51000000-0000-0000-0000-000000000003'$q$,
    'وتُحذف مرحلةٌ مفتوحةٌ لا دليل لها ولا معتمدةَ بعدها', 1);
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) دليل المرحلة: في مجلّدك وموجود فعلاً، ولا يُسحب بعد الاعتماد، ولا يُعدَّل'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$insert into stage_evidence (stage_id, kind, storage_path)
    values ('51000000-0000-0000-0000-000000000002', 'photo', 'bb000000-0000-0000-0000-0000000000bb/theirs.jpg')$q$,
    'لا يُسجَّل ملفٌّ من مجلّد غيرك');
  perform _refuses($q$insert into stage_evidence (stage_id, kind, storage_path)
    values ('51000000-0000-0000-0000-000000000002', 'photo', 'fa000000-0000-0000-0000-0000000000fa/never-uploaded.jpg')$q$,
    'ولا ملفٌّ لم يُرفع قطّ (كان يكفي لاعتماد المرحلة)');
  perform _works($q$insert into stage_evidence (stage_id, kind, storage_path)
    values ('51000000-0000-0000-0000-000000000002', 'photo', 'fa000000-0000-0000-0000-0000000000fa/s1-open.jpg')$q$,
    'ويُسجَّل ملفُّك الموجود كما يفعل التطبيق', 1);

  perform _refuses($q$delete from stage_evidence where id = 'e1000000-0000-0000-0000-000000000001'$q$,
    'ولا يُحذف صفُّ دليلِ مرحلةٍ اعتُمدت (الخطوة الأولى من سحبه على خطوتين)');
  perform _refuses($q$update stage_evidence set storage_path = 'fa000000-0000-0000-0000-0000000000fa/s1-open.jpg'
     where id = 'e1000000-0000-0000-0000-000000000001'$q$,
    'ولا يُستبدل مسارُ دليلٍ اعتُمد عليه');
  perform _refuses($q$update stage_evidence set stage_id = '51000000-0000-0000-0000-000000000002'
     where id = 'e1000000-0000-0000-0000-000000000001'$q$,
    'ولا يُنقل دليلٌ إلى مرحلةٍ أخرى');
  perform _works($q$update stage_evidence set caption = 'وصفٌ جديد' where storage_path = 'fa000000-0000-0000-0000-0000000000fa/s1-open.jpg'$q$,
    'ووصفُ دليلِ مرحلةٍ مفتوحة يُعدَّل', 1);
  perform _works($q$delete from stage_evidence where storage_path = 'fa000000-0000-0000-0000-0000000000fa/s1-open.jpg'$q$,
    'ودليلُ مرحلةٍ لم تُعتمد يُسحب — من رفع الخطأ يصحّحه', 1);
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) مستندات الأرض ودليل العقد وسلسلة العهدة'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$insert into land_documents (land_id, kind, storage_path)
    values ('1a000000-0000-0000-0000-00000000000d', 'title_deed', 'bb000000-0000-0000-0000-0000000000bb/theirs.jpg')$q$,
    'لا يُسجَّل مستندٌ من مجلّد غيرك');
  perform _works($q$insert into land_documents (land_id, kind, storage_path)
    values ('1a000000-0000-0000-0000-00000000000d', 'survey', 'fa000000-0000-0000-0000-0000000000fa/land-new.pdf')$q$,
    'ويُسجَّل مستندُك الموجود', 1);
  perform _refuses($q$delete from land_documents where id = 'd0000000-0000-0000-0000-00000000000b'$q$,
    'ولا يُحذف مستندُ أرضٍ وُثِّقت');
  perform _works($q$delete from land_documents where id = 'd0000000-0000-0000-0000-00000000000a'$q$,
    'ويُحذف مستندُ أرضٍ لم تُوثَّق', 1);

  perform _refuses($q$delete from milestone_evidence where id = 'ee000000-0000-0000-0000-000000000011'$q$,
    'ولا يُحذف دليلُ مرحلةِ عقدٍ وُوفق عليها');
  perform _refuses($q$delete from custody_evidence where id = 'cc000000-0000-0000-0000-0000000000cc'$q$,
    'ولا دليلُ سلسلة العهدة — تُلحَق ولا تُعدَّل');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الدفتر والموسم'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$update ledger_entries set amount = 1 where id = '1e000000-0000-0000-0000-000000000002'$q$,
    'لا يُعدَّل قيدٌ في دفتر موسمٍ أُقفل');
  perform _refuses($q$delete from ledger_entries where id = '1e000000-0000-0000-0000-000000000002'$q$,
    'ولا يُحذف');
  perform _works($q$insert into ledger_entries (season_id, category, amount, description)
    values ('5e000000-0000-0000-0000-000000000003', 'other', 5, 'قيدٌ مصحِّح')$q$,
    'ويُلحَق قيدٌ مصحِّح — الإلحاقُ مباح', 1);
  perform _refuses($q$update ledger_entries set season_id = '5e000000-0000-0000-0000-000000000003'
     where id = '1e000000-0000-0000-0000-000000000001'$q$,
    'ولا يُنقل قيدٌ بين موسمين');
  perform _works($q$update ledger_entries set amount = 120 where id = '1e000000-0000-0000-0000-000000000001'$q$,
    'وقيدُ موسمٍ جارٍ يُصحَّح كما كان', 1);
  perform _works($q$insert into ledger_entries (season_id, category, amount)
    values ('5e000000-0000-0000-0000-000000000001', 'labour', 50)$q$,
    'ويُضاف قيدٌ جديد كما يفعل التطبيق', 1);

  perform _refuses($q$update seasons set status = 'active' where id = '5e000000-0000-0000-0000-000000000003'$q$,
    'ولا يُعاد فتحُ موسمٍ أُقفل');
  perform _refuses($q$update seasons set harvest_kg = 99999 where id = '5e000000-0000-0000-0000-000000000003'$q$,
    'ولا يُغيَّر وزنُ حصادِه');
  perform _works($q$update seasons set status = 'completed', harvest_kg = 800 where id = '5e000000-0000-0000-0000-000000000005'$q$,
    'ويُقفل موسمٌ جارٍ بوزنه كما يفعل التطبيق', 1);
  perform _refuses($q$update seasons set partnership_id = null where id = '5e000000-0000-0000-0000-000000000004'$q$,
    'ولا يُفكّ موسمٌ عن عقد الشراكة الذي بدأ منه');
  perform _refuses($q$delete from seasons where id = '5e000000-0000-0000-0000-000000000004'$q$,
    'ولا يُحذف موسمُ شراكةٍ له تاريخ');
  perform _refuses($q$delete from seasons where id = '5e000000-0000-0000-0000-000000000003'$q$,
    'ولا موسمٌ مُقفلٌ له تاريخ');
  perform _refuses($q$delete from seasons where id = '5e000000-0000-0000-0000-000000000002'$q$,
    'ولا يُحذف موسمٌ فيه مرحلةٌ معتمدة (الحذف المتتالي يمحو المراحل)');
  perform _works($q$delete from seasons where id = '5e000000-0000-0000-0000-000000000006'$q$,
    'ويُحذف موسمٌ فارغٌ جارٍ — وهذا ما يفعله التطبيق حين يفشل حفظ مراحله', 1);
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) سجلّ الدفعات: لا يكتبه الطرفان، والإدارة تكتب'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$insert into contract_payments (milestone_id, kind, amount, status)
    values ('11000000-0000-0000-0000-000000000011', 'release', 100, 'released')$q$,
    'لا يُدرج صاحبُ العقد دفعةً «مُصرَفة» بيده', true);
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _works($q$insert into contract_payments (milestone_id, kind, amount, status)
    values ('11000000-0000-0000-0000-000000000011', 'advance', 50, 'scheduled')$q$,
    'والإدارةُ تكتب السجلّ', 1);
  perform _works($q$update stage_evidence set caption = 'تصحيحٌ من الإدارة' where id = 'e1000000-0000-0000-0000-000000000001'$q$,
    'والإدارةُ تصحّح ما يلزم (لا استثناءَ للمالك وحده)', 1);
  perform _works($q$update season_stages set note = 'من الإدارة' where id = '51000000-0000-0000-0000-000000000001'$q$,
    'وتعدّل مرحلةً معتمدةً عند الضرورة', 1);
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — الالتفافُ على الاعتماد والدليل والدفتر مغلق';
end $$;
