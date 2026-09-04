-- بوّابةُ عمليّة المال: تُرجع ما حدث، وتقيّده، ولا يُمحى ما قُيّد.
--
-- WHAT THIS GATE IS REALLY ABOUT
--
-- Not the happy path. Confirming an investment that can be confirmed is the
-- easy case and it was never broken.
--
-- The check that matters is the one that was silently wrong for the whole life
-- of this function: confirming something that is **not** confirmable — deleted,
-- already confirmed, cancelled — returned void with no error, and the screen
-- told an administrator it had worked. So the sections below spend most of
-- their weight on refusals: that each one is distinguishable from success, that
-- each one is written down, and that pressing the button twice does not sell
-- the same shares twice.

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

-- سياسةُ الصفوف تمنع بصمتٍ لا بخطأ، فغيابُ الخطأ ليس دليلَ منع. هذا الفاحصُ
-- يحكم بعدد الصفوف — وهو الإشارةُ الوحيدةُ التي تفرّق بين سياسةٍ منعت وسياسةٍ
-- لم توجد أصلاً.
create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _pass(label || ' — رُفض صراحةً');
    return;
  end;
  if touched = 0 then perform _pass(label || ' — لم يمسّ صفّاً');
  else perform _fail(label, 'غيّر ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- ── العيّنات ──────────────────────────────────────────────────────────────
insert into profiles (id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'موظّف المراجعة', 'admin'),
  ('b0000000-0000-0000-0000-00000000000b', 'مستثمر أوّل',   'investor'),
  ('c0000000-0000-0000-0000-00000000000c', 'مستثمر ثانٍ',   'investor')
on conflict (id) do nothing;

-- مشروعٌ فيه ١٠٠ حصة، بيعت منها ٩٠. فالمتبقّي ١٠ — وهو العددُ الذي تدور عليه
-- فحوصُ التخصيص كلُّها.
insert into projects
  (id, slug, name, location, total_feddans, price_per_share, total_shares, shares_sold)
values
  ('11111111-0000-0000-0000-000000000001', 'gezira-sesame', 'سمسم الجزيرة',
   'ولاية الجزيرة', 250, 500, 100, 90);

insert into investments (id, project_id, investor_id, shares, amount, status) values
  -- تمرّ: ٨ من ١٠ المتبقّية
  ('22222222-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-00000000000b', 8, 4000, 'pending'),
  -- تتجاوز: ٤٠ والمتبقّي بعد الأولى ٢
  ('22222222-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000c', 40, 20000, 'pending'),
  -- مؤكَّدةٌ سلفاً — الطريقُ الصامتُ سابقاً
  ('22222222-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-00000000000b', 1, 500, 'confirmed');

\echo ''
\echo '=========================================================================='
\echo 'أ) التفويض — والدالّةُ مالٌ لا استعلام'
\echo '=========================================================================='

do $$
begin
  perform _act_as('b0000000-0000-0000-0000-00000000000b');   -- مستثمر، لا مدير
  perform _refuses(
    $f$select confirm_investment('22222222-0000-0000-0000-000000000001')$f$,
    'مستثمرٌ لا يؤكّد استثمارَ نفسِه');

  -- ولم يُقيَّد شيء: سجلٌّ يستطيع الغريبُ إغراقَه يفقد قيمتَه ساعةَ يُحتاج إليه.
  perform _eq((select count(*)::int from investment_events), 0,
    'ومحاولتُه لا تملأ سجلَّ التدقيق');

  perform _act_as(null);
  perform _refuses(
    $f$select confirm_investment('22222222-0000-0000-0000-000000000001')$f$,
    'وزائرٌ بلا هويّةٍ كذلك');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الرفضُ يُميَّز عن النجاح — وهذا سببُ الهجرة كلِّه'
\echo '=========================================================================='

do $$
declare r text;
begin
  perform _act_as('a0000000-0000-0000-0000-00000000000a');   -- مدير

  -- استثمارٌ لا وجود له. كان يُرجع void بلا خطأ، فتقرؤه الشاشةُ نجاحاً.
  select confirm_investment('22222222-0000-0000-0000-0000000000ff') into r;
  perform _eq(r, 'not_found', 'غيرُ الموجود يُسمّى، لا يُسكت عنه');

  -- ومؤكَّدٌ سلفاً: زرٌّ ضُغط مرّتين.
  select confirm_investment('22222222-0000-0000-0000-000000000003') into r;
  perform _eq(r, 'not_pending', 'والمؤكَّدُ سلفاً يُسمّى — لا «تمّ» مرّتين');

  perform _eq(
    (select count(*)::int from investment_events
      where investment_id = '22222222-0000-0000-0000-000000000003'
        and outcome = 'not_pending'), 1,
    'ومحاولتُه مقيَّدة — الضغطُ المكرَّر خبرٌ لا صمت');

  -- ولم تُمسّ أرقامُ المشروع.
  perform _eq((select shares_sold from projects
                where id = '11111111-0000-0000-0000-000000000001'), 90,
    'ولم يتحرّك المباع');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) النجاح — ويُقيَّد بما قبله وما بعده'
