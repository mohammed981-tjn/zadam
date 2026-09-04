-- رحلةُ الأرض والموسم: من قطعةٍ غير موثّقة إلى سجلِّ موسمٍ مكتمل.
--
-- WHY THIS COMPLETES THE SET
--
-- The study names four areas for this phase — الأرض والموسم والاستثمار
-- والتصدير. Export and investment now have journeys; this is the last, and the
-- one that carries the platform's actual thesis: a farmer's record is worth
-- something because it was **proved as it happened**, not asserted afterwards.
--
-- So the checks below are mostly about the two gates that make that true, and
-- about the fact that a farmer can still get through them:
--
--   • a land cannot be listed unverified, or with its paperwork incomplete —
--     and the farmer cannot verify or list it themselves;
--   • a stage cannot be marked done without a file, and not before the stage
--     ahead of it.
--
-- Both refuse. The point of this gate is that both also **let the right person
-- through**, in order, without a single step being silently filtered away.

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

create or replace function _does(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _fail(label, 'رُفض: ' || sqlerrm);
    return;
  end;
  if touched > 0 then perform _pass(label || ' — مسّ ' || touched || ' صفّاً');
  else perform _fail(label, 'نُفِّذ ولم يمسّ صفّاً — سياسةٌ رشّحت كلَّ شيء بصمت');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('fa000000-0000-0000-0000-0000000000fa', 'صاحبُ الأرض',   'investor');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) يسجّل أرضه — غيرَ موثّقة، وهذا هو الصواب'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
