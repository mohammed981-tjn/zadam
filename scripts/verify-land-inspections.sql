-- بوّابةُ تقرير المعاينة (البند ١٢٨).
--
-- The investor asks; nothing happens until the owner agrees; a fee, when there
-- is one, is recorded before anyone is sent; the inspector is neither party and
-- has no request of their own on the land; the report has a result for every
-- check asked, at least three photos, and a declaration of independence; once
-- sealed it carries a reference and a fingerprint and nobody edits it. The
-- investor never sees the land's name, village, coordinates or owner, and the
-- photos are readable by the parties only once the report is sealed.

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


-- ── الناس: م صاحب الأرض، س مستثمرة، ه مستثمرٌ ثانٍ، غ غريب، ف مفتّش، د مدير ──
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('d4000000-0000-0000-0000-0000000000d4'),
  ('e5000000-0000-0000-0000-0000000000e5'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor', '0911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'سلمى أحمد علي', 'investor', '0922222222'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', null),
  ('d4000000-0000-0000-0000-0000000000d4', 'المهندس خالد', 'investor', '0944444444'),
  ('e5000000-0000-0000-0000-0000000000e5', 'هاشم الطيب', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
grant select, insert, update, delete on lands, profiles to anon, authenticated;

-- The bucket as Supabase serves it: signed-in users reach storage.objects, and
-- each may read and delete what is in their own folder (evidence_read_own and
-- evidence_delete_own, 20260904210000). These stand-ins are the permissive
-- policies the migration's restrictive one must overrule.
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
create policy _stand_in_evidence_read_own on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy _stand_in_evidence_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'البقعة', 'ود البشير', 15.60, 32.50, 4, 'khartoum', 'river_pump', 'verified', 3,
        true, array['sharecrop','lease']),
       ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'أرضٌ لم تُعرض',
        'الخرطوم', 'البقعة', 'ود البشير', 15.61, 32.51, 2, 'khartoum', 'river_pump', 'verified', 3,
        false, '{}');
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg'),
  ('11000000-0000-0000-0000-000000000002', 'tenure', 'a/tenure2.jpg'),
  ('11000000-0000-0000-0000-000000000002', 'photo', 'a/photo2.jpg'),
  ('11000000-0000-0000-0000-000000000002', 'permit', 'a/permit2.jpg');
update lands set listed = true;

-- هاشم يملك شركةً شريكة طلبت الأرض الأولى — فلا يكون مفتّشها.
insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at)
values ('22000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-0000000000e5', 'شركة هاشم للميكنة',
        array['mechanization'], array['الخرطوم'], 'هاشم الطيب', '0955555555', now());
insert into partner_interests (company_id, land_id, message)
values ('22000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001',
        'نريد حرث الأرض وتجهيزها للموسم الشتوي القادم');

\echo ''
\echo 'أ) المستثمرة تطلب — وصاحب الأرض لا يطلب أرضه، والأرض غير المعروضة لا تُطلب'

set role anon;
do $$ begin
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000001', array['water'], null)$q$,
    'الزائر لا يطلب معاينة');
