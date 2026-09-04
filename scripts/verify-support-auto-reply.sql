-- بوّابةُ الردّ الآلي: المهلةُ تُحترم، والإنسانُ يسبق الآلة دائماً.
--
-- WHY THE RACE IS THE CHECK THAT MATTERS
--
-- The delay is easy to get right and easy to test. The part that decides
-- whether this feature helps or embarrasses is what happens when an
-- administrator answers *while the model is thinking* — seconds after the queue
-- was read, before the reply is written. Get that wrong and a machine answer
-- lands underneath a human one, which is precisely what the delay exists to
-- prevent.
--
-- So the checks below do not merely read the queue. They read it, then simulate
-- a human replying, then try to write — the exact sequence the route performs.

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

-- WHY A REFUSAL IS NOT ENOUGH ON ITS OWN
--
-- Row-level security does not raise. A forbidden UPDATE matches no rows and
-- returns success, so `_refuses` cannot tell a policy that blocked the write
-- from one that never existed. This helper asserts on the row count instead —
-- the only signal that distinguishes them.
create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _pass(label || ' — رُفض صراحةً (' || sqlerrm || ')');
    return;
  end;
  if touched = 0 then perform _pass(label || ' — لم يمسّ صفّاً');
  else perform _fail(label, 'غيّر ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

insert into profiles (id, role) values
  ('33333333-3333-3333-3333-333333333333', 'admin')
on conflict (id) do nothing;

-- عيّناتٌ بأعمارٍ مختلفة. `created_at` يُكتب صراحةً لأنّ الاختبار عن الزمن.
insert into feedback (id, kind, body, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'problem',
   'الصفحة لا تفتح على جوّالي منذ الصباح', now() - interval '30 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'question',
   'كيف أرفع أدلّة الموسم؟', now() - interval '20 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'problem',
   'شكوى جديدة جداً', now() - interval '2 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'suggestion',
   'أقترح إضافة محصول البامية', now() - interval '3 hours');

\echo ''
\echo '=========================================================================='
\echo 'أ) الطابور — من استحقّ ردّاً'
\echo '=========================================================================='

do $$
declare ids uuid[];
begin
  select array_agg(id order by created_at) into ids
    from feedback_awaiting_auto_reply(50);

  perform _eq(array_length(ids, 1), 2, 'اثنتان فقط استحقّتا');

  perform _eq(
    ('aaaaaaaa-0000-0000-0000-000000000003' = any(ids)), false,
    'والحديثةُ (دقيقتان) لم تستحقّ — المهلةُ تُحترم');

  -- الاقتراحُ ليس شكوى ولا سؤالاً: لا ينتظر جواباً، فلا يُنفق عليه نداءُ نموذج.
  perform _eq(
    ('aaaaaaaa-0000-0000-0000-000000000004' = any(ids)), false,
    'والاقتراحُ خارج الأنواع — ولو مضت عليه ثلاث ساعات');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) السباق — الإنسانُ يسبق الآلة'
\echo '=========================================================================='

do $$
declare wrote boolean;
begin
  -- الحالةُ العادية: لم يردّ أحد.
  select record_feedback_auto_reply(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'وصلتنا رسالتك عن تعذّر فتح الصفحة، وسيراجعها موظّف.',
    'test-engine') into wrote;
  perform _eq(wrote, true, 'يُكتب الردُّ حين لا ردَّ قبله');

  perform _eq(
    (select ai_reply is not null from feedback
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), true,
    'والنصُّ محفوظ');
  perform _eq(
    (select ai_reply_engine from feedback
      where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'test-engine',
    'والمحرّكُ مسمّىً — فيُعرف من كتب');

  -- ولا يُكتب مرّتين، فلا يُنفق نداءان على رسالةٍ واحدة.
  select record_feedback_auto_reply(
    'aaaaaaaa-0000-0000-0000-000000000001', 'ردٌّ ثانٍ', 'test-engine') into wrote;
  perform _eq(wrote, false, 'ولا يُكتب ثانيةً على الرسالة نفسِها');

  -- **الفحصُ الذي يهمّ**: موظّفٌ ردّ بينما كان النموذج يفكّر.
  update feedback set admin_reply = 'عالجناها، والصفحة تعمل الآن.'
   where id = 'aaaaaaaa-0000-0000-0000-000000000002';

  select record_feedback_auto_reply(
    'aaaaaaaa-0000-0000-0000-000000000002',
    'ردٌّ آليٌّ وصل متأخّراً', 'test-engine') into wrote;
  perform _eq(wrote, false,
    'ولا يُكتب فوق ردّ إنسانٍ سبقه — وهذا سببُ المهلة كلِّه');

  perform _eq(
    (select ai_reply from feedback
      where id = 'aaaaaaaa-0000-0000-0000-000000000002'), null,
    'والعمودُ يبقى فارغاً، فلا يقرأ الزائرُ آلةً تحت موظّف');

  -- ومن ردَّ عليه إنسانٌ يخرج من الطابور أصلاً.
  perform _eq(
    (select count(*)::int from feedback_awaiting_auto_reply(50)), 0,
    'وطابورُ الانتظار فرغ');

  perform _refuses(
    $f$select record_feedback_auto_reply(
        'aaaaaaaa-0000-0000-0000-000000000003', '   ', 'x')$f$,
    'وردٌّ فارغٌ يُرفض — عمودٌ فيه فراغ يبدو ردّاً وليس به شيء');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) السياسة — بياناتٌ يضبطها المدير'
\echo '=========================================================================='

