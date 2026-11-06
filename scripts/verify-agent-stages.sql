-- بوّابةُ الوكيل يكتب مراحل الموسم وأدلّتها (البند ١٦٩، قرار المالك 6 نوفمبر؛ الهجرة 20261106050000).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; update _score set passes = passes + 1; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
/* يُرفض بخطأ؛ وإن أُعطي جزءٌ من الرسالة فبها، لا بخطأٍ آخر. */
create function _refuses(stmt text, label text, want text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if want is null or position(want in sqlerrm) > 0 then perform _pass(label);
    else perform _fail(label, 'رُفض بغير السبب: ' || sqlerrm); end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;
/* ينفَّذ ويمسّ عدداً بعينه من الصفوف. */
create function _rows(stmt text, want integer, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض: ' || sqlerrm); return; end;
  perform _eq(n, want, label);
end $$;
create function _as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text end, false) $$;
/* سطر السجلّ لموضوعه، بصلاحيّة العنقود: الغريب لا يرى السجلّ، والسؤال عن رقمه ليس ما يُختبر. */
create function _act(p uuid) returns bigint language sql security definer as $$ select id from agent_actions where subject_id = p $$;
grant execute on function _act(uuid) to authenticated, anon;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _rows(text, integer, text), _as(uuid) to authenticated, anon;

-- What Supabase itself grants on its storage schema (not a migration's to give).
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- ── الناس (بصلاحيّة العنقود) ─────────────────────────────────────────────────
-- a1 وكيلٌ موثّقٌ بإذنٍ في المواسم · a2 شركته لم توثَّق · a3 إذنه في الأراضي وحدها · a4 انتهى إذنه
-- · d1 المزارع · x9 غريب
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('a2000000-0000-0000-0000-0000000000a2'),
  ('a3000000-0000-0000-0000-0000000000a3'), ('a4000000-0000-0000-0000-0000000000a4'),
  ('d1000000-0000-0000-0000-0000000000d1'), ('e9000000-0000-0000-0000-0000000000e9');
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الوكيل', 'investor'),
  ('a2000000-0000-0000-0000-0000000000a2', 'وكيلٌ ينتظر', 'investor'),
  ('a3000000-0000-0000-0000-0000000000a3', 'وكيل الأراضي', 'investor'),
  ('a4000000-0000-0000-0000-0000000000a4', 'وكيلٌ انتهى', 'investor'),
  ('d1000000-0000-0000-0000-0000000000d1', 'المزارع', 'investor'),
  ('e9000000-0000-0000-0000-0000000000e9', 'غريب', 'investor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('7a000000-0000-0000-0000-00000000007a', 'a1000000-0000-0000-0000-0000000000a1', 'جمعيّة المزارعين', array['extension'], array['سنار'], 'فلان', '0900000001', now(), true),
  ('7b000000-0000-0000-0000-00000000007b', 'a2000000-0000-0000-0000-0000000000a2', 'شركة تنتظر', array['inputs'], array['سنار'], 'علان', '0900000002', null, true),
  ('7c000000-0000-0000-0000-00000000007c', 'a3000000-0000-0000-0000-0000000000a3', 'شركة الأراضي', array['inputs'], array['سنار'], 'فلتان', '0900000003', now(), true),
  ('7d000000-0000-0000-0000-00000000007d', 'a4000000-0000-0000-0000-0000000000a4', 'شركة انتهت', array['inputs'], array['سنار'], 'علتان', '0900000004', now(), true);

insert into agent_mandates (id, company_id, farmer_id, scopes, note, phone_tail, status, requested_by, answered_at, ended_at, ended_by) values
  ('3a000000-0000-0000-0000-00000000003a', '7a000000-0000-0000-0000-00000000007a', 'd1000000-0000-0000-0000-0000000000d1',
   array['seasons'], 'نتابع موسمك ونرفع أدلّته عنك', '5678', 'active', 'a1000000-0000-0000-0000-0000000000a1', now(), null, null),
  ('3b000000-0000-0000-0000-00000000003b', '7b000000-0000-0000-0000-00000000007b', 'd1000000-0000-0000-0000-0000000000d1',
   array['seasons'], 'نتابع موسمك ونرفع أدلّته عنك', '5678', 'active', 'a2000000-0000-0000-0000-0000000000a2', now(), null, null),
  ('3c000000-0000-0000-0000-00000000003c', '7c000000-0000-0000-0000-00000000007c', 'd1000000-0000-0000-0000-0000000000d1',
   array['lands'], 'نسجّل أرضك ونرفع أوراقها عنك', '5678', 'active', 'a3000000-0000-0000-0000-0000000000a3', now(), null, null),
  ('3d000000-0000-0000-0000-00000000003d', '7d000000-0000-0000-0000-00000000007d', 'd1000000-0000-0000-0000-0000000000d1',
   array['seasons'], 'نتابع موسمك ونرفع أدلّته عنك', '5678', 'revoked', 'a4000000-0000-0000-0000-0000000000a4', now(), now(),
   'd1000000-0000-0000-0000-0000000000d1');

-- موسمٌ جارٍ بثلاث مراحل، وموسمٌ أُقفل بمرحلةٍ مفتوحة.
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5a000000-0000-0000-0000-00000000005a', 'd1000000-0000-0000-0000-0000000000d1', 'موسم الذرة', 'sorghum', 'sennar', 'rainfed', 10, '2026-07-01'),
  ('5b000000-0000-0000-0000-00000000005b', 'd1000000-0000-0000-0000-0000000000d1', 'موسمٌ مضى', 'sorghum', 'sennar', 'rainfed', 10, '2025-07-01');
update seasons set status = 'completed' where id = '5b000000-0000-0000-0000-00000000005b';
insert into season_stages (id, season_id, stage_key, stage_order, planned_start, planned_end) values
  ('51000000-0000-0000-0000-000000000051', '5a000000-0000-0000-0000-00000000005a', 'land_prep', 1, '2026-07-01', '2026-07-10'),
  ('52000000-0000-0000-0000-000000000052', '5a000000-0000-0000-0000-00000000005a', 'planting', 2, '2026-07-11', '2026-07-20'),
  ('53000000-0000-0000-0000-000000000053', '5a000000-0000-0000-0000-00000000005a', 'establishment', 3, '2026-07-21', '2026-08-30'),
  ('59000000-0000-0000-0000-000000000059', '5b000000-0000-0000-0000-00000000005b', 'land_prep', 1, '2025-07-01', '2025-07-10');

-- ما رُفع إلى الدلو: ملفّات الوكيل في مجلّده، وملفٌّ في مجلّد المزارع، وملفٌّ لوكيلٍ آخر.
insert into storage.objects (bucket_id, name, owner) values
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg', 'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/stages/p2.jpg', 'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/stages/p3.jpg', 'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/stages/p9.jpg', 'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'd1000000-0000-0000-0000-0000000000d1/stages/own.jpg', 'd1000000-0000-0000-0000-0000000000d1'),
  ('evidence', 'a2000000-0000-0000-0000-0000000000a2/stages/q.jpg', 'a2000000-0000-0000-0000-0000000000a2');

set role authenticated;

\echo 'أ) من لا إذن له في المواسم لا يكتب فيها'
select _as('a2000000-0000-0000-0000-0000000000a2');
select _refuses($$select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'photo', 'a2000000-0000-0000-0000-0000000000a2/stages/q.jpg', 'تسوية')$$,
                'شركةٌ لم توثَّق لا ترفع دليلاً', 'لا إذن قائماً');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'ولا تعتمد مرحلة', 'لا إذن قائماً');