begin
  perform _does($f$
    insert into lands (id, owner_id, name, state, locality, feddans,
                       station_key, water_source, tenure)
    values ('1a000000-0000-0000-0000-0000000000fa',
            'fa000000-0000-0000-0000-0000000000fa',
            'قطعة الشوّال', 'الجزيرة', 'الحصاحيصا', 12,
            'wad_medani', 'canal', 'freehold')$f$,
    'يسجّل أرضه');

  perform _eq((select verification from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 'unverified',
    'وتبدأ غيرَ موثّقة');
  perform _eq((select listed from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), false,
    'وغيرَ منشورة');
  perform _eq((select documents_on_file::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 0,
    'وبلا مستندات — والعددُ محسوبٌ لا مكتوب');

  -- ولا يوثّق نفسَه ولا ينشر: هذا هو معنى «الإثبات» في المنصّة.
  perform _refuses($f$
    update lands set verification = 'verified'
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'ولا يوثّق أرضَه بنفسه');
  perform _refuses($f$
    update lands set listed = true
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'ولا ينشرها بنفسه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) ويرفع أوراقها — والعددُ يُحسب، ولا يُصدَّق ما يُكتب'
\echo '=========================================================================='

do $$
begin
  perform _does($f$
    insert into land_documents (land_id, kind, storage_path)
    values ('1a000000-0000-0000-0000-0000000000fa', 'title_deed',
            'fa000000-0000-0000-0000-0000000000fa/land/deed.pdf')$f$,
    'يرفع صكّاً');

  perform _eq((select documents_on_file::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 1,
    'فيرتفع العدّاد وحدَه');

  -- ثلاثُ نسخٍ من النوع نفسِه وثيقةٌ واحدة. وهذا هو الفرقُ بين «رفعتُ ثلاثة
  -- ملفّات» و«أثبتُّ ثلاثةَ أشياء».
  perform _does($f$
    insert into land_documents (land_id, kind, storage_path)
    values ('1a000000-0000-0000-0000-0000000000fa', 'title_deed',
            'fa000000-0000-0000-0000-0000000000fa/land/deed-2.pdf')$f$,
    'ويرفع نسخةً ثانيةً من النوع نفسِه');
  perform _eq((select documents_on_file::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 1,
    'ولا يرتفع العدّاد — الأنواعُ تُعدّ لا الملفّات');

  perform _does($f$
    insert into land_documents (land_id, kind, storage_path) values
      ('1a000000-0000-0000-0000-0000000000fa', 'survey',
       'fa000000-0000-0000-0000-0000000000fa/land/survey.pdf'),
      ('1a000000-0000-0000-0000-0000000000fa', 'tenancy',
       'fa000000-0000-0000-0000-0000000000fa/land/tenancy.pdf')$f$,
    'ويكمل النوعين الباقيين');
  perform _eq((select documents_on_file::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 3,
    'فيكتمل التوثيق — ثلاثةٌ من ثلاثة');

  -- ولو زوّر العدّاد بيده، فُرض عليه الصحيحُ قبل الحفظ.
  perform _does($f$
    update lands set documents_on_file = 99
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'ويحاول كتابةَ العدّاد بيده');
  perform _eq((select documents_on_file::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 3,
    'فيُعاد إلى الحقيقة — العددُ لا يُملى من الخارج');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والموظّف يوثّق ثمّ ينشر — بهذا الترتيب لا بغيره'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  -- النشرُ قبل التوثيق مرفوض، ولو اكتملت الأوراق.
  perform _refuses($f$
    update lands set listed = true
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'ولا يُنشر ما لم يُوثَّق — ولو اكتملت أوراقُه');

  perform _does($f$
    update lands set verification = 'verified'
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'الموظّفُ يوثّق');

  perform _does($f$
    update lands set listed = true
     where id = '1a000000-0000-0000-0000-0000000000fa'$f$,
    'ثمّ ينشر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) ثمّ الموسم — ومرحلةٌ لا تُعتمد بلا دليل'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
begin
  perform _does($f$
    insert into seasons (id, owner_id, land_id, name, crop_key, station_key,
                         irrigation, feddans, planting_date)
    values ('5e000000-0000-0000-0000-0000000000fa',
            'fa000000-0000-0000-0000-0000000000fa',
            '1a000000-0000-0000-0000-0000000000fa',
            'سمسم ٢٠٢٦', 'sesame', 'wad_medani', 'canal', 12, date '2026-06-15')$f$,
    'يفتح موسماً على أرضه');

  perform _does($f$
    insert into season_stages (id, season_id, stage_key, stage_order,
                               planned_start, planned_end) values
      ('50000000-0000-0000-0000-000000000001',
       '5e000000-0000-0000-0000-0000000000fa', 'land_prep', 1,
       date '2026-06-01', date '2026-06-14'),
      ('50000000-0000-0000-0000-000000000002',
       '5e000000-0000-0000-0000-0000000000fa', 'planting', 2,
       date '2026-06-15', date '2026-06-20')$f$,
    'ويضع مرحلتين');

  -- بلا دليلٍ مرفوع: ملاحظةٌ نصيّةٌ ليست إثباتاً.
  perform _refuses($f$
    update season_stages set completed = true
     where id = '50000000-0000-0000-0000-000000000001'$f$,
    'ولا يعتمد مرحلةً بلا ملفٍّ مرفوع');

  perform _does($f$
    insert into stage_evidence (stage_id, kind, storage_path, caption)
    values ('50000000-0000-0000-0000-000000000001', 'photo',
            'fa000000-0000-0000-0000-0000000000fa/season/prep.jpg',
            'تجهيز الأرض')$f$,
    'فيرفع صورةً للمرحلة');

  perform _does($f$
    update season_stages set completed = true
     where id = '50000000-0000-0000-0000-000000000001'$f$,
    'ثمّ يعتمدها');

  perform _eq((select completed_at is not null from season_stages
                where id = '50000000-0000-0000-0000-000000000001'), true,
    'ووقتُ الاعتماد يُختم من الساعة لا من الشاشة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) والترتيبُ محفوظ — ولا يُقفز فوق مرحلة'
\echo '=========================================================================='

do $$
begin
  perform _does($f$
    insert into season_stages (id, season_id, stage_key, stage_order,
                               planned_start, planned_end)
    values ('50000000-0000-0000-0000-000000000003',
            '5e000000-0000-0000-0000-0000000000fa', 'harvest', 3,
            date '2026-10-01', date '2026-10-20')$f$,
    'يضيف مرحلةَ الحصاد');

  perform _does($f$
    insert into stage_evidence (stage_id, kind, storage_path)
    values ('50000000-0000-0000-0000-000000000003', 'photo',
            'fa000000-0000-0000-0000-0000000000fa/season/harvest.jpg')$f$,
    'ويرفع دليلَها');

  -- الدليلُ موجود، لكنّ المرحلةَ الثانيةَ ما تزال مفتوحة.
  perform _refuses($f$
    update season_stages set completed = true
     where id = '50000000-0000-0000-0000-000000000003'$f$,
    'ولا يعتمد الحصادَ والزراعةُ لم تُعتمد بعد');

  -- فيمشي بالترتيب.
  perform _does($f$
    insert into stage_evidence (stage_id, kind, storage_path)
    values ('50000000-0000-0000-0000-000000000002', 'photo',
            'fa000000-0000-0000-0000-0000000000fa/season/planting.jpg')$f$,
    'فيرفع دليلَ الزراعة');
  perform _does($f$
    update season_stages set completed = true
     where id = '50000000-0000-0000-0000-000000000002'$f$,
    'ويعتمدها');
  perform _does($f$
    update season_stages set completed = true
     where id = '50000000-0000-0000-0000-000000000003'$f$,
    'ثمّ يعتمد الحصاد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) والدفترُ — ومزارعٌ آخر لا يرى شيئاً'
\echo '=========================================================================='

do $$
begin
  perform _does($f$
    insert into ledger_entries (season_id, stage_id, category, amount, description)
    values ('5e000000-0000-0000-0000-0000000000fa',
            '50000000-0000-0000-0000-000000000001', 'seeds', 45000,
            'تقاوي سمسم')$f$,
    'يقيّد مصروفَ التقاوي');

  perform _eq((select count(*)::int from ledger_entries), 1, 'ويرى دفترَه');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select count(*)::int from lands
                where id = '1a000000-0000-0000-0000-0000000000fa'), 1,
    'والموظّفُ يرى الأرض');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;

/*
 * وهنا صحّحتُ توقّعي بعد قراءة السياسة.
 *
 * ظننتُ أنّ صفَّ الأرض يبقى خاصّاً بصاحبه دائماً، فكتبتُ الفحصَ على ذلك وفشل.
 * والسياسةُ تقول غيرَ ذلك صراحةً:
 *
 *   lands_public_read — to authenticated, anon
 *     using (listed and verification = 'verified')
 *
 * أي أنّ النشرَ **يجعل الصفَّ عامّاً** — وهو المقصود: أرضٌ نُشرت ولم يرها أحد
 * ليست منشورة. والشرطان مجتمعان: منشورةٌ **و**موثّقة. فالفحصُ الصحيح أن يراها
 * الزائر، وألّا يرى ما تحتها.
 */
do $$
begin
  perform _eq((select count(*)::int from lands), 1,
    'وزائرٌ بلا حساب يرى الأرضَ المنشورةَ الموثّقة — وهذه وظيفةُ النشر');

  -- أمّا ما دونها فلا: الدفترُ والمستنداتُ والمواسمُ تتبع المِلكيّة وحدها.
  perform _eq((select count(*)::int from ledger_entries), 0,
    'ولا يرى دفترَ الموسم');
  perform _eq((select count(*)::int from land_documents), 0,
    'ولا مستنداتِ الأرض');
  perform _eq((select count(*)::int from seasons), 0,
    'ولا مواسمَها');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً — رحلةٌ لا تكتمل.', n; end if;
  raise notice 'ALL CHECKS PASSED — رحلةُ الأرض والموسم تكتمل';
end $$;