do $$
begin
  perform _eq((select count(*)::int from support_policy), 1, 'صفٌّ واحد');

  perform _refuses(
    'insert into support_policy (id) values (true)',
    'ولا صفَّ ثانٍ — سياستان تعنيان جوابين لسؤالٍ واحد');

  perform _refuses(
    $f$update support_policy set auto_reply_after = interval '0 minutes'$f$,
    'ولا مهلةَ صفر — ذلك ردٌّ فوريّ، وهو ما وُضعت المهلةُ لتفاديه');

  perform _refuses(
    $f$update support_policy set auto_reply_after = interval '3 days'$f$,
    'ولا مهلةٌ تُنسي الميزةَ نفسَها');

  -- وتغييرُها يغيّر الطابور فوراً، بلا نشر.
  update support_policy set auto_reply_after = interval '1 minute';
  perform _eq((select count(*)::int from feedback_awaiting_auto_reply(50)), 1,
    'وخفضُها يُدخل الحديثةَ الطابورَ — قاعدةُ عملٍ في صفٍّ لا في كود');

  update support_policy set enabled = false;
  perform _eq((select count(*)::int from feedback_awaiting_auto_reply(50)), 0,
    'وإطفاؤها يوقف كلَّ شيء');

  update support_policy set enabled = true, auto_reply_after = interval '15 minutes';
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الأبواب — الزائرُ لا يكتب ردوداً باسم المنصّة'
\echo '=========================================================================='

-- WHY THIS SECTION NAMES anon AND authenticated, NOT A ROLE OF ITS OWN
--
-- A test that grants EXECUTE to a role it invented, revokes it again, and then
-- observes a refusal has proved that PostgreSQL honours REVOKE. It has proved
-- nothing about this migration. The roles that actually reach these functions
-- are Supabase's own — `anon` carries the key published in every page of the
-- site — and the only thing standing between them and the queue is the REVOKE
-- written in the migration itself. So that is what is exercised here.
--
-- The grants below are the ones Supabase gives those roles by default: schema
-- usage and full table privileges, with row-level security doing the filtering.
-- They are deliberately generous, so that if these checks pass it is the
-- function ACL that closed the door and nothing else.
--
-- `auth` is granted too, and that is not a detail. Without it `auth.uid()`
-- raises inside `is_admin()`, every policy that calls it errors, and the checks
-- below go green on "permission denied for schema auth" — a refusal that has
-- nothing to do with the policy being tested and does not exist in production.
-- That is precisely how a gate passes while guarding nothing.
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

set role anon;

do $$
begin
  -- الطابورُ يكشف نصَّ كلِّ شكوى لم يردّ عليها أحد — بريدَ الشاكي وصفحتَه
  -- وشكواه. وهو مفتوحٌ افتراضياً: PostgreSQL يمنح EXECUTE لـ PUBLIC على كلّ
  -- دالّةٍ جديدة، فالسطرُ الذي يسحبه في الهجرة هو الباب كلُّه.
  perform _refuses('select feedback_awaiting_auto_reply(5)',
    'وزائرٌ بالمفتاح العلنيّ لا يقرأ طابورَ الشكاوى');
  perform _refuses(
    $f$select record_feedback_auto_reply(
        'aaaaaaaa-0000-0000-0000-000000000003', 'ردّ ملفّق', 'x')$f$,
    'ولا يكتب ردّاً باسم المنصّة — والدالّةُ security definer، فلو نُفِّذت لكُتب');
  perform _eq((select count(*)::int from support_policy), 1,
    'ويقرأ السياسةَ — الصفحةُ تعده بمهلةٍ فليعرفها');

  -- ويقرؤها فقط. الجدولُ يُمنح لـ anon كاملاً بحكم صلاحيات Supabase
  -- الافتراضية، فالحارسُ الوحيدُ هو سياسةُ الصفوف — وهي تمنع بصمت، فلا يكفي
  -- ألّا يُرفع خطأ.
  perform _changes_nothing(
    'update support_policy set enabled = false',
    'ولا يُطفئ الميزةَ — إطفاؤها بصمتٍ يُسكت الردود ولا يشكو أحد');
  perform _changes_nothing(
    $f$update support_policy set auto_reply_after = interval '24 hours'$f$,
    'ولا يمدّ المهلةَ حتى تُنسى');
  perform _eq((select enabled from support_policy), true,
    'والسياسةُ كما تركها المدير');
end $$;

reset role;
set role authenticated;

-- ومَن سجّل دخوله ليس أقربَ إلى هذا من الزائر: الحسابُ يفتح ما يخصّ صاحبَه،
-- لا طابورَ شكاوى الناس.
do $$
begin
  perform _refuses('select feedback_awaiting_auto_reply(5)',
    'ومَن سجّل دخوله لا يقرأ الطابورَ أيضاً');
  perform _refuses(
    $f$select record_feedback_auto_reply(
        'aaaaaaaa-0000-0000-0000-000000000003', 'ردّ ملفّق', 'x')$f$,
    'ولا يكتب ردّاً باسم المنصّة');
end $$;

reset role;

-- والخادمُ الموثوق وحده يفتحهما — وإلّا فالميزةُ مغلقةٌ في وجه نفسِها.
do $$
begin
  perform _eq(
    has_function_privilege('service_role',
      'public.feedback_awaiting_auto_reply(integer)', 'execute'),
    true, 'والخادمُ الموثوق يقرأ الطابور');
  perform _eq(
    has_function_privilege('service_role',
      'public.record_feedback_auto_reply(uuid, text, text)', 'execute'),
    true, 'ويكتب الردّ');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED';
end $$;
