-- بوّابةُ جواز المزرعة: السجلُّ لا يعدّ إلّا ما حدث، ولا يُقرأ إلّا بإذن.
--
-- WHAT THIS IS ACTUALLY GUARDING
--
-- Three things, and the last is the one that bites.
--
-- ١) العدّ. `enforce_stage_completion` refuses to close a stage without an
--    uploaded file — «الملاحظة النصية وحدها ليست دليلاً» — and
--    `farmer_season_records` used to count note-only rows toward the heaviest
--    trust factor. The platform enforced one rule and published another.
--
-- ٢) المواعيد. A completed stage with no `actual_end` counted as on time.
--    `actual_end` is written only by the screen, never by a trigger, so any
--    client talking to PostgREST directly earned a perfect punctuality record
--    for dates it never entered.
--
-- ٣) الصلاحيّة. Adding a column to a `returns table` cannot be done with
--    `create or replace`, so the migration must `drop` — and a dropped function
--    comes back with `EXECUTE` granted to `PUBLIC`. This function hands out
--    per-season budget, cost and revenue for **any** owner id, so that default
--    is the whole of the hole that `20260903090000` was written to close. The
--    checks below assert the grant state the migration left behind, which is
--    why the fixture does not blanket-grant execute over `public`.

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
  exception when others then perform _pass(label || ' — رُفض'); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- ===========================================================================
-- التجهيزة
-- ===========================================================================

insert into profiles (id, full_name, role, publish_record) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin',    false),
  ('fa000000-0000-0000-0000-0000000000fa', 'صاحبُ المزرعة',  'investor', false),
  ('bb000000-0000-0000-0000-0000000000bb', 'مشترٍ فضوليّ',    'investor', false);

-- أرضان، وتمرّان بالطريق الحقيقيّ لا بإدراجٍ جاهز: `enforce_land_listing_gate`
-- يرفض نشرَ أرضٍ ناقصةِ المستندات، و`refresh_land_document_count` هو ما يملأ
-- العدّاد. وإدراجُ أرضٍ «موثّقةٍ منشورةٍ» مباشرةً كان سيقفز فوق الحارسَين معاً،
-- فيختبر الجوازُ بياناتٍ لا تستطيع المنصّةُ إنتاجَها.
insert into lands (id, owner_id, name, state, locality, feddans, tenure,
                   station_key, water_source) values
  ('1a000000-0000-0000-0000-00000000001a', 'fa000000-0000-0000-0000-0000000000fa',
   'حواشة الشمال', 'الجزيرة', 'المسلمية', 40, 'owned', 'wad_medani', 'canal'),
  ('1a000000-0000-0000-0000-00000000002a', 'fa000000-0000-0000-0000-0000000000fa',
   'قطعةٌ لم تُفحص', 'سنار', 'الدندر', 15, 'leased', 'sennar', 'canal');

-- ثلاثةُ أنواعٍ للأولى — والعدّادُ يعدّ الأنواعَ لا الملفّات.
insert into land_documents (land_id, kind, storage_path) values
  ('1a000000-0000-0000-0000-00000000001a', 'title_deed', 'fa/land/deed.pdf'),
  ('1a000000-0000-0000-0000-00000000001a', 'survey',     'fa/land/survey.pdf'),
  ('1a000000-0000-0000-0000-00000000001a', 'tenancy',    'fa/land/tenancy.pdf');

-- والتوثيقُ بيد الإدارة وحدها — والحارسُ يقرأ `is_admin()`، فيلزم أن تكون
-- الجلسةُ إداريّةً حتّى ونحن مالكو القاعدة.
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;

update lands
   set verification = 'verified', listed = true,
       verification_note = 'رُوجعت الحيازةُ والخريطة'
 where id = '1a000000-0000-0000-0000-00000000001a';

do $$ begin perform _act_as(null); end $$;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation,
                     feddans, planting_date, status, land_id) values
  ('5e000000-0000-0000-0000-00000000005e', 'fa000000-0000-0000-0000-0000000000fa',
   'قمح ٢٠٢٦', 'wheat', 'wad_medani', 'flood', 40, date '2026-01-01', 'completed',
   '1a000000-0000-0000-0000-00000000001a');