end $$;
reset role;

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000001', array['water'], null)$q$,
    'صاحبُ الأرض لا يطلب معاينة أرضه');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000002', array['water'], null)$q$,
    'ولا تُطلب أرضٌ لم تُعرض على المستثمرين');
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000001', array['gold'], null)$q$,
    'ولا بندٌ غير معروف');
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000001', '{}', null)$q$,
    'ولا طلبٌ بلا بنود');

  insert into _ids values ('free', land_inspection_request('11000000-0000-0000-0000-000000000001',
    array['water','tenure','area','water'], 'أريد التأكّد من أنّ المضخّة تعمل'));
  perform _eq(_id('free') is not null, true, 'المستثمرةُ تطلب المعاينة');
  perform _refuses($q$select land_inspection_request('11000000-0000-0000-0000-000000000001', array['soil'], null)$q$,
    'ولا طلبَ ثانياً مفتوحاً على الأرض نفسها');

  perform _eq((select count(*)::int from land_inspections), 0, 'ولا تقرأ الجدول مباشرةً');
  perform _eq((select cardinality(checks) from land_inspection_list() where id = _id('free')), 3,
    'والبندُ المكرّر يُحسب مرّة');
  perform _eq((select fee_status from land_inspection_list() where id = _id('free')), 'free',
    'والمعاينةُ مجّانيّةٌ ما دام الأجر فارغاً');
  perform _eq(land_inspection_view(_id('free'))->>'me', 'investor', 'وتعرض طلبها مستثمرةً');
  perform _eq(land_inspection_view(_id('free'))->'land'->>'village', null::text, 'ولا ترى القرية');
  perform _eq(land_inspection_view(_id('free'))->'land'->>'latitude', null::text, 'ولا الإحداثيّات');
  perform _eq(land_inspection_view(_id('free'))->>'owner_name', null::text, 'ولا اسمَ صاحب الأرض');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select land_inspection_view(_id('free'))$q$, 'والغريبُ لا يعرض الطلب');
  perform _eq((select count(*)::int from land_inspection_list()), 0, 'ولا يجده في قائمته');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where kind = 'inspection_update' and recipient_id = 'a1000000-0000-0000-0000-0000000000a1'), 1,
    'وإشعارٌ يصل صاحب الأرض');
end $$;

\echo ''
\echo 'ب) صاحب الأرض يوافق — ولا أحدَ غيره'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select land_inspection_owner_decide(_id('free'), true)$q$, 'المستثمرةُ لا توافق عن صاحب الأرض');
  perform _refuses($q$select land_inspection_mark_paid(_id('free'))$q$, 'ولا تسجّل دفعاً');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select role from land_inspection_list() where id = _id('free')), 'owner', 'صاحبُ الأرض يجد الطلب');
  perform _eq((select investor_name from land_inspection_list() where id = _id('free')), 'سلمى أحمد علي',
    'ويعرف من طلبه');
  perform land_inspection_owner_decide(_id('free'), true);
  perform _eq((select status from land_inspection_list() where id = _id('free')), 'accepted', 'ويوافق');
  perform _refuses($q$select land_inspection_owner_decide(_id('free'), false)$q$, 'ولا يردّ مرّتين');
end $$;
reset role;

\echo ''
\echo 'ج) الأجر: يضعه المدير، ويُستحقّ بعد الموافقة، ولا إسنادَ قبل دفعه'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select platform_fee_set('land_inspection', 1)$q$, 'غيرُ المدير لا يضع الأجر');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$select platform_fee_set('land_inspection', -5)$q$, 'ولا أجرَ سالب');
  perform platform_fee_set('land_inspection', 5000);

  perform _act_as('e5000000-0000-0000-0000-0000000000e5');
  insert into _ids values ('paid', land_inspection_request('11000000-0000-0000-0000-000000000001', array['soil','access'], null));
  perform _eq((select fee_sdg from land_inspection_list() where id = _id('paid')), 5000::numeric,
    'الطلبُ يحفظ الأجر يوم طُلب');
  perform _eq((select fee_status from land_inspection_list() where id = _id('paid')), 'free',
    'ولا يُستحقّ شيءٌ قبل موافقة صاحب الأرض');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_inspection_owner_decide(_id('paid'), true);

  perform _act_as('e5000000-0000-0000-0000-0000000000e5');
  perform _eq((select fee_status from land_inspection_list() where id = _id('paid')), 'due', 'وبعد موافقته يُستحقّ');
  perform _refuses($q$select land_inspection_cancel(_id('free'))$q$, 'ولا يُلغي مستثمرٌ طلبَ غيره');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$select land_inspection_assign(_id('paid'), 'd4000000-0000-0000-0000-0000000000d4', null)$q$,
    'ولا إسنادَ قبل تسجيل الدفع');
  perform land_inspection_mark_paid(_id('paid'));
  perform _refuses($q$select land_inspection_mark_paid(_id('paid'))$q$, 'ولا يُسجَّل الدفع مرّتين');

  perform _act_as('e5000000-0000-0000-0000-0000000000e5');
  perform _refuses($q$select land_inspection_cancel(_id('paid'))$q$, 'وبعد الدفع لا يُلغي المستثمر بنفسه');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform land_inspection_admin_cancel(_id('paid'), 'المفتّش غير متاح هذا الشهر');
  perform _eq((select status from land_inspections where id = _id('paid')), 'cancelled', 'والمدير يلغيه بسببٍ مكتوب');
  perform platform_fee_set('land_inspection', null);
