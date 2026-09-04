-- بوّابةُ الجاهزيّة: تعمل على المسوّدة، وتُجمَّد بالإرسال، ولا تُخفي الناقص.
--
-- WHAT IS ACTUALLY BEING TESTED
--
-- Not arithmetic. The percentage is the least interesting thing here and the
-- easiest to get right. What matters is whether the number can be *trusted* by
-- the two people who read it:
--
--   • the farmer, before submitting — so it has to work on a draft, off the
--     corridor's live rules, or it is a checklist that only appears once the
--     checklist is too late to use;
--   • the buyer, after publication — so a missing required document has to
--     make `ready` false no matter how flattering the percentage is, and the
--     rules must be the ones frozen at submission, not today's.
--
-- And one thing it must not do: leak. The detail function is `security
-- definer`, so its own WHERE clause is the entire boundary between a buyer
-- reading a published offer's checklist and a stranger enumerating everyone's
-- drafts by guessing ids.

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

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('fa000000-0000-0000-0000-0000000000fa', 'صاحبُ العرض',   'investor'),
  ('bb000000-0000-0000-0000-0000000000bb', 'فضوليّ',         'investor');

-- ممرٌّ بقواعدَ نعرفها: إلزاميّان، وشرطيّ، ومستحسَن.
do $$
declare v_corridor uuid; v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid;
begin
  select id into v_corridor from export_corridors limit 1;

  insert into export_document_types (code, name_ar, note_ar) values
    ('t_origin',  'شهادة المنشأ',            'تُصدرها الغرفةُ التجارية'),
    ('t_phyto',   'الشهادة الصحّية النباتية', null),
    ('t_quality', 'تقرير فحص الجودة',        null),
    ('t_insure',  'وثيقة التأمين',           null)
  on conflict (code) do nothing;

  select id into v_d1 from export_document_types where code = 't_origin';
  select id into v_d2 from export_document_types where code = 't_phyto';
  select id into v_d3 from export_document_types where code = 't_quality';
  select id into v_d4 from export_document_types where code = 't_insure';

  delete from export_corridor_requirements where corridor_id = v_corridor;
  insert into export_corridor_requirements (corridor_id, document_type_id, mode, effective_from) values
    (v_corridor, v_d1, 'required',    date '2020-01-01'),
    (v_corridor, v_d2, 'required',    date '2020-01-01'),
    (v_corridor, v_d3, 'conditional', date '2020-01-01'),
    (v_corridor, v_d4, 'recommended', date '2020-01-01');
end $$;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) المسوّدة — والقائمةُ تظهر قبل الإرسال لا بعده'
\echo '=========================================================================='