\echo '=========================================================================='

do $$
declare r text;
begin
  select confirm_investment('22222222-0000-0000-0000-000000000001') into r;
  perform _eq(r, 'confirmed', 'ما يمكن تأكيدُه يُؤكَّد');

  perform _eq((select status::text from investments
                where id = '22222222-0000-0000-0000-000000000001'), 'confirmed',
    'وحالةُ الطلب تغيّرت');

  perform _eq((select shares_sold from projects
                where id = '11111111-0000-0000-0000-000000000001'), 98,
    'والمباعُ صار ٩٨ — ٩٠ زائد ٨');

  -- «قبل» و«بعد» في الصفّ نفسِه: بدونهما لا يُعاد بناءُ ما جرى إلّا بالتخمين.
  perform _eq(
    (select shares_sold_before || '→' || shares_sold_after
       from investment_events
      where investment_id = '22222222-0000-0000-0000-000000000001'
        and outcome = 'confirmed'), '90→98',
    'والسجلُّ يحمل الرقمَ قبلها وبعدها');

  perform _eq(
    (select actor_id from investment_events
      where investment_id = '22222222-0000-0000-0000-000000000001'
        and outcome = 'confirmed'),
    'a0000000-0000-0000-0000-00000000000a'::uuid,
    'ويحمل الفاعلَ — مأخوذاً من الجلسة لا من وسيط');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) لا يُباع ما لا يُملك — ولا يُؤكَّد مرّتين'
\echo '=========================================================================='

do $$
declare r text;
begin
  -- ٤٠ حصة والمتبقّي ٢.
  select confirm_investment('22222222-0000-0000-0000-000000000002') into r;
  perform _eq(r, 'over_allocated', 'ما يتجاوز المتاح يُرفض');

  perform _eq((select shares_sold from projects
                where id = '11111111-0000-0000-0000-000000000001'), 98,
    'ولم يُبَع شيء');

  perform _eq((select status::text from investments
                where id = '22222222-0000-0000-0000-000000000002'), 'pending',
    'والطلبُ يبقى معلّقاً — لم يُحرق');

  -- والرفضُ مقيَّدٌ بسببه: هذه أنفعُ صفوف الجدول، فهي تقول إنّ الطلب فاق المعروض.
  perform _eq(
    (select reason from investment_events
      where investment_id = '22222222-0000-0000-0000-000000000002'),
    'طُلبت 40 حصة والمتبقّي 2 من أصل 100',
    'وسببُ الرفض محفوظٌ بالأرقام');

  -- التكرار: الطلبُ الأوّل أُكِّد، فإعادةُ تأكيده لا تبيع ثمانياً أخرى.
  select confirm_investment('22222222-0000-0000-0000-000000000001') into r;
  perform _eq(r, 'not_pending', 'وإعادةُ تأكيد ما أُكِّد تُرفض');
  perform _eq((select shares_sold from projects
                where id = '11111111-0000-0000-0000-000000000001'), 98,
    'ولا تبيع الحصصَ ثانيةً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) السجلُّ يُضاف إليه ولا يُمحى'
\echo '=========================================================================='

do $$
begin
  -- أربعة: مؤكَّدٌ سلفاً · نجاح · تجاوز · وإعادةُ تأكيدِ ما أُكِّد.
  perform _eq((select count(*)::int from investment_events), 4,
    'أربعةُ أحداث — والمحاولاتُ الفاشلةُ منها ثلاث');

  -- ويرفع خطأً ولا يبتلع الأمر صامتاً: محاولةُ التعديل نفسُها خبر.
  perform _refuses(
    $f$update investment_events set outcome = 'confirmed'
        where outcome = 'over_allocated'$f$,
    'ولا يُعدَّل — ولا بيد المدير');
  perform _refuses(
    'delete from investment_events',
    'ولا يُحذف');

  perform _eq((select count(*)::int from investment_events
                where outcome = 'over_allocated'), 1,
    'والصفُّ المرفوض ما يزال كما كُتب');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) الأبواب'