select _as('a3000000-0000-0000-0000-0000000000a3');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'وإذنٌ في الأراضي وحدها لا يكفي', 'لا إذن قائماً');
select _as('a4000000-0000-0000-0000-0000000000a4');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'وإذنٌ انتهى لا يكفي', 'لا إذن قائماً');
select _as('e9000000-0000-0000-0000-0000000000e9');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'والغريب لا يعتمد', 'لا إذن قائماً');
select _eq((select count(*)::int from agent_farmer_stages('5a000000-0000-0000-0000-00000000005a')), 0, 'ولا يرى مراحل الموسم');
select _as('d1000000-0000-0000-0000-0000000000d1');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'والمزارع لا يمرّ بباب الوكيل', 'هذا موسمك');

\echo 'ب) والوكيل المأذون: في موسمٍ جارٍ، وبالحرّاس نفسها'
select _as('a1000000-0000-0000-0000-0000000000a1');
select _refuses($$select agent_stage_evidence_add('59000000-0000-0000-0000-000000000059', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p9.jpg', 'قديم')$$,
                'موسمٌ أُقفل لا يُكتب فيه', 'ليس جارياً');
select _refuses($$select agent_stage_complete('59000000-0000-0000-0000-000000000059')$$, 'ولا تُعتمد فيه مرحلة', 'ليس جارياً');
select _eq((select count(*)::int from season_stages), 0, 'والوكيل لا يقرأ الجدول مباشرةً');
select _rows($$update season_stages set completed = true where id = '51000000-0000-0000-0000-000000000051'$$, 0,
             'ولا يعتمد بالتحديث المباشر');
select _refuses($$insert into stage_evidence (stage_id, kind, storage_path) values ('51000000-0000-0000-0000-000000000051', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg')$$,
                'ولا يُدرج دليلاً مباشرةً');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$,
                'ولا اعتماد بلا ملفٍّ مرفوع (enforce_stage_completion)', 'قبل رفع ملف');
select _refuses($$select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'photo', 'd1000000-0000-0000-0000-0000000000d1/stages/own.jpg', 'ملف المزارع')$$,
                'ولا مسارَ في غير مجلّده (stage_evidence_insert_gate)', 'ليس في مجلّدك');