end $$;
reset role;

\echo ''
\echo 'د) الإسناد: المدير وحده، والمفتّش ليس طرفاً ولا صاحبَ طلبٍ على الأرض'

set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform investor_express_interest('11000000-0000-0000-0000-000000000001', 'lease', 'أريد استئجار الأرض للموسم الشتوي القادم');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'c3000000-0000-0000-0000-0000000000c3', null)$q$,
    'غيرُ المدير لا يُسند');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'a1000000-0000-0000-0000-0000000000a1', null)$q$,
    'المفتّش لا يكون صاحب الأرض');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'b2000000-0000-0000-0000-0000000000b2', null)$q$,
    'ولا المستثمرة');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'c3000000-0000-0000-0000-0000000000c3', null)$q$,
    'ولا من له طلبُ شراكةٍ على الأرض نفسها');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'e5000000-0000-0000-0000-0000000000e5', null)$q$,
    'ولا شركةٌ لها طلبٌ على الأرض نفسها');
  perform _refuses($q$select land_inspection_assign(_id('free'), 'd4000000-0000-0000-0000-0000000000d4', date '2020-01-01')$q$,
    'ولا موعدَ في الماضي');
  perform land_inspection_assign(_id('free'), 'd4000000-0000-0000-0000-0000000000d4', null);

  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _eq(land_inspection_view(_id('free'))->>'me', 'inspector', 'المفتّشُ يعرض المعاينة');
  perform _eq(land_inspection_view(_id('free'))->'land'->>'village', 'ود البشير', 'ويرى القرية ليزورها');
  perform _eq(land_inspection_view(_id('free'))->>'owner_phone', '0911111111', 'وهاتفَ صاحبها');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq(land_inspection_view(_id('free'))->>'inspector_name', 'المهندس خالد', 'والمستثمرةُ تعرف من المفتّش');
  perform _eq(land_inspection_view(_id('free'))->'land'->>'village', null::text, 'ولا تزال لا ترى القرية');
  perform _refuses($q$select land_inspection_cancel(_id('free'))$q$, 'ولا تُلغي بعد الإسناد');
end $$;
reset role;

\echo ''
\echo 'هـ) التقرير: صورٌ في مجلّد المفتّش، ونتيجةٌ لكلّ بند، وإقرارٌ بالاستقلال'