\echo '=========================================================================='

-- المنحُ كما تمنحه Supabase افتراضياً: استعمالُ المخطّطين وكاملُ صلاحيات
-- الجداول، وحمايةُ الصفوف هي المرشِّح. و`auth` تُمنح أيضاً، وإلّا لرفع
-- `auth.uid()` خطأً داخل `is_admin()` فيُقرأ الرفضُ نجاحاً — وهو رفضٌ لا وجود
-- له في الإنتاج.
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- WHY THE PRIVILEGE IS ASSERTED DIRECTLY AND NOT ONLY THROUGH A REFUSAL
--
-- Both roles below are refused, and for **different** reasons: `anon` never
-- reaches the body because the grant was revoked, while `authenticated` runs
-- the body and is thrown out by `is_admin()`. A refusal alone cannot tell those
-- apart — it would report a pass even if the grant had silently vanished and
-- only the inner check remained, which is one layer of defence, not two.
do $$
begin
  perform _eq(
    has_function_privilege('anon', 'public.confirm_investment(uuid)', 'execute'),
    false, 'البابُ مغلقٌ أمام anon — ولا يبلغ الجسمَ أصلاً');
  perform _eq(
    has_function_privilege('authenticated', 'public.confirm_investment(uuid)', 'execute'),
    true, 'ومفتوحٌ لمن سجّل دخوله — فالمديرُ نفسُه يحمل هذا الدور');
end $$;

-- والهويّةُ تُصفَّر أوّلاً. الكعبُ هنا: `auth.uid()` في هذه القاعدة يقرأ جدولاً،
-- لا رمزَ دخول — فلو بقيت هويّةُ المدير من القسم السابق لعادت `is_admin()`
-- صادقةً ونحن ندّعي أنّنا زائر، ولمرّت فحوصُ الأبواب على وهم.
do $$ begin perform _act_as(null); end $$;

set role anon;
do $$
begin
  perform _refuses(
    $f$select confirm_investment('22222222-0000-0000-0000-000000000002')$f$,
    'زائرٌ بالمفتاح العلنيّ لا ينادي دالّةَ المال');
  perform _eq((select count(*)::int from investment_events), 0,
    'ولا يقرأ سجلَّ التدقيق — فيه مبالغُ ومحاولاتُ مستثمرين');
end $$;
reset role;

-- ومَن سجّل دخوله وليس مديراً.
do $$ begin perform _act_as('c0000000-0000-0000-0000-00000000000c'); end $$;

set role authenticated;
do $$
begin
  -- يُنادى، ثمّ يُرفض من الداخل: الحارسُ `is_admin()` لا بابُ الصلاحيات.
  perform _refuses(
    $f$select confirm_investment('22222222-0000-0000-0000-000000000002')$f$,
    'ومَن سجّل دخوله ينفّذها لكنّها ترفضه — الحارسُ في الجسم');
  perform _eq((select count(*)::int from investment_events), 0,
    'ولا يقرأ السجلَّ ما لم يكن مديراً');

  -- ولا يكتب فيه: لا سياسةَ كتابةٍ لأحد، والصفوفُ من الدالّة وحدها.
  perform _changes_nothing(
    $f$insert into investment_events (investment_id, outcome)
       values ('22222222-0000-0000-0000-000000000002', 'confirmed')$f$,
    'ولا يلفّق حدثاً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED';
end $$;