do $$
declare v_corridor uuid; v_uom text;
begin
  select id into v_corridor from export_corridors limit 1;
  select code into v_uom from export_uom limit 1;

  insert into export_offers (id, reference, owner_id, corridor_id, quantity, uom_code,
                             unit_price_minor, value_minor, status)
  values ('0f000000-0000-0000-0000-00000000000d', 'RD-DRAFT',
          'fa000000-0000-0000-0000-0000000000fa', v_corridor, 10, v_uom,
          1000, 10000, 'draft');

  perform _eq((select source from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    'live', 'المسوّدةُ تقرأ قواعدَ الممرّ الحيّة — فالقائمةُ تنفع قبل الإرسال');

  perform _eq((select count(*)::int from export_offer_readiness_detail('0f000000-0000-0000-0000-00000000000d')),
    4, 'وأربعةُ مستنداتٍ في التفصيل');

  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    false, 'وليست جاهزةً — ولا مستندَ واحدٌ بعد');
  perform _eq((select score from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    0, 'والنسبةُ صفر');
  perform _eq((select array_length(missing, 1) from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    4, 'وأربعةٌ ناقصة — بأسمائها');
  perform _eq((select missing[1] from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    'الشهادة الصحّية النباتية',
    'والأثقلُ أوّلاً — فالخطوةُ التالية في أعلى القائمة');

  -- والشرحُ يخرج مع الاسم. الشاشةُ تعرض «شهادة المنشأ» ثمّ سطراً يقول ما هي
  -- ومن يصدرها، ولو لزم استعلامٌ ثانٍ لأنواع المستندات لعادت الشاشةُ إلى
  -- قائمتين تُطابَقان بالعين — وهو العطبُ الذي بُنيت هذه الدالّةُ لإزالته.
  perform _eq((select note_ar from export_offer_readiness_detail('0f000000-0000-0000-0000-00000000000d')
                where code = 't_origin'),
    'تُصدرها الغرفةُ التجارية', 'ويخرج شرحُ المستند معه لا في استعلامٍ ثانٍ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) ويرفع مستنداً مستنداً — والنسبةُ تتحرّك، والجاهزيّةُ لا'
\echo '=========================================================================='

do $$
declare v_d1 uuid; v_d2 uuid; v_d3 uuid;
begin
  select id into v_d1 from export_document_types where code = 't_origin';
  select id into v_d2 from export_document_types where code = 't_phyto';
  select id into v_d3 from export_document_types where code = 't_quality';

  insert into export_offer_evidence (offer_id, kind, storage_path, document_type_id)
  values ('0f000000-0000-0000-0000-00000000000d', 'document',
          'fa000000-0000-0000-0000-0000000000fa/origin.pdf', v_d1);

  -- ١٠٠ من ٢٧٠ = ٣٧٪
  perform _eq((select score from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    37, 'شهادةُ المنشأ ترفع النسبة');
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    false, 'ولا تجعله جاهزاً — إلزاميٌّ آخرُ ناقص');

  -- والشرطيُّ والمستحسَنُ يرفعان النسبةَ ولا يصنعان جاهزيّة.
  insert into export_offer_evidence (offer_id, kind, storage_path, document_type_id)
  values ('0f000000-0000-0000-0000-00000000000d', 'document',
          'fa000000-0000-0000-0000-0000000000fa/quality.pdf', v_d3);

  -- ١٥٠ من ٢٧٠ = ٥٦٪
  perform _eq((select score from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    56, 'وتقريرُ الجودة يرفعها أكثر');
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    false,
    'وما يزال غيرَ جاهز — وهذا سببُ الرقمين: ٥٦٪ لا تعني نصفَ شحنة');

  -- والإلزاميُّ الأخير هو الذي يقلب الحكم.
  insert into export_offer_evidence (offer_id, kind, storage_path, document_type_id)
  values ('0f000000-0000-0000-0000-00000000000d', 'document',
          'fa000000-0000-0000-0000-0000000000fa/phyto.pdf', v_d2);

  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    true, 'فلمّا اكتمل الإلزاميّان صار جاهزاً');
  perform _eq((select score from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    93, 'والنسبةُ ٩٣ لا ١٠٠ — فالمستحسَنُ ما يزال ناقصاً');
  perform _eq((select array_length(missing, 1) from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    1, 'وواحدٌ ناقصٌ يُذكر ولو لم يمنع الشحن');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والأوزانُ بياناتٌ — يغيّرها المديرُ بلا نشر'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  update export_readiness_weights set weight = 60 where mode = 'recommended';

  -- ٢٥٠ من ٣١٠ = ٨١٪
  perform _eq((select score from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    81, 'رفعُ وزن المستحسَن يخفض النسبة — قاعدةُ عملٍ في صفٍّ لا في كود');
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    true, 'ولا يمسّ الجاهزيّة — فهي عن الإلزاميّ وحده');

  update export_readiness_weights set weight = 20 where mode = 'recommended';
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) والإرسالُ يجمّد القواعد — فلا تتغيّر تحت العرض'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
begin
  update export_offers set status = 'submitted', submitted_at = now()
   where id = '0f000000-0000-0000-0000-00000000000d';

  perform _eq((select source from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    'frozen', 'وبالإرسال صارت القواعدُ مجمَّدة');
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    true, 'والحكمُ كما كان لحظةَ الإرسال');
end $$;

-- والآن تتغيّر قواعدُ الممرّ بيد الإدارة. وتبديلُ الدور يجري هنا لا داخل
-- كتلةٍ إجرائيّة: `set role` داخل `DO` لا يبدّل دورَ الجلسة كما يبدو أنّه يفعل،
-- فبقيتُ مزارعاً وأنا أظنّني مديراً — وكشفته السياسةُ برفض الإدراج.
reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
declare v_corridor uuid; v_d5 uuid;
begin
  select id into v_corridor from export_corridors limit 1;
  insert into export_document_types (code, name_ar) values ('t_new', 'شهادةٌ استُحدثت لاحقاً')
    on conflict (code) do nothing;
  select id into v_d5 from export_document_types where code = 't_new';
  insert into export_corridor_requirements (corridor_id, document_type_id, mode, effective_from)
  values (v_corridor, v_d5, 'required', current_date);
end $$;

reset role;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    true, 'وقاعدةٌ استُحدثت بعده لا تُسقطه');
  perform _eq((select count(*)::int from export_offer_readiness_detail('0f000000-0000-0000-0000-00000000000d')),
    4, 'وتفصيلُه أربعةٌ كما جُمِّد لا خمسة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) والمشتري يرى الحالةَ لا الملفّات'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$
begin
  update export_offers set status = 'published', reviewed_at = now(), reviewed_by = auth.uid()
   where id = '0f000000-0000-0000-0000-00000000000d';
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;

do $$
begin
  perform _eq((select ready from export_offer_readiness('0f000000-0000-0000-0000-00000000000d')),
    true, 'زائرٌ بلا حساب يرى جاهزيّةَ العرض المنشور');
  perform _eq((select count(*)::int from export_offer_readiness_detail('0f000000-0000-0000-0000-00000000000d')),
    4, 'ويرى أيَّ المستندات موجودٌ وأيُّها ناقص');

  /*
   * وهنا صحّحتُ توقّعي بعد قراءة السياسة.
   *
   * توقّعتُ ألّا يرى الزائرُ صفوفَ الأدلّة أصلاً، ففشل الفحص. وسياسةُ القراءة
   * على الجداول التابعة تقول غيرَ ذلك صراحةً: مَن يرى العرضَ يرى تفاصيلَه —
   * `o.status = 'published'` تكفي.
   *
   * وهو الصواب: المشتري يحتاج أن يعرف أنّ **دليلاً موجود**، وإلّا لم تكن
   * «٩٣٪» إلّا دعوى. والفصلُ الحقيقيُّ ليس في الصفّ بل في الملفّ: الدلوُ خاصّ،
   * و`evidence_read_own` تقصر قراءتَه على صاحبه والإدارة — فيُعرف وجودُ
   * الدليل ولا يُسلَّم قبل الاتّفاق. وذلك مُثبَتٌ في بوّابة قفل الأدلّة.
   *
   * و`storage_path` يحمل معرّفَ صاحبه، لكنّ `owner_id` منشورٌ أصلاً على صفّ
   * العرض المنشور — فلا يُفشي المسارُ جديداً.
   */
  perform _eq((select count(*)::int from export_offer_evidence), 3,
    'ويرى أنّ الأدلّةَ موجودة — وإلّا كانت النسبةُ دعوى');
end $$;

reset role;

\echo ''
\echo '=========================================================================='
\echo 'و) ولا تُستعمل الدالّةُ لتعداد عروض الناس'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
declare v_corridor uuid; v_uom text;
begin
  select id into v_corridor from export_corridors limit 1;
  select code into v_uom from export_uom limit 1;
  insert into export_offers (id, reference, owner_id, corridor_id, quantity, uom_code,
                             unit_price_minor, value_minor, status)
  values ('0f000000-0000-0000-0000-00000000000c', 'RD-SECRET',
          'fa000000-0000-0000-0000-0000000000fa', v_corridor, 10, v_uom,
          1000, 10000, 'draft');
end $$;

reset role;
do $$ begin perform _act_as('bb000000-0000-0000-0000-0000000000bb'); end $$;
set role authenticated;

do $$
begin
  -- الدالّةُ `security definer`، فحاجزُها الداخليُّ هو الحدُّ كلُّه. ولولاه
  -- لَكشفت مسوّداتِ الناس لمن يخمّن معرّفاً.
  perform _eq((select count(*)::int from export_offer_readiness_detail('0f000000-0000-0000-0000-00000000000c')),
    0, 'وفضوليٌّ يخمّن معرّفاً لا يرى مسوّدةَ غيره');
  perform _eq((select source from export_offer_readiness('0f000000-0000-0000-0000-00000000000c')),
    'none', 'ولا يعرف حتى أنّ لها قواعد');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — الجاهزيّةُ تُحسب وتُفصَّل ولا تُسرّب';
end $$;
