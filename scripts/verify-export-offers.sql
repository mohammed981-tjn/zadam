-- بوّابةُ عبورٍ لممرّ الصادر: كلُّ حارسٍ يُجرَّب بما وُضع لمنعه.
--
-- تُشغَّل من scripts/verify-export-offers.sh على قاعدةٍ نظيفة.
--
-- WHY EVERY CHECK HERE IS A REFUSAL
--
-- A constraint that has never refused anything is a constraint nobody has
-- tested — it may be misspelled, scoped to the wrong column, or shadowed by a
-- default that keeps it from ever being reached. So each guard below is handed
-- exactly the row it exists to reject, and the check passes only when the
-- database says no.
--
-- والصلاحياتُ تُفحص بدورٍ عاديّ لا بالمالك: المستخدمُ الخارقُ يتجاوز سياسات
-- الصفوف كلَّها، ففحصُها به يُنتج نجاحاً لا يعني شيئاً.

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
begin
  raise notice '  PASS  %', label;
end $$;

/* Runs `stmt` and expects the database to refuse it. */
create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform _pass(label || ' — رُفض');
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

/* Runs `stmt` and expects it to succeed. */
create or replace function _accepts(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform _fail(label, 'رُفض وكان يجب أن يُقبل: ' || sqlerrm);
    return;
  end;
  perform _pass(label);
end $$;

/*
 * Runs `stmt` and expects it to change nothing.
 *
 * THIS IS NOT THE SAME CHECK AS _refuses, AND THE DIFFERENCE IS THE WHOLE
 * POINT OF ROW-LEVEL SECURITY.
 *
 * A policy does not raise. An UPDATE whose USING clause matches no row simply
 * updates no rows and reports success — so a caller that only watches for an
 * exception cannot tell a refusal from a write. That is the exact failure this
 * platform has hit before, where a non-admin POST was answered with "saved"
 * over a write RLS had silently dropped.
 *
 * So permission checks assert on the row count, never on an exception.
 */
create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare n integer;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    perform _pass(label || ' — رُفض باستثناء');
    return;
  end;
  if n = 0 then
    perform _pass(label || ' — لم يمسّ صفّاً');
  else
    perform _fail(label, 'غيّر ' || n || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    perform _pass(label || ' — ' || coalesce(got::text,'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text,'null') || ' والمتوقَّع ' || coalesce(want::text,'null'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ممثّلون
-- ---------------------------------------------------------------------------

insert into profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'farmer'),
  ('22222222-2222-2222-2222-222222222222', 'farmer'),
  ('33333333-3333-3333-3333-333333333333', 'admin')
on conflict (id) do nothing;

create or replace function _act_as(who uuid) returns void
language sql as $$ update _who set uid = who $$;

-- درجاتٌ لسلعتين، لاختبار «درجةٌ من سلعةٍ أخرى».
insert into export_commodity_grades (commodity_id, code, name_ar)
select id, 'hashab_1', 'هشاب ١' from export_commodities where code = 'gum_arabic'
on conflict do nothing;
insert into export_commodity_grades (commodity_id, code, name_ar)
select id, 'whole_white', 'أبيض كامل' from export_commodities where code = 'sesame'
on conflict do nothing;

\echo ''
\echo '=========================================================================='
\echo 'أ) المرجعيات بُذرت'
\echo '=========================================================================='

do $$
begin
  perform _eq((select count(*)::int from export_uom), 4, 'وحداتُ القياس');
  perform _eq((select count(*)::int from export_corridors), 9, 'الممرّات');
  perform _eq(
    (select default_uom_code from export_commodities where code = 'live_sheep'),
    'head', 'الضأنُ افتراضُه بالرأس');
  perform _eq(
    (select default_uom_code from export_commodities where code = 'gum_arabic'),
    'ton', 'والصمغُ بالطنّ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الكمّية والقيمة'
\echo '=========================================================================='

do $$
declare c uuid; g uuid;
begin
  select cr.id into c from export_corridors cr
    join export_commodities co on co.id = cr.commodity_id
    join export_destinations d on d.id = cr.destination_id
   where co.code = 'gum_arabic' and d.code = 'EU';
  select id into g from export_commodity_grades where code = 'hashab_1';

  -- ٧٫٥ طنّ × ٣٢٠٠٠٠ سنت = ٢٤٠٠٠٠٠
  perform _accepts(format($f$
    insert into export_offers (reference, owner_id, corridor_id, grade_id,
      quantity, uom_code, unit_price_minor, value_minor)
    values ('EXP-DEC', '11111111-1111-1111-1111-111111111111', %L, %L,
            7.5, 'ton', 320000, 2400000)
  $f$, c, g), 'عرضٌ بكمّيةٍ عشرية');

  perform _eq((select quantity from export_offers where reference = 'EXP-DEC'),
              7.5000::numeric(16,4),
              'والعشريّةُ تعبر كما هي — لا تُدوَّر إلى ٨ ولا ٧');

  perform _refuses(format($f$
    insert into export_offers (reference, owner_id, corridor_id,
      quantity, uom_code, unit_price_minor, value_minor)
    values ('EXP-BADVAL', '11111111-1111-1111-1111-111111111111', %L,
            7.5, 'ton', 320000, 999)
  $f$, c), 'قيمةٌ لا توازن الكمّيةَ في السعر');

  perform _refuses(format($f$
    insert into export_offers (reference, owner_id, corridor_id,
      quantity, uom_code, unit_price_minor, value_minor)
    values ('EXP-ZERO', '11111111-1111-1111-1111-111111111111', %L,
            0, 'ton', 320000, 0)
  $f$, c), 'كمّيةٌ صفر');

  -- الدرجةُ من سلعةٍ أخرى: كلا الصفّين موجودٌ وصحيحٌ في ذاته، والخطأُ في الموضع.
  perform _refuses(format($f$
    insert into export_offers (reference, owner_id, corridor_id, grade_id,
      quantity, uom_code, unit_price_minor, value_minor)
    values ('EXP-XGRADE', '11111111-1111-1111-1111-111111111111', %L,
            (select id from export_commodity_grades where code = 'whole_white'),
            1, 'ton', 100, 100)
  $f$, c), 'درجةٌ تخصّ سلعةً أخرى');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الوحدةُ افتراضيةٌ لا مفروضة — طلبُ المالك'
\echo '=========================================================================='

do $$
declare sheep uuid;
begin
  select cr.id into sheep from export_corridors cr
    join export_commodities co on co.id = cr.commodity_id
   where co.code = 'live_sheep';

  perform _accepts(format($f$
    insert into export_offers (reference, owner_id, corridor_id,
      quantity, unit_price_minor, value_minor)
    values ('EXP-SHEEP', '11111111-1111-1111-1111-111111111111', %L,
            300, 12000, 3600000)
  $f$, sheep), 'عرضُ ضأنٍ بلا ذكر وحدة');

  perform _eq((select uom_code from export_offers where reference = 'EXP-SHEEP'),
              'head', 'فتُملأ من السلعة — بالرأس');

  -- والمخالفةُ مقبولة: هذا هو «الاختياريّ» بعينه.
  perform _accepts(format($f$
    insert into export_offers (reference, owner_id, corridor_id,
      quantity, uom_code, unit_price_minor, value_minor)
    values ('EXP-SHEEP-KG', '11111111-1111-1111-1111-111111111111', %L,
            9000, 'kg', 400, 3600000)
  $f$, sheep), 'وضأنٌ آخر بالكيلو — صفٌّ لا إصدار');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) المنشأ والأدلّة'
\echo '=========================================================================='

do $$
declare o uuid;
begin
  select id into o from export_offers where reference = 'EXP-DEC';

  perform _accepts(format($f$
    insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude)
    values (%L, 'KRD-11', 2.4, 13.183333, 30.216667)
  $f$, o), 'قطعةٌ دون ٤ هكتارات بنقطةٍ فقط');

  perform _refuses(format($f$
    insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude)
    values (%L, 'KRD-12', 9.1, 13.2, 30.2)
  $f$, o), 'قطعةٌ فوق ٤ هكتارات بلا مضلَّع');

  perform _accepts(format($f$
    insert into export_offer_origins (offer_id, plot_ref, area_hectares, latitude, longitude, boundary)
    values (%L, 'KRD-13', 9.1, 13.2, 30.2, '{"type":"Polygon"}'::jsonb)
  $f$, o), 'والمضلَّعُ يفتحها');

  perform _refuses(format($f$
    insert into export_offer_origins (offer_id, plot_ref, latitude, longitude)
    values (%L, 'KRD-14', 99, 30.2)
  $f$, o), 'خطُّ عرضٍ خارج المدى');

  perform _accepts(format($f$
    insert into export_offer_evidence (offer_id, kind, storage_path, sha256)
    values (%L, 'milestone', 'evidence/9f3a/stage-1.jpg',
            '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  $f$, o), 'دليلٌ ببصمةٍ سليمة');

  perform _refuses(format($f$
    insert into export_offer_evidence (offer_id, kind, storage_path, sha256)
    values (%L, 'milestone', 'evidence/x.jpg', 'not-a-hash')
  $f$, o), 'بصمةٌ مشوّهة — وقبولُها يجعل الحقلَ زينة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) سلسلةُ العهدة تُلحَق ولا تُعدَّل'
\echo '=========================================================================='

do $$
declare o uuid;
begin
  select id into o from export_offers where reference = 'EXP-DEC';

  perform _accepts(format($f$
    insert into export_offer_custody (offer_id, sequence, occurred_at, place_name, latitude, longitude)
    values (%L, 1, now(), 'مزرعةُ المنشأ — كردفان', 13.183333, 30.216667)
  $f$, o), 'حدثُ عهدةٍ يُلحَق');

  perform _refuses(format($f$
    insert into export_offer_custody (offer_id, sequence, occurred_at, place_name)
    values (%L, 1, now(), 'مكرَّر')
  $f$, o), 'ورقمُ تسلسلٍ مكرَّر');

  -- القاعدة `do instead nothing` لا ترفع خطأً، بل تُلغي الأثر. فالفحصُ على
  -- البقاء لا على الاستثناء: تنفيذٌ ناجحٌ لا يغيّر شيئاً هو الرفضُ هنا.
  execute format('update export_offer_custody set place_name = ''مبدَّل'' where offer_id = %L', o);
  perform _eq((select place_name from export_offer_custody where offer_id = o and sequence = 1),
              'مزرعةُ المنشأ — كردفان',
              'والتعديلُ لا يمرّ — سلسلةٌ يمكن تعديلُها ليست سلسلةَ عهدة');

  execute format('delete from export_offer_custody where offer_id = %L', o);
  perform _eq((select count(*)::int from export_offer_custody where offer_id = o), 1,
              'والحذفُ كذلك');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) آلةُ الحالات'
\echo '=========================================================================='

do $$
declare o uuid;
begin
  select id into o from export_offers where reference = 'EXP-DEC';

  -- بهويّةِ مراجعٍ حقيقيّ: النشرُ يكتب reviewed_by من auth.uid()، والقيدُ
  -- يرفض منشوراً بلا مراجع. وهذا مقصود — منشورٌ لا يُعرف من نشره ليس مراجَعاً.
  perform _act_as('33333333-3333-3333-3333-333333333333');

  -- القفزُ فوق المراجعة هو الخطرُ كلُّه: لو جاز، لَنشر المزارعُ نفسَه.
  perform _refuses(format($f$update export_offers set status='published' where id=%L$f$, o),
                   'draft ← published مباشرةً');
  perform _refuses(format($f$update export_offers set status='rejected',
                            rejection_reason='سببٌ كافٍ للاختبار' where id=%L$f$, o),
                   'draft ← rejected');

  perform _accepts(format($f$update export_offers set status='submitted' where id=%L$f$, o),
                   'draft ← submitted');
  perform _eq((select submitted_at is not null from export_offers where id=o), true,
              'ووقتُ الإرسال يُختم في القاعدة لا في الشاشة');

  -- الرفضُ بلا سبب: القيدُ يمنعه، فلا يعود المزارعُ يخمّن ما أخطأ فيه.
  perform _refuses(format($f$update export_offers set status='rejected' where id=%L$f$, o),
                   'رفضٌ بلا سببٍ مكتوب');
  perform _refuses(format($f$update export_offers set status='rejected',
                            rejection_reason='لا' where id=%L$f$, o),
                   'وسببٌ من حرفين لا يكفي');

  perform _accepts(format($f$update export_offers set status='rejected',
                            rejection_reason='الشهادة البيطرية منتهية الصلاحية' where id=%L$f$, o),
                   'رفضٌ بسببٍ كافٍ');

  perform _accepts(format($f$update export_offers set status='draft' where id=%L$f$, o),
                   'rejected ← draft ليُصلَح');
  perform _eq((select rejection_reason from export_offers where id=o), null,
              'ويُمسح أثرُ المراجعة السابقة — فلا يبدو مراجَعاً بمراجعةِ نسخةٍ أخرى');

  perform _accepts(format($f$update export_offers set status='submitted' where id=%L$f$, o),
                   'ويُرسل ثانية');
  perform _accepts(format($f$update export_offers set status='published' where id=%L$f$, o),
                   'submitted ← published');
  perform _eq((select reviewed_at is not null from export_offers where id=o), true,
              'ووقتُ المراجعة مختوم');

  perform _refuses(format($f$update export_offers set status='submitted' where id=%L$f$, o),
                   'published ← submitted رجوعاً');

  -- السجلّ: draft→submitted→rejected→draft→submitted→published = خمسةُ انتقالات.
  -- والمحاولاتُ المرفوضةُ أعلاه لا تترك أثراً: الدالّةُ ترفع الاستثناء قبل
  -- الكتابة، فلا يمتلئ السجلّ بما لم يحدث.
  perform _eq((select count(*)::int from export_offer_events where offer_id=o), 5,
              'وكلُّ انتقالٍ مسجَّلٌ بمن ومتى');
  perform _eq((select reason from export_offer_events
                where offer_id=o and to_status='rejected'),
              'الشهادة البيطرية منتهية الصلاحية',
              'وسببُ الرفض محفوظٌ في السجلّ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح) تجميدُ المتطلّبات عند الإرسال'
\echo '=========================================================================='

do $$
declare o uuid; sheep uuid; frozen integer;
begin
  -- عرضُ الضأن مرّ draft→submitted في القسم السابق؟ لا — أُنشئ ولم يُرسل.
  -- نُنشئ عرضاً جديداً ونرسله لنرصد التجميد لحظةَ حدوثه.
  select cr.id into sheep from export_corridors cr
    join export_commodities co on co.id = cr.commodity_id
    join export_destinations d on d.id = cr.destination_id
   where co.code = 'live_sheep' and d.code = 'SA';

  perform _act_as('11111111-1111-1111-1111-111111111111');
  execute format($f$
    insert into export_offers (reference, owner_id, corridor_id,
      quantity, unit_price_minor, value_minor)
    values ('EXP-FREEZE', '11111111-1111-1111-1111-111111111111', %L,
            100, 12000, 1200000)
  $f$, sheep);

  select id into o from export_offers where reference = 'EXP-FREEZE';

  perform _eq((select requirements_frozen_at is null from export_offers where id=o), true,
              'المسوّدةُ بلا متطلّباتٍ مجمَّدة');
  perform _eq((select count(*)::int from export_offer_requirements where offer_id=o), 0,
              'ولا صفَّ لها');

  perform _accepts(format($f$update export_offers set status='submitted' where id=%L$f$, o),
                   'تُرسل');

  perform _eq((select requirements_frozen_at is not null from export_offers where id=o), true,
              'فيُختم وقتُ التجميد');

  select count(*)::int into frozen from export_offer_requirements where offer_id=o;
  -- الضأنُ إلى السعودية: سابر · فاتورة · قائمة تعبئة · شهادة بيطرية = ٤
  perform _eq(frozen, 4, 'وتُنسخ متطلّباتُ الممرّ السارية');

  perform _eq((select count(*)::int from export_offer_requirements
                where offer_id=o and document_type_id =
                  (select id from export_document_types where code='veterinary')),
              1, 'ومنها الشهادةُ البيطرية — وهي خاصّةٌ بالضأن لا بالوجهة');

  -- لائحةُ الغابات تسري على الوجهة الأوروبية لا السعودية، فلا تُنسخ هنا.
  perform _eq((select count(*)::int from export_offer_requirements
                where offer_id=o and document_type_id =
                  (select id from export_document_types where code='eudr_dds')),
              0, 'ولا تُنسخ لائحةُ الغابات — ممرُّها أوروبا لا السعودية');

  -- الأهمّ: النسخةُ لا تتغيّر بعد ذلك. تُحذف قاعدةُ الممرّ ويبقى ما جُمِّد.
  delete from export_corridor_requirements r
   using export_corridors cr, export_document_types dt
   where r.corridor_id = cr.id and cr.id = sheep
     and r.document_type_id = dt.id and dt.code = 'veterinary';

  perform _eq((select count(*)::int from export_offer_requirements where offer_id=o), 4,
              'وتبقى بعد حذف القاعدة من الممرّ — وهذا معنى التجميد كلُّه');
end $$;

-- تُلتقط المعرّفاتُ الآن، قبل تبديل الدور. فبعده تسري سياساتُ الصفوف على
-- الاستعلام نفسِه، و auth.uid() لم تُضبط بعد — فيعود البحثُ فارغاً وتُقارَن كلُّ
-- الفحوص التالية بـ NULL وتمرّ بلا معنى.
create table _ids as
  select
    (select id from export_offers where reference = 'EXP-SHEEP') as draft_offer,
    (select id from export_offers where reference = 'EXP-DEC')   as published_offer;

grant usage on schema public, auth to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant execute on all functions in schema public, auth to app_user;
grant usage, select on all sequences in schema public to app_user;


\echo ''
\echo '=========================================================================='
\echo 'ط) طلبُ الاهتمام — كتابةٌ عامةٌ على منشورٍ وحده'
\echo '=========================================================================='

-- بدورٍ عاديّ من هنا. المستخدمُ الخارقُ يتجاوز سياساتِ الصفوف، فسياسةُ الإدراج
-- — وهي الحارسُ كلُّه هنا — لا تُستشار أصلاً، ويمرّ الفحصُ وهو لا يفحص شيئاً.
set role app_user;

do $$
declare pub uuid; draft_o uuid;
begin
  select published_offer, draft_offer into pub, draft_o from _ids;

  perform _accepts(format($f$
    insert into export_offer_interests (offer_id, buyer_name, buyer_email, quantity_wanted, message)
    values (%L, 'Jan de Vries', 'jan@example.nl', 3.5, 'نريد عيّنة أولاً')
  $f$, pub), 'طلبٌ على عرضٍ منشور');

  -- الشرطُ الذي يجعل الجدول صندوقَ بريدٍ لا صندوقَ قمامة.
  perform _refuses(format($f$
    insert into export_offer_interests (offer_id, buyer_name, buyer_email)
    values (%L, 'Someone', 'x@example.com')
  $f$, draft_o), 'وطلبٌ على مسوّدةٍ لم يرها أحد');

  perform _refuses(format($f$
    insert into export_offer_interests (offer_id, buyer_name)
    values (%L, 'بلا وسيلة اتّصال')
  $f$, pub), 'وطلبٌ بلا بريدٍ ولا هاتف — نصٌّ لا يُردّ عليه');

  perform _refuses(format($f$
    insert into export_offer_interests (offer_id, buyer_name, buyer_email)
    values (%L, 'x', 'a@b.co')
  $f$, pub), 'واسمٌ من حرفٍ واحد');

  perform _refuses(format($f$
    insert into export_offer_interests (offer_id, buyer_name, buyer_email, quantity_wanted)
    values (%L, 'Buyer Two', 'b@example.com', 0)
  $f$, pub), 'وكمّيةٌ مطلوبةٌ صفر');

  -- المُرسِلُ لا يختار الحالة الابتدائية: طلبٌ يصل موسوماً «مُغلق» طلبٌ لا يراه أحد.
  perform _refuses(format($f$
    insert into export_offer_interests (offer_id, buyer_name, buyer_email, status)
    values (%L, 'Buyer Three', 'c@example.com', 'closed')
  $f$, pub), 'وطلبٌ يصل موسوماً «مُغلق»');

  -- والكاتبُ لا يقرأ ما كتب. نموذجٌ عامٌّ يُقرأ منه صندوقُ بريدٍ عام: يرى كلُّ
  -- مشترٍ بريدَ منافسيه وكمّياتِهم. والعددُ الفعليُّ لما دخل يفحصه القسمُ التالي
  -- بهويّة الإدارة — وهي الوحيدة التي تملك قراءته.
  perform _eq((select count(*)::int from export_offer_interests), 0,
              'ولا يقرأ المُرسِلُ ما أرسل — ولا ما أرسله غيرُه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) الصلاحيات — بدورٍ عاديّ، لا بالمالك'
\echo '=========================================================================='

set role app_user;

do $$
declare o uuid; pub uuid;
begin
  select draft_offer, published_offer into o, pub from _ids;

  perform _act_as('22222222-2222-2222-2222-222222222222');  -- مزارعٌ آخر
  perform _eq((select count(*)::int from export_offers where id = o), 0,
              'مزارعٌ آخر لا يرى مسوّدةَ غيره');
  perform _eq((select count(*)::int from export_offers where id = pub), 1,
              'ويرى المنشور — وهذا هو المقصود من النشر');

  -- الحدُّ الحقيقي: لو انفتح هذا لَما كان لزرّ «انشر» معنى.
  perform _changes_nothing(format($f$update export_offers set status='published' where id=%L$f$, o),
                   'ولا ينشر عرضَ غيره');

  perform _act_as('11111111-1111-1111-1111-111111111111');  -- صاحبُه
  perform _eq((select count(*)::int from export_offers where id = o), 1,
              'وصاحبُ العرض يراه');

  -- زرُّ «أرسل» يعمل، وزرُّ «انشر» لا. هذا هو الزرّان في القاعدة لا في الشاشة.
  perform _accepts(format($f$update export_offers set status='submitted' where id=%L$f$, o),
                   'ويُرسله');
  perform _changes_nothing(format($f$update export_offers set status='published' where id=%L$f$, o),
                   'ولا ينشره بنفسه');

  perform _act_as('33333333-3333-3333-3333-333333333333');  -- الإدارة
  perform _accepts(format($f$update export_offers set status='published' where id=%L$f$, o),
                   'والإدارةُ تنشره');

  -- طلباتُ المشترين: بريدٌ وهاتف. لا يقرؤها زائرٌ ولا مزارع.
  perform _act_as('22222222-2222-2222-2222-222222222222');
  perform _eq((select count(*)::int from export_offer_interests), 0,
              'ولا يقرأ أحدٌ طلباتِ المشترين إلا الإدارة');
  perform _act_as('33333333-3333-3333-3333-333333333333');
  perform _eq((select count(*)::int from export_offer_interests), 1,
              'والإدارةُ تقرؤها');
  perform _changes_nothing(
    'delete from export_offer_interests',
    'ولا حذف — الطلبُ الذي وصل يبقى، وهو أرخصُ بحثِ سوق');

  -- سجلٌّ يستطيع الفاعلُ الكتابةَ فيه سجلٌّ يستطيع تزويرَه.
  perform _refuses(format($f$
    insert into export_offer_events (offer_id, to_status, actor_id)
    values (%L, 'published', '11111111-1111-1111-1111-111111111111')
  $f$, o), 'ولا أحدَ يكتب في السجلّ يدوياً — ولا الإدارة');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then
    raise exception 'فشل % فحصاً.', n;
  end if;
  raise notice 'ALL CHECKS PASSED';
end $$;