-- ستُّ مراحل، كلٌّ منها تمثّل حالةً بعينها. وتُدرج مكتملةً مباشرةً لأنّ
-- `enforce_stage_completion` زنادُ `before update` وحده — والصفوفُ التي تدخل
-- بالإدراج (استيراد، هجرة، عميلٌ يكتب مباشرةً) لا يراها. وهذا هو بيتُ القصيد:
-- العدُّ يجب ألّا يعتمد على أنّ الزنادَ عمل.
insert into season_stages (id, season_id, stage_key, stage_order,
                           planned_start, planned_end, actual_end, completed) values
  -- ١) بملفّ، وفي موعدها
  ('57000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-00000000005e',
   'land_prep', 1, date '2026-01-01', date '2026-01-10', date '2026-01-09', true),
  -- ٢) بملاحظةٍ نصّيةٍ فقط — لا ملفّ
  ('57000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-00000000005e',
   'planting', 2, date '2026-01-11', date '2026-01-20', date '2026-01-19', true),
  -- ٣) بلا دليلٍ أصلاً
  ('57000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-00000000005e',
   'establishment', 3, date '2026-01-21', date '2026-01-30', date '2026-01-29', true),
  -- ٤) مكتملةٌ بلا تاريخِ إنجاز — المجهول
  ('57000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-00000000005e',
   'vegetative', 4, date '2026-02-01', date '2026-02-10', null, true),
  -- ٥) متأخّرة
  ('57000000-0000-0000-0000-000000000005', '5e000000-0000-0000-0000-00000000005e',
   'flowering', 5, date '2026-02-11', date '2026-02-20', date '2026-03-01', true),
  -- ٦) لم تُعتمد بعد
  ('57000000-0000-0000-0000-000000000006', '5e000000-0000-0000-0000-00000000005e',
   'maturity', 6, date '2026-02-21', date '2026-03-05', null, false);

insert into stage_evidence (stage_id, kind, storage_path, caption) values
  ('57000000-0000-0000-0000-000000000001', 'photo',
   'fa000000-0000-0000-0000-0000000000fa/prep.jpg', 'تجهيز الأرض'),
  -- ملاحظةٌ بلا ملفّ: هذه بالضبط ما كانت تُحسب توثيقاً
  ('57000000-0000-0000-0000-000000000002', 'note', null, 'زرعنا يوم الثلاثاء'),
  ('57000000-0000-0000-0000-000000000005', 'invoice',
   'fa000000-0000-0000-0000-0000000000fa/spray.pdf', 'فاتورة رشّ');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- وليس `grant execute on all functions`: لو مُنحت جملةً لأعادت لـ`anon` تنفيذَ
-- `farmer_season_records` ولاختبرت البوّابةُ منحَها هي لا ما تركته الهجرة.
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) الدليلُ الذي له ملفّ وحده يُحسب توثيقاً'
\echo '=========================================================================='