set role authenticated;
do $$
declare ref text;
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select land_inspection_add_photo(_id('free'), 'c3000000-0000-0000-0000-0000000000c3/inspections/x.jpg', null, null, null, null)$q$,
    'الغريبُ لا يضيف صورة');

  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _refuses($q$select land_inspection_add_photo(_id('free'), 'a1000000-0000-0000-0000-0000000000a1/inspections/x.jpg', null, null, null, null)$q$,
    'ولا صورةَ من مجلّد غير المفتّش');
  perform land_inspection_add_photo(_id('free'), 'd4000000-0000-0000-0000-0000000000d4/inspections/1.jpg', 'المضخّة', now(), 15.601, 32.501);
  perform land_inspection_add_photo(_id('free'), 'd4000000-0000-0000-0000-0000000000d4/inspections/2.jpg', 'الحدّ الشرقيّ', now(), null, null);

  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, %L, null, true)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"tenure","result":"ok"},{"key":"water","result":"ok"}]',
    'الأرض كما عُرضت، والمضخّة تعمل، والحدود واضحة مع الجيران.'),
    'لا تقريرَ بأقلّ من ثلاث صور');
  perform land_inspection_add_photo(_id('free'), 'd4000000-0000-0000-0000-0000000000d4/inspections/3.jpg', 'الورقة', now(), 15.70, 32.50);

  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, %L, null, true)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"water","result":"ok"}]',
    'الأرض كما عُرضت، والمضخّة تعمل، والحدود واضحة مع الجيران.'),
    'ولا تقريرَ ينقصه بندٌ طلبته المستثمرة');
  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, %L, null, true)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"tenure","result":"issue"},{"key":"water","result":"ok"}]',
    'الأرض كما عُرضت، والمضخّة تعمل، والحدود واضحة مع الجيران.'),
    'ولا ملاحظةَ بلا شرح');
  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, %L, null, false)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"tenure","result":"ok"},{"key":"water","result":"ok"}]',
    'الأرض كما عُرضت، والمضخّة تعمل، والحدود واضحة مع الجيران.'),
    'ولا تقريرَ بلا إقرار الاستقلال');
  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, 'قصير', null, true)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"tenure","result":"ok"},{"key":"water","result":"ok"}]'),
    'ولا خلاصةَ في كلمة');

  ref := land_inspection_submit(_id('free'), 'conditional',
    '[{"key":"area","result":"ok","note":"قيست ٣٫٨ فدان"},{"key":"tenure","result":"issue","note":"شهادة الحيازة باسم والده"},{"key":"water","result":"ok"}]'::jsonb,
    'الأرض صالحة والمضخّة تعمل، لكنّ شهادة الحيازة باسم والد صاحبها — يلزم تفويضٌ مكتوب قبل العقد.',
    3.8, true);
  perform _eq(ref like 'INS-%', true, 'التقريرُ يُقفل برقم — ' || coalesce(ref, 'null'));
  perform _refuses(format($q$select land_inspection_submit(%L, 'clear', %L::jsonb, %L, null, true)$q$, _id('free'),
    '[{"key":"area","result":"ok"},{"key":"tenure","result":"ok"},{"key":"water","result":"ok"}]',
    'محاولةٌ لتغيير الخلاصة بعد أن أُقفل التقرير وأُرسل.'),
    'ولا يُكتب مرّتين');
  perform _refuses($q$select land_inspection_add_photo(_id('free'), 'd4000000-0000-0000-0000-0000000000d4/inspections/4.jpg', null, null, null, null)$q$,
    'ولا تُضاف صورةٌ بعده');
  perform _refuses(format($q$select land_inspection_remove_photo(%L)$q$,
    (select (land_inspection_view(_id('free'))->'photos'->0->>'id'))),
    'ولا تُحذف');
end $$;
reset role;

do $$ begin
  perform _eq((select report_hash from land_inspections where id = _id('free')) ~ '^[0-9a-f]{64}$', true, 'وبصمتُه SHA-256');
  perform _eq((select report_hash from land_inspections where id = _id('free')),
              land_inspection_report_hash(_id('free')), 'والبصمةُ تطابق ما حُفظ');
end $$;

\echo ''
\echo 'و) المستثمرة تقرأ التقرير بصوره — والمسافةُ لا الموقع'

set role authenticated;
do $$
declare v jsonb;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  v := land_inspection_view(_id('free'));
  perform _eq(v->>'verdict', 'conditional', 'الخلاصة: سليمةٌ بشروط');
  perform _eq(jsonb_array_length(v->'photos'), 3, 'والصورُ الثلاث');
  perform _eq((v->'photos'->0->>'distance_km')::numeric < 1, true, 'والصورةُ الأولى قرب الأرض — ' || (v->'photos'->0->>'distance_km'));
  perform _eq((v->'photos'->1->>'distance_km'), null::text, 'والصورةُ بلا موقعٍ لا مسافة لها');
  perform _eq((v->'photos'->2->>'distance_km')::numeric > 10, true, 'والبعيدةُ تُرى بعيدة — ' || (v->'photos'->2->>'distance_km'));
  perform _eq(v::text ~ '(15\.6|32\.5)', false, 'ولا إحداثيّاتٍ في شيءٍ مما تقرؤه');