select _refuses($$select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/none.jpg', 'لم يُرفع')$$,
                'ولا ملفّاً لم يُرفع', 'لم نجد الملفّ');
select _refuses($$select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'note', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg', 'ملاحظة')$$,
                'ولا نوعاً غير الصورة والفاتورة والمعاينة', 'نوع دليلٍ');
select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg', 'تسوية الأرض');
select agent_stage_evidence_add('51000000-0000-0000-0000-000000000051', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg', 'أُرسلت ثانيةً');
select _refuses($$select agent_stage_evidence_add('52000000-0000-0000-0000-000000000052', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg', 'الصورة نفسها')$$,
                'وصورةٌ واحدة لا تكون دليلاً على مرحلتين', 'مرحلةٍ أخرى');
select agent_stage_evidence_add('52000000-0000-0000-0000-000000000052', 'invoice', 'a1000000-0000-0000-0000-0000000000a1/stages/p2.jpg', 'فاتورة البذور');
select _refuses($$select agent_stage_complete('52000000-0000-0000-0000-000000000052')$$,
                'ولا تُعتمد مرحلةٌ قبل ما سبقها', 'مرحلة سابقة');
select _eq(agent_stage_complete('51000000-0000-0000-0000-000000000051') is not null, true, 'يعتمد المرحلة الأولى وعليها دليله');
select _refuses($$select agent_stage_complete('51000000-0000-0000-0000-000000000051')$$, 'ولا يعتمدها مرّتين', 'من قبل');
select _eq((select count(*)::int from agent_farmer_stages('5a000000-0000-0000-0000-00000000005a')), 3, 'ويرى مراحل الموسم بدالّته');
select _eq((select by_agent from agent_farmer_stages('5a000000-0000-0000-0000-00000000005a') where stage_order = 1), true, 'ومعلَّمةً باعتماده');
select _eq((select evidence_count from agent_farmer_stages('5a000000-0000-0000-0000-00000000005a') where stage_order = 2), 1, 'وبعدد أدلّتها');
reset role;

\echo 'ج) يُعلَّم ويُسجَّل ويُخبَر المزارع'
select _eq((select count(*)::int from stage_evidence where by_mandate = '3a000000-0000-0000-0000-00000000003a'), 2,
           'الدليلان معلَّمان بالإذن، والمُرسَل ثانيةً لم يُكرَّر');
select _eq((select created_by from stage_evidence where storage_path like '%/p1.jpg'), 'a1000000-0000-0000-0000-0000000000a1'::uuid,
           'وكاتبه الوكيل (حارس الإدراج)');
select _eq((select completed_by_mandate from season_stages where id = '51000000-0000-0000-0000-000000000051'),
           '3a000000-0000-0000-0000-00000000003a'::uuid, 'والاعتماد معلَّمٌ بالإذن');
select _eq((select actual_end is not null and completed_at is not null from season_stages where id = '51000000-0000-0000-0000-000000000051'),
           true, 'وبتاريخه');
select _eq((select count(*)::int from agent_actions where subject = 'season_stage' and action = 'complete'
              and subject_id = '51000000-0000-0000-0000-000000000051' and farmer_id = 'd1000000-0000-0000-0000-0000000000d1'
              and agent_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'والاعتماد في السجلّ');
select _eq((select count(*)::int from agent_actions where subject = 'stage_evidence' and action = 'insert'), 2, 'والدليلان');
select _eq((select count(*)::int from notifications where recipient_id = 'd1000000-0000-0000-0000-0000000000d1' and kind = 'agent_mandate'
              and link = '/seasons/5a000000-0000-0000-0000-00000000005a'), 3, 'والمزارع أُخبر بكلّ واحدٍ برابط الموسم');
select _eq((select count(*)::int from notifications where recipient_id = 'd1000000-0000-0000-0000-0000000000d1'
              and title like 'اعتمد وكيلك مرحلةً%' and body like '%جمعيّة المزارعين%'), 1, 'وباسم الوكيل');

set role authenticated;
\echo 'د) والعلامة لا تُكتب باليد، وما اعتُمد لا يُرجَع'
select _as('d1000000-0000-0000-0000-0000000000d1');
select _refuses($$update season_stages set completed_by_mandate = null where id = '51000000-0000-0000-0000-000000000051'$$,
                'المزارع لا يمحو علامة الوكيل عن الاعتماد', 'علامة الوكيل');
select _refuses($$update season_stages set completed = false, completed_at = null, actual_end = null, completed_by_mandate = null
                  where id = '51000000-0000-0000-0000-000000000051'$$,
                'ولا يُرجع المرحلة بالتحديث المباشر', 'علامة الوكيل');
select _refuses($$update season_stages set completed = false, completed_at = null where id = '51000000-0000-0000-0000-000000000051'$$,
                'ولا بغير العلامة (حارس التجميد)', 'لا تُرجَع إلى الفتح');
select _refuses($$insert into stage_evidence (stage_id, kind, storage_path, by_mandate) values ('53000000-0000-0000-0000-000000000053', 'photo',
                  'd1000000-0000-0000-0000-0000000000d1/stages/own.jpg', '3a000000-0000-0000-0000-00000000003a')$$,
                'ولا يكتب علامة الوكيل على دليله هو', 'علامة الوكيل');
select _refuses($$update stage_evidence set by_mandate = null where storage_path like '%/p2.jpg'$$,
                'ولا يمحوها عن دليل الوكيل', 'علامة الوكيل');
select _rows($$insert into stage_evidence (stage_id, kind, storage_path, caption) values ('53000000-0000-0000-0000-000000000053', 'photo',
               'd1000000-0000-0000-0000-0000000000d1/stages/own.jpg', 'صورتي')$$, 1, 'ودليله هو يُدرج كما كان');
select _eq((select count(*)::int from storage.objects where name = 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg'), 1,
           'ويقرأ ملفّ الوكيل على موسمه');
select _as('e9000000-0000-0000-0000-0000000000e9');
select _eq((select count(*)::int from storage.objects where name = 'a1000000-0000-0000-0000-0000000000a1/stages/p1.jpg'), 0,
           'والغريب لا يقرؤه');

\echo 'هـ) الاعتراض: للمزارع وحده، ويفتح المرحلة حين لا يكسر ترتيباً'
select _as('a1000000-0000-0000-0000-0000000000a1');
select _eq(agent_stage_complete('52000000-0000-0000-0000-000000000052') is not null, true, 'الوكيل يعتمد الثانية أيضاً');
select _refuses(format('select agent_write_object(%s, %L)', _act('51000000-0000-0000-0000-000000000051'), 'أعترض على نفسي'),
                'الوكيل لا يعترض', 'لا شيء بهذا');
select _as('e9000000-0000-0000-0000-0000000000e9');
select _refuses(format('select agent_write_object(%s, %L)', _act('51000000-0000-0000-0000-000000000051'), 'لست صاحبه'),
                'والغريب لا يعترض', 'لا شيء بهذا');
select _as('d1000000-0000-0000-0000-0000000000d1');
select _eq((select count(*)::int from agent_actions), 4, 'المزارع يرى سجلّ ما كُتب باسمه');
select _refuses(format('select agent_write_object(%s, %L)', _act('51000000-0000-0000-0000-000000000051'), 'لا'),
                'ولا اعتراض بلا سبب', 'سبب اعتراضك');
select _eq(agent_write_object(_act('51000000-0000-0000-0000-000000000051'), 'لم تُسوَّ الأرض بعد'),
           false, 'اعتراضٌ على الأولى وبعدها معتمدة: يُسجَّل ولا تُفتح');
select _eq((select completed from season_stages where id = '51000000-0000-0000-0000-000000000051'), true, 'فتبقى الأولى معتمدة');
select _eq(agent_write_object(_act('52000000-0000-0000-0000-000000000052'), 'لم أزرع بعد'),
           true, 'واعتراضٌ على الأخيرة المعتمدة يفتحها');
select _eq((select row(completed, completed_at, actual_end, completed_by_mandate)::text from season_stages where id = '52000000-0000-0000-0000-000000000052'),
           row(false, null::timestamptz, null::date, null::uuid)::text, 'مفتوحةً بلا تاريخٍ ولا علامة');
select _refuses(format('select agent_write_object(%s, %L)', _act('52000000-0000-0000-0000-000000000052'), 'مرّةً أخرى'),
                'ولا يُعترض على الشيء مرّتين', 'من قبل');
select _eq((select count(*)::int from agent_objections where farmer_id = 'd1000000-0000-0000-0000-0000000000d1'), 2, 'والاعتراضان في سجلّه');

\echo 'و) ودليل ما اعتُرض عليه يبقى'
select _refuses($$delete from stage_evidence where storage_path like '%/p2.jpg'$$,
                'المزارع لا يحذف دليل الوكيل على مرحلةٍ اعترض عليها ولو فُتحت', 'اعترض عليه المزارع');
select _as('a1000000-0000-0000-0000-0000000000a1');
select _rows($$delete from storage.objects where bucket_id = 'evidence' and name = 'a1000000-0000-0000-0000-0000000000a1/stages/p2.jpg'$$, 0,
             'والوكيل لا يسحب ملفّه من مجلّده');
select _refuses($$select agent_stage_complete('52000000-0000-0000-0000-000000000052')$$,
                'ولا يعتمد ثانيةً ما اعترض عليه المزارع', 'يعتمدها هو بنفسه');
select agent_stage_evidence_add('53000000-0000-0000-0000-000000000053', 'photo', 'a1000000-0000-0000-0000-0000000000a1/stages/p3.jpg', 'ريّ');
select _rows($$delete from storage.objects where bucket_id = 'evidence' and name = 'a1000000-0000-0000-0000-0000000000a1/stages/p3.jpg'$$, 1,
             'وما لم يُعتمد عليه ولا اعتُرض عليه يسحبه كما كان');
select _as('d1000000-0000-0000-0000-0000000000d1');
select _eq(agent_write_object((select a.id from agent_actions a join stage_evidence e on e.id = a.subject_id where e.storage_path like '%/p1.jpg'),
                              'الصورة ليست من أرضي'), false, 'والاعتراض على دليلٍ يُسجَّل');
select _eq((select stage_evidence_objected(id) from stage_evidence where storage_path like '%/p1.jpg'), true, 'ويصير معترَضاً عليه');
select _eq((select stage_evidence_objected(id) from stage_evidence where storage_path like '%/own.jpg'), false, 'ودليل المزارع ليس كذلك');
select _rows($$update season_stages set completed = true, actual_end = current_date where id = '52000000-0000-0000-0000-000000000052'$$, 1,
             'والمزارع يعتمد المرحلة المفتوحة بنفسه');
select _eq((select completed_by_mandate from season_stages where id = '52000000-0000-0000-0000-000000000052'), null::uuid, 'فتكون باسمه');
reset role;
select _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and kind = 'agent_mandate'
              and link = '/agent/d1000000-0000-0000-0000-0000000000d1'), 3, 'والوكيل أُخبر بكلّ اعتراض');
select _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and body like '%لم أزرع بعد%أُعيد فتح%'), 1,
           'بسببه، وبأنّ المرحلة فُتحت');