do $$
declare r record;
begin
  select * into r from farmer_season_records('fa000000-0000-0000-0000-0000000000fa');

  perform _eq(r.stages_total, 6, 'ستُّ مراحل في الموسم');
  perform _eq(r.stages_completed, 5, 'خمسٌ منها معتمَدة');

  -- المرحلتان ١ و٥ لهما ملفّ. والثانيةُ لها صفُّ دليلٍ بلا ملفّ، والثالثةُ بلا
  -- دليلٍ أصلاً — والاثنتان سواءٌ في الحساب، وهو الصواب: صفٌّ بلا ملفّ لا يُثبت
  -- شيئاً لمن يقرأ الجواز.
  perform _eq(r.stages_with_evidence, 2,
    'مرحلتان موثّقتان بملفّ — والملاحظةُ النصّيةُ ليست دليلاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) والمجهولُ لا يُحسب التزاماً'
\echo '=========================================================================='

do $$
declare r record;
begin
  select * into r from farmer_season_records('fa000000-0000-0000-0000-0000000000fa');

  -- المعتمَدةُ خمس، لكنّ الرابعةَ بلا تاريخِ إنجاز. فالمقامُ أربع.
  perform _eq(r.stages_dated, 4, 'أربعُ مراحلَ نملك تاريخَها — مقامُ الالتزام');

  -- ومنها ثلاثٌ في موعدها (١ و٢ و٣)، والخامسةُ متأخّرة.
  perform _eq(r.stages_on_time, 3, 'ثلاثٌ منها في موعدها');

  -- وهذا هو الفحصُ الذي يمسك العطبَ القديم: كانت الرابعةُ (بلا تاريخ) تُعدّ
  -- ملتزمةً، فتصير أربعاً من خمس — ٨٠٪ لمزارعٍ لم يسجّل تاريخاً.
  perform _eq(r.stages_on_time = r.stages_completed, false,
    'ولا تُساوي المعتمَدةَ — وإلّا لكان المجهولُ التزاماً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والدالّةُ لم تعد للعموم بعد إعادة إنشائها'
\echo '=========================================================================='

do $$
begin
  -- `drop` تمنح `PUBLIC` تنفيذاً افتراضياً. وهذه الدالّةُ تُرجع ميزانيةَ أيِّ
  -- معرّفٍ يُمرَّر إليها وإيرادَه، ومَن يحمل مفتاحَ `anon` يحمله كلُّ متصفّح.
  perform _eq(
    has_function_privilege('anon', 'public.farmer_season_records(uuid)', 'EXECUTE'),
    false, 'لا ينفّذها `anon`');
  perform _eq(
    has_function_privilege('authenticated', 'public.farmer_season_records(uuid)', 'EXECUTE'),
    false, 'ولا `authenticated` — والمالُ لا يُقرأ بمفتاحِ جلسة');
  perform _eq(
    has_function_privilege('public', 'public.farmer_season_records(uuid)', 'EXECUTE'),
    false, 'ولا `PUBLIC` — وهو ما يعيده `drop` بصمت');
  perform _eq(
    has_function_privilege('service_role', 'public.farmer_season_records(uuid)', 'EXECUTE'),
    true, 'ويقرأها الخادمُ وحده');
end $$;

-- وبدورٍ حقيقيّ لا بفحصِ صلاحيةٍ فحسب.
set role anon;
do $$
begin
  perform _refuses(
    $f$ select * from farmer_season_records('fa000000-0000-0000-0000-0000000000fa') $f$,
    'وزائرٌ يناديها بنفسه');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) والنشرُ بإذن صاحبه — لا بوجود سجلّ'
\echo '=========================================================================='

set role anon;
do $$
begin
  perform _eq((select count(*)::int from public_farmer_profile('fa000000-0000-0000-0000-0000000000fa')),
    0, 'وله مواسمُ ولم يأذن — فلا صفحةَ له');
end $$;
reset role;

update profiles set publish_record = true
 where id = 'fa000000-0000-0000-0000-0000000000fa';

set role anon;
do $$
begin
  perform _eq((select count(*)::int from public_farmer_profile('fa000000-0000-0000-0000-0000000000fa')),
    1, 'فلمّا أذن ظهر');
  perform _eq((select full_name from public_farmer_profile('fa000000-0000-0000-0000-0000000000fa')),
    'صاحبُ المزرعة', 'باسمه');
end $$;
reset role;

-- ومَن أذن بلا موسمٍ لا تُنشر له صفحةٌ فارغةٌ تحمل اسمَه.
update profiles set publish_record = true
 where id = 'bb000000-0000-0000-0000-0000000000bb';

set role anon;
do $$
begin
  perform _eq((select count(*)::int from public_farmer_profile('bb000000-0000-0000-0000-0000000000bb')),
    0, 'ومَن أذن بلا موسمٍ فلا صفحةَ — الإذنُ بلا موضوعٍ لا يُنشر');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'هـ) والأرضُ الموثّقة نصفُ الجواز — وتُقرأ بلا حساب'
\echo '=========================================================================='

set role anon;
do $$
begin
  -- بلا دالّةٍ ولا مفتاحِ خدمة: `lands_public_read` تسمح بالمنشورة الموثّقة.
  perform _eq((select count(*)::int from lands
                where owner_id = 'fa000000-0000-0000-0000-0000000000fa'),
    1, 'زائرٌ بلا حساب يرى الأرضَ الموثّقةَ المنشورة');
  perform _eq((select name from lands
                where owner_id = 'fa000000-0000-0000-0000-0000000000fa'),
    'حواشة الشمال', 'باسمها وولايتها');

  -- وما لم يُفحص لا يظهر — لا لأنّه غيرُ موجود، بل لأنّ المنصّة لا تشهد به.
  perform _eq((select count(*)::int from lands
                where name = 'قطعةٌ لم تُفحص'),
    0, 'ولا يرى ما لم تُوثَّق');

  -- والموسمُ نفسُه يبقى خاصّاً: الجوازُ يعرض خلاصتَه لا صفوفَه.
  perform _eq((select count(*)::int from seasons), 0,
    'ولا يقرأ صفوفَ المواسم — الخلاصةُ تُنشر والتفصيلُ لا');
  perform _eq((select count(*)::int from stage_evidence), 0,
    'ولا صفوفَ الأدلّة');
end $$;
reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then
    raise exception 'فشل % فحصاً.', f;
  end if;
  raise notice 'ALL CHECKS PASSED — الجوازُ لا يَعِد بما لم يحدث';
end $$;