end $$;
reset role;

\echo ''
\echo 'ز) صاحب الأرض يردّ مرّةً واحدة'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select land_inspection_owner_reply(_id('free'), 'ردٌّ ليس من صاحب الأرض')$q$, 'المستثمرةُ لا تردّ عن صاحب الأرض');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_inspection_owner_reply(_id('free'), 'التفويض موجود عند المحامي وأرسله قبل العقد.');
  perform _eq(land_inspection_view(_id('free'))->>'owner_reply' is not null, true, 'صاحبُ الأرض يردّ');
  perform _refuses($q$select land_inspection_owner_reply(_id('free'), 'ردٌّ ثانٍ')$q$, 'ولا يردّ مرّتين');
end $$;
reset role;

\echo ''
\echo 'ح) الصور في الدلو: لأطراف المعاينة، ولا تُحذف'

insert into storage.objects (bucket_id, name) values
  ('evidence', 'd4000000-0000-0000-0000-0000000000d4/inspections/1.jpg'),
  ('evidence', 'd4000000-0000-0000-0000-0000000000d4/inspections/2.jpg'),
  ('evidence', 'd4000000-0000-0000-0000-0000000000d4/inspections/3.jpg'),
  ('evidence', 'd4000000-0000-0000-0000-0000000000d4/other.jpg');

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from storage.objects where name like '%/inspections/%'), 3, 'المستثمرةُ تفتح صور التقرير');
  perform _eq((select count(*)::int from storage.objects where name like '%/other.jpg'), 0, 'ولا تفتح غيرها من ملفّات المفتّش');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from storage.objects), 0, 'والغريبُ لا يفتح شيئاً');
  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _changes_nothing($q$delete from storage.objects where name like '%/inspections/%'$q$,
    'والمفتّشُ لا يحذف صورةً قام عليها التقرير');
  perform _eq((select count(*)::int from storage.objects where name like '%/inspections/%'), 3, 'فالصورُ باقية');
end $$;
reset role;

set role authenticated;
do $$
declare n integer;
begin
  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  delete from storage.objects where name like '%/other.jpg';
  get diagnostics n = row_count;
  perform _eq(n, 1, 'ويحذف ملفّه الذي لم يُسجَّل في تقرير');
end $$;
reset role;

\echo ''
\echo 'ط) ما يراه الجميع: كم تقريراً، وكم قال كلَّ شيء'

set role anon;
do $$ begin
  perform _eq((select reported from land_inspection_stats()), 1, 'الزائرُ يرى عدد التقارير');
  perform _eq((select conditional from land_inspection_stats()), 1, 'وكم قال «بشروط»');
end $$;
reset role;

\echo ''
\echo 'ي) الصلاحيات'

do $$ begin
  perform _eq((select count(*)::int from pg_proc p
                where p.pronamespace = 'public'::regnamespace
                  and (p.proname like 'land_inspection_%' or p.proname like 'inspection_photo_%' or p.proname = 'platform_fee_set')
                  and p.proname <> 'land_inspection_stats'
                  and has_function_privilege('anon', p.oid, 'execute')), 0,
    'الزائرُ لا ينفّذ إلّا عدَّ التقارير');
  perform _eq(has_function_privilege('authenticated', 'public.land_inspection_report_hash(uuid)', 'execute'), false,
    'ولا يحسب المسجَّلُ البصمة بنفسه');
  perform _eq(has_table_privilege('authenticated', 'public.land_inspections', 'insert'), false,
    'ولا يكتب في جدول المعاينات');
  perform _eq(has_table_privilege('authenticated', 'public.platform_fees', 'update'), false,
    'ولا يغيّر الأجر بيده');
  perform _eq((select count(*)::int from notifications where kind = 'inspection_report'), 3,
    'وإشعارُ التقرير يصل الطرفين والمدير');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — المعاينةُ بموافقة صاحب الأرض، ومفتّشٌ ليس طرفاً، وتقريرٌ مقفلٌ ببصمة';
end $$;