\echo 'ز) والسجلّ يُلحَق ولا يُعدَّل'
set role authenticated;
select _as('d1000000-0000-0000-0000-0000000000d1');
select _refuses($$insert into agent_objections (action_id, mandate_id, farmer_id, agent_id, reason)
                  select id, mandate_id, farmer_id, agent_id, 'اعتراضٌ بيدي' from agent_actions where subject = 'stage_evidence' limit 1$$,
                'لا يُكتب الاعتراض بغير دالّته');
select _refuses($$delete from agent_objections$$, 'ولا يحذفه المزارع');
select _as('a1000000-0000-0000-0000-0000000000a1');
select _refuses($$update agent_actions set subject_id = gen_random_uuid()$$, 'والوكيل لا يعدّل سجلّه');
reset role;
select _refuses($$update agent_objections set reason = 'غيّرته'$$, 'ولا أحدٌ يعدّل الاعتراض، ولو صاحب العنقود', 'يُلحَق ولا يُعدَّل');
select _refuses($$delete from agent_actions$$, 'ولا يحذف السجلّ', 'يُلحَق ولا يُعدَّل');

\echo 'ح) والصلاحيّات'
do $$ begin
  perform _eq(has_function_privilege('anon', 'public.agent_stage_complete(uuid)', 'execute'), false, 'الزائر لا يعتمد');
  perform _eq(has_function_privilege('anon', 'public.agent_stage_evidence_add(uuid, text, text, text, timestamptz, double precision, double precision)', 'execute'),
              false, 'ولا يرفع');
  perform _eq(has_function_privilege('anon', 'public.agent_write_object(bigint, text)', 'execute'), false, 'ولا يعترض');
  perform _eq(has_function_privilege('anon', 'public.agent_farmer_stages(uuid)', 'execute'), false, 'ولا يقرأ المراحل');
  perform _eq(has_function_privilege('authenticated', 'public.agent_season_for_stage(uuid)', 'execute'), false, 'والعضو لا ينادي الفحص الداخليّ');
  perform _eq(has_function_privilege('authenticated', 'public.agent_stage_complete(uuid)', 'execute'), true, 'والعضو ينادي الدوالّ وكلٌّ تفحص المنادي');
end $$;

do $$ declare f integer; p integer; begin
  select fails, passes into f, p from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED (%)', p; else raise exception '% CHECK(S) FAILED (% passed)', f, p; end if;
end $$;
